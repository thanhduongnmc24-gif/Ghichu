import os
import time
import io
import logging
import json
import warnings
import re
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

warnings.filterwarnings("ignore")

# --- CẤU HÌNH CHO RENDER ---
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

def init_driver(user_agent=None):
    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080") # Màn hình to để load hết
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    
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
        logger.error(f"❌ Lỗi Driver: {str(e)}")
        return None

def add_cookies(driver, cookie_str, url):
    if not cookie_str: return
    try:
        driver.get(url)
        time.sleep(2)
        cookies = cookie_str.split(';')
        for item in cookies:
            if '=' in item:
                parts = item.strip().split('=', 1)
                if len(parts) == 2:
                    name, value = parts
                    try: driver.add_cookie({'name': name, 'value': value})
                    except: pass
        driver.refresh()
        time.sleep(3)
    except Exception as e:
        logger.error(f"Lỗi nạp cookie: {e}")

# --- TUYỆT CHIÊU MỚI: LẤY TỪ JSON ---
def extract_chapters_from_json(html_source):
    """Tìm dữ liệu ngầm Next.js (__NEXT_DATA__)"""
    try:
        soup = BeautifulSoup(html_source, 'html.parser')
        script = soup.find('script', id='__NEXT_DATA__')
        if not script: return []

        data = json.loads(script.string)
        # Cấu trúc thường gặp của Metruyencv: 
        # props -> pageProps -> initialState -> story -> chapters
        # Hoặc props -> pageProps -> story -> chapters
        
        # Tìm đệ quy các key có tên là 'chapters'
        def find_key(obj, key):
            if isinstance(obj, dict):
                if key in obj: return obj[key]
                for k, v in obj.items():
                    res = find_key(v, key)
                    if res: return res
            elif isinstance(obj, list):
                for item in obj:
                    res = find_key(item, key)
                    if res: return res
            return None

        chapters_data = find_key(data, 'chapters')
        
        results = []
        if chapters_data and isinstance(chapters_data, list):
            for c in chapters_data:
                # Tìm tiêu đề và slug/id
                title = c.get('name') or c.get('title') or f"Chương {c.get('index')}"
                slug = c.get('slug') or c.get('id')
                # Ghép link
                url = f"https://metruyencv.com/truyen/{slug}" if slug else None
                # Nếu url chưa chuẩn, thử ghép thủ công (cần sửa sau nếu lỗi)
                if url:
                    results.append({'title': title, 'url': url})
        
        return results
    except Exception as e:
        logger.error(f"Lỗi parse JSON: {e}")
        return []

@app.route('/get_chapters', methods=['POST'])
def get_chapters():
    data = request.json
    story_url = data.get('story_url')
    user_agent = data.get('user_agent')
    cookie_str = data.get('cookie_str')

    if not story_url: return jsonify({'error': 'Thiếu Link!'})

    driver = init_driver(user_agent)
    if not driver: return jsonify({'error': 'Lỗi khởi tạo Chrome.'})

    try:
        # 1. Nạp Cookie
        if cookie_str:
            from urllib.parse import urlparse
            domain = '{uri.scheme}://{uri.netloc}/'.format(uri=urlparse(story_url))
            add_cookies(driver, cookie_str, domain)

        logger.info(f"Đang vào: {story_url}")
        driver.get(story_url)
        time.sleep(5) 

        # 2. Check Cloudflare
        title = driver.title
        if "Just a moment" in title or "Cloudflare" in title:
            driver.quit()
            return jsonify({'error': f'🚨 Bị Cloudflare chặn! Title: {title}. Hãy check lại Cookie/User-Agent.'})

        # 3. CÁCH 1: LẤY DỮ LIỆU NGẦM (JSON) - Nhanh và chuẩn nhất
        html = driver.page_source
        chapters = extract_chapters_from_json(html)
        
        if len(chapters) > 0:
            logger.info(f"✅ Lấy được {len(chapters)} chương từ JSON ngầm.")
            driver.quit()
            return jsonify({'chapters': chapters, 'count': len(chapters)})

        # 4. CÁCH 2: NẾU JSON FAIL, DÙNG SELENIUM CLICK (Cổ điển)
        logger.info("⚠️ Không thấy JSON, chuyển sang chế độ Click thủ công...")
        
        # Thử click tab "Danh sách chương"
        try:
            driver.execute_script("""
                let tabs = document.querySelectorAll('a, button, div');
                for (let t of tabs) {
                    if (t.innerText && t.innerText.includes('Danh sách chương')) {
                        t.click();
                        break;
                    }
                }
            """)
            time.sleep(3)
        except: pass

        # Cuộn xuống cuối
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        links = soup.find_all('a', href=True)
        
        seen = set()
        for link in links:
            href = link['href']
            txt = link.get_text(strip=True)
            if ('/chuong-' in href) and txt:
                if not href.startswith('http'): href = 'https://metruyencv.com' + href
                if href not in seen:
                    chapters.append({'title': txt, 'url': href})
                    seen.add(href)

        if len(chapters) == 0:
            # DEBUG MODE: Trả về HTML để anh hai biết tại sao
            debug_html = soup.prettify()[:1000] # Lấy 1000 ký tự đầu
            driver.quit()
            return jsonify({'error': f'Vẫn tìm thấy 0 chương.\nTitle: {title}\nHTML (Debug): {debug_html}'})

        driver.quit()
        return jsonify({'chapters': chapters, 'count': len(chapters)})

    except Exception as e:
        if driver: driver.quit()
        return jsonify({'error': str(e)})

# --- HÀM CÀO 1 CHƯƠNG (Giữ nguyên hoặc tối ưu nhẹ) ---
def scrape_single_chapter_ocr(driver, url, model):
    try:
        driver.get(url)
        time.sleep(3)
        
        # Check chặn
        if "Just a moment" in driver.title: return "[[BỊ CHẶN]]"

        # Chụp ảnh (Tối đa 8 ảnh để đỡ lag)
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport = 1500
        images = []
        curr = 0
        while curr < total_height and len(images) < 8:
            driver.execute_script(f"window.scrollTo(0, {curr});")
            time.sleep(1)
            screenshot = driver.get_screenshot_as_png()
            images.append(Image.open(io.BytesIO(screenshot)).convert('RGB'))
            curr += viewport
        
        if not images: return "[[Lỗi ảnh]]"

        # Gửi AI
        text = ""
        batch = 3
        for i in range(0, len(images), batch):
            b_imgs = images[i:i+batch]
            try:
                res = model.generate_content(["OCR Tiếng Việt. Chỉ lấy nội dung truyện.", *b_imgs])
                text += res.text + "\n"
            except: pass
        return text
    except Exception as e:
        return f"[[Lỗi: {e}]]"

@app.route('/stream_scrape', methods=['POST'])
def stream_scrape():
    data = request.json
    urls = data.get('chapter_urls', [])
    ua = data.get('user_agent')
    ck = data.get('cookie_str')
    api_key = os.environ.get('GEMINI_API_KEY') or data.get('api_key')

    if not api_key: return jsonify({'error': 'Chưa có API Key'})

    def generate():
        driver = init_driver(ua)
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash') # Dùng bản Flash cho nhanh
        
        if ck and len(urls) > 0:
            from urllib.parse import urlparse
            d = '{uri.scheme}://{uri.netloc}/'.format(uri=urlparse(urls[0]))
            add_cookies(driver, ck, d)

        for i, url in enumerate(urls):
            yield json.dumps({'status': 'progress', 'msg': f'⏳ Đang xử lý chương {i+1}/{len(urls)}...'}) + "\n"
            content = scrape_single_chapter_ocr(driver, url, model)
            
            yield json.dumps({
                'status': 'data',
                'chapter_index': i,
                'url': url,
                'content': content
            }) + "\n"
            time.sleep(2) 

        driver.quit()
        yield json.dumps({'status': 'done', 'msg': 'Xong!'}) + "\n"

    return Response(stream_with_context(generate()), mimetype='application/json')

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
