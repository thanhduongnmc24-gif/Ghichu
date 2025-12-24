import os
import time
import io
import logging
import json
import warnings
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

warnings.filterwarnings("ignore")

# --- CẤU HÌNH CHROME CHO RENDER ---
chrome_bin_dir = "/opt/render/project/.render/chrome/opt/google/chrome"
if os.path.exists(chrome_bin_dir):
    os.environ["PATH"] += os.pathsep + chrome_bin_dir

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType
import google.generativeai as genai
from PIL import Image
from bs4 import BeautifulSoup

app = Flask(__name__, template_folder='templates')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- HÀM KHỞI TẠO DRIVER (Đã tối ưu bộ nhớ) ---
def init_driver(user_agent=None):
    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage") # Quan trọng cho Render
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1024,1600") # Giảm size ảnh để tiết kiệm RAM
    chrome_options.add_argument("--disable-extensions")
    
    if user_agent:
        chrome_options.add_argument(f'user-agent={user_agent}')

    chrome_binary_path = os.path.join(chrome_bin_dir, "google-chrome")
    if os.path.exists(chrome_binary_path):
        chrome_options.binary_location = chrome_binary_path

    try:
        service = Service(ChromeDriverManager(chrome_type=ChromeType.GOOGLE).install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        return driver
    except Exception as e:
        logger.error(f"❌ LỖI KHỞI TẠO DRIVER: {str(e)}")
        return None

def add_cookies(driver, cookie_str, url):
    if not cookie_str: return
    try:
        driver.get(url)
        time.sleep(2)
        cookies = cookie_str.split(';')
        for item in cookies:
            if '=' in item:
                name, value = item.strip().split('=', 1)
                try: driver.add_cookie({'name': name, 'value': value})
                except: pass
        driver.refresh()
        time.sleep(3)
    except Exception as e:
        logger.error(f"Lỗi cookie: {e}")

# --- API LẤY DANH SÁCH CHƯƠNG ---
@app.route('/get_chapters', methods=['POST'])
def get_chapters():
    data = request.json
    story_url = data.get('story_url')
    user_agent = data.get('user_agent')
    cookie_str = data.get('cookie_str')

    if not story_url:
        return jsonify({'error': 'Thiếu link truyện'})

    driver = init_driver(user_agent)
    if not driver:
        return jsonify({'error': 'Không bật được Chrome'})

    try:
        # Vào trang truyện để lấy list
        # Mẹo: Metruyencv thường có tab "Danh sách chương" hoặc load sẵn
        if cookie_str:
            from urllib.parse import urlparse
            parsed_uri = urlparse(story_url)
            domain = '{uri.scheme}://{uri.netloc}/'.format(uri=parsed_uri)
            add_cookies(driver, cookie_str, domain)

        logger.info(f"Đang tải mục lục: {story_url}")
        driver.get(story_url)
        time.sleep(5)

        # Lấy HTML phân tích bằng BeautifulSoup cho nhẹ
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Logic tìm link chương: Thường thẻ a có href chứa 'chuong-'
        chapters = []
        links = soup.find_all('a', href=True)
        
        seen_links = set()
        
        for link in links:
            href = link['href']
            title = link.get_text(strip=True)
            # Lọc link chương (logic tương đối, tùy web)
            if '/chuong-' in href and title and href not in seen_links:
                # Nếu link là tương đối
                if not href.startswith('http'):
                    href = 'https://metruyencv.com' + href
                
                chapters.append({'title': title, 'url': href})
                seen_links.add(href)

        driver.quit()
        return jsonify({'chapters': chapters, 'count': len(chapters)})

    except Exception as e:
        if driver: driver.quit()
        return jsonify({'error': str(e)})

# --- HÀM CÀO 1 CHƯƠNG (OCR) ---
def scrape_single_chapter_ocr(driver, url, model):
    try:
        logger.info(f"Đang xử lý: {url}")
        driver.get(url)
        time.sleep(3) # Chờ load

        # Check Cloudflare
        if "Just a moment" in driver.title:
            return "[Lỗi: Bị Cloudflare chặn. Hãy cập nhật Cookie mới]"

        # Chụp ảnh (giới hạn 10 ảnh thôi cho đỡ tốn quota Gemini Free)
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 1500
        images = []
        current_scroll = 0
        
        # Cuộn và chụp
        while current_scroll < total_height and len(images) < 10:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(1) 
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot)).convert('RGB')
            images.append(image)
            current_scroll += viewport_height

        if not images: return "[Lỗi: Không chụp được ảnh]"

        # Gửi AI
        full_text = ""
        batch_size = 3 # Gửi mỗi lần 3 ảnh
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = "OCR Tiếng Việt. Chỉ lấy nội dung truyện. Bỏ menu/quảng cáo. Trả về text thuần."
            try:
                res = model.generate_content([prompt, *batch])
                full_text += res.text + "\n"
            except:
                pass
        
        return full_text

    except Exception as e:
        return f"[Lỗi hệ thống: {str(e)}]"

# --- API STREAMING (CHẠY NHIỀU CHƯƠNG) ---
@app.route('/stream_scrape', methods=['POST'])
def stream_scrape():
    data = request.json
    chapter_urls = data.get('chapter_urls', []) # List các link cần cào
    user_agent = data.get('user_agent')
    cookie_str = data.get('cookie_str')
    api_key = os.environ.get('GEMINI_API_KEY') or data.get('api_key')

    if not api_key:
        return jsonify({'error': 'Thiếu API Key'})

    def generate():
        driver = init_driver(user_agent)
        if not driver:
            yield json.dumps({'status': 'error', 'msg': 'Lỗi Driver'}) + "\n"
            return

        # Setup Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        # Nạp cookie 1 lần đầu
        if cookie_str and len(chapter_urls) > 0:
            from urllib.parse import urlparse
            domain = '{uri.scheme}://{uri.netloc}/'.format(uri=urlparse(chapter_urls[0]))
            add_cookies(driver, cookie_str, domain)

        # Vòng lặp cào từng chương
        for idx, url in enumerate(chapter_urls):
            yield json.dumps({'status': 'progress', 'msg': f'⏳ Đang cào chương {idx+1}/{len(chapter_urls)}...'}) + "\n"
            
            content = scrape_single_chapter_ocr(driver, url, model)
            
            # Trả về kết quả từng chương ngay lập tức
            result_data = {
                'status': 'data',
                'chapter_index': idx,
                'url': url,
                'content': content
            }
            yield json.dumps(result_data) + "\n"
            
            # Nghỉ xíu để không bị ban và hồi quota AI
            time.sleep(2) 

        driver.quit()
        yield json.dumps({'status': 'done', 'msg': 'Hoàn thành!'}) + "\n"

    return Response(stream_with_context(generate()), mimetype='application/json')

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
