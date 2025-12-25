import os
import time
import io
import logging
import json
import warnings
import random
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
    # Các cờ quan trọng để ẩn mình trên Render
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1366,768")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled") # Quan trọng
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-popup-blocking")
    
    # Fake ngôn ngữ để giống người dùng thật
    chrome_options.add_argument("--lang=vi-VN")

    chrome_binary_path = os.path.join(chrome_bin_dir, "google-chrome")
    if os.path.exists(chrome_binary_path):
        chrome_options.binary_location = chrome_binary_path

    try:
        service = Service(ChromeDriverManager(chrome_type=ChromeType.GOOGLE).install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # --- KỸ THUẬT MỚI: Dùng CDP để Fake User-Agent sâu hơn ---
        if user_agent:
            driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": user_agent,
                "platform": "Windows"
            })
        
        # Xóa thuộc tính webdriver (để Cloudflare không biết là robot)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        return driver
    except Exception as e:
        logger.error(f"❌ Lỗi Driver: {str(e)}")
        return None

def add_cookies(driver, cookie_str, url):
    if not cookie_str: return
    try:
        driver.get(url) # Mở trang 1 lần để tạo session
        time.sleep(3)
        
        cookies = cookie_str.split(';')
        for item in cookies:
            if '=' in item:
                parts = item.strip().split('=', 1)
                if len(parts) == 2:
                    name, value = parts
                    # Chỉ thêm cookie quan trọng, bỏ qua mấy cái rác
                    try: driver.add_cookie({'name': name, 'value': value})
                    except: pass
        
        logger.info("🍪 Đã nạp Cookie, đang refresh...")
        driver.refresh()
        time.sleep(5) # Đợi lâu chút sau khi nạp cookie
    except Exception as e:
        logger.error(f"Lỗi nạp cookie: {e}")

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
        else:
             # Nếu không có cookie, thử vào thẳng xem vận may
             driver.get(story_url)
             time.sleep(5)

        # 2. Check xem còn bị chặn không
        title = driver.title
        logger.info(f"Page Title: {title}")

        if "Just a moment" in title or "Cloudflare" in title:
            driver.quit()
            return jsonify({'error': '🚨 VẪN BỊ CHẶN! \nLý do: Cookie cũ hoặc IP Server Render bị blacklist.\nGiải pháp: Lấy Cookie mới từ Tab Ẩn Danh trên PC.'})

        # 3. Lấy dữ liệu ngầm (JSON) - Cách an toàn nhất
        try:
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            script = soup.find('script', id='__NEXT_DATA__')
            chapters = []
            
            if script:
                data_json = json.loads(script.string)
                # Hàm tìm đệ quy key 'chapters'
                def find_chapters(obj):
                    if isinstance(obj, dict):
                        if 'chapters' in obj and isinstance(obj['chapters'], list):
                            return obj['chapters']
                        for k, v in obj.items():
                            res = find_chapters(v)
                            if res: return res
                    elif isinstance(obj, list):
                        for item in obj:
                            res = find_chapters(item)
                            if res: return res
                    return None

                raw_chapters = find_chapters(data_json)
                if raw_chapters:
                    for c in raw_chapters:
                        t = c.get('name') or c.get('title') or f"Chương {c.get('index')}"
                        s = c.get('slug') or c.get('id')
                        if s:
                            chapters.append({'title': t, 'url': f"https://metruyencv.com/truyen/{s}"})

            if len(chapters) > 0:
                driver.quit()
                return jsonify({'chapters': chapters, 'count': len(chapters)})

        except Exception as e:
            logger.error(f"Lỗi parse JSON: {e}")

        # 4. Nếu JSON tạch, thử quét HTML thường
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        links = soup.find_all('a', href=True)
        chapters = []
        seen = set()
        for link in links:
            href = link['href']
            txt = link.get_text(strip=True)
            if '/chuong-' in href and txt:
                if not href.startswith('http'): href = 'https://metruyencv.com' + href
                if href not in seen:
                    chapters.append({'title': txt, 'url': href})
                    seen.add(href)

        driver.quit()
        if len(chapters) == 0:
            return jsonify({'error': f'Web đã vào được nhưng không tìm thấy chương.\nTitle: {title}'})
            
        return jsonify({'chapters': chapters, 'count': len(chapters)})

    except Exception as e:
        if driver: driver.quit()
        return jsonify({'error': str(e)})

# --- Phần Streaming giữ nguyên ---
@app.route('/stream_scrape', methods=['POST'])
def stream_scrape():
    # ... (Giữ nguyên phần này như file cũ để tiết kiệm chỗ, chỉ cần sửa đoạn init_driver ở trên là nó tự ăn theo)
    data = request.json
    urls = data.get('chapter_urls', [])
    ua = data.get('user_agent')
    ck = data.get('cookie_str')
    api_key = os.environ.get('GEMINI_API_KEY') or data.get('api_key')

    if not api_key: return jsonify({'error': 'Chưa có API Key'})

    def generate():
        driver = init_driver(ua) # Nó sẽ dùng hàm init_driver mới
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        if ck and len(urls) > 0:
            from urllib.parse import urlparse
            d = '{uri.scheme}://{uri.netloc}/'.format(uri=urlparse(urls[0]))
            add_cookies(driver, ck, d)

        for i, url in enumerate(urls):
            yield json.dumps({'status': 'progress', 'msg': f'⏳ Đang xử lý chương {i+1}/{len(urls)}...'}) + "\n"
            
            # Logic cào (OCR)
            try:
                driver.get(url)
                time.sleep(3)
                if "Just a moment" in driver.title:
                    content = "[[BỊ CHẶN CLOUDFLARE]]"
                else:
                    # Chụp ảnh và OCR
                    total_height = driver.execute_script("return document.body.scrollHeight")
                    images = []
                    curr = 0
                    while curr < total_height and len(images) < 5: # Giảm số ảnh xuống 5 cho lẹ
                        driver.execute_script(f"window.scrollTo(0, {curr});")
                        time.sleep(1)
                        screenshot = driver.get_screenshot_as_png()
                        images.append(Image.open(io.BytesIO(screenshot)).convert('RGB'))
                        curr += 1500
                    
                    content = ""
                    if images:
                        try:
                            res = model.generate_content(["OCR Tiếng Việt. Chỉ lấy nội dung truyện.", *images])
                            content = res.text
                        except: content = "[[Lỗi AI]]"
                    else: content = "[[Lỗi ảnh]]"

            except Exception as e:
                content = f"[[Lỗi: {e}]]"

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
