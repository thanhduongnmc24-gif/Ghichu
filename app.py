import os
import time
import io
import logging
import warnings

warnings.filterwarnings("ignore")

chrome_bin_dir = "/opt/render/project/.render/chrome/opt/google/chrome"
if os.path.exists(chrome_bin_dir):
    os.environ["PATH"] += os.pathsep + chrome_bin_dir

from flask import Flask, render_template, request, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType
import google.generativeai as genai
from PIL import Image

app = Flask(__name__, template_folder='templates')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- INIT DRIVER CÓ THAM SỐ USER-AGENT ---
def init_driver(user_agent=None):
    """Khởi tạo Chrome với User-Agent giả danh"""
    chrome_options = Options()
    
    # Cấu hình cơ bản
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,2000")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled") # Quan trọng: Giấu việc đang dùng auto

    # --- GIẢ DANH USER-AGENT (CHÌA KHÓA ĐỂ QUA CLOUDFLARE) ---
    if user_agent:
        logger.info(f"🎭 Đang giả danh User-Agent: {user_agent[:30]}...")
        chrome_options.add_argument(f'user-agent={user_agent}')
    else:
        # User-Agent mặc định cho máy tính nếu không nhập
        chrome_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    chrome_binary_path = os.path.join(chrome_bin_dir, "google-chrome")
    if os.path.exists(chrome_binary_path):
        chrome_options.binary_location = chrome_binary_path

    try:
        service = Service(ChromeDriverManager(chrome_type=ChromeType.GOOGLE).install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Xóa dấu vết WebDriver
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        return driver
    except Exception as e:
        logger.error(f"❌ LỖI KHỞI TẠO DRIVER: {str(e)}")
        return None

def add_cookies_to_driver(driver, cookie_str, domain_url):
    try:
        logger.info("🍪 Đang nạp Cookie...")
        driver.get(domain_url)
        time.sleep(3) # Đợi lâu hơn xíu
        
        cookies = cookie_str.split(';')
        for item in cookies:
            if '=' in item:
                name, value = item.strip().split('=', 1)
                try:
                    driver.add_cookie({'name': name, 'value': value})
                except:
                    pass
        
        logger.info("✅ Đã nạp Cookie xong. Refresh...")
        driver.refresh()
        time.sleep(5) # Đợi trang load lại sau khi có cookie
    except Exception as e:
        logger.error(f"Lỗi thêm cookie: {e}")

def login_and_scrape(data):
    chapter_url = data.get('chapter_url')
    cookie_str = data.get('cookie_str')
    user_agent = data.get('user_agent') # Nhận User Agent từ FE
    
    api_key = data.get('api_key')
    if not api_key:
        api_key = os.environ.get('GEMINI_API_KEY')

    if not api_key:
        return "Lỗi: Chưa có API Key!"

    # Truyền User-Agent vào driver
    driver = init_driver(user_agent)
    if not driver:
        return "Lỗi Server: Không khởi động được Chrome."

    try:
        # --- CHIẾN THUẬT: USER-AGENT + COOKIE ---
        if cookie_str and len(cookie_str) > 10:
            from urllib.parse import urlparse
            parsed_uri = urlparse(chapter_url)
            domain = '{uri.scheme}://{uri.netloc}/'.format(uri=parsed_uri)
            
            add_cookies_to_driver(driver, cookie_str, domain)
        
        # --- VÀO TRUYỆN ---
        logger.info(f"📖 Đang truy cập chương: {chapter_url}")
        driver.get(chapter_url)
        time.sleep(8) # Cloudflare cần thời gian để check, đợi lâu chút

        # Kiểm tra tiêu đề xem có bị chặn không
        title = driver.title
        if "Just a moment" in title or "Attention Required" in title or "Cloudflare" in title:
            driver.quit()
            return "❌ VẪN BỊ CLOUDFLARE CHẶN!\nNguyên nhân: User-Agent hoặc Cookie chưa khớp.\nHãy đảm bảo bạn copy User-Agent từ CÙNG MỘT TRÌNH DUYỆT bạn lấy Cookie."

        # Chụp ảnh
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 1200 
        images = []
        current_scroll = 0
        max_images = 15
        
        logger.info("📸 Đang chụp ảnh...")
        while current_scroll < total_height and len(images) < max_images:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(2) # Tăng thời gian chờ load ảnh
            
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot))
            images.append(image.convert('RGB')) 
            current_scroll += viewport_height

        driver.quit()
        
        if not images:
            return "Lỗi: Không chụp được ảnh nào."

        # Gửi AI
        logger.info("🤖 Đang gửi cho AI...")
        genai.configure(api_key=api_key)
        
        # Thử Gemini 2.0 trước, fail thì về 1.5
        try:
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content("Test connection") # Test nhẹ
        except:
            model = genai.GenerativeModel('gemini-1.5-flash')

        full_text = ""
        batch_size = 4
        
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = """
            OCR Tiếng Việt:
            Trích xuất toàn bộ nội dung truyện chữ trong các ảnh này.
            Bỏ qua: Menu, Quảng cáo, Số trang, Tên web (Metruyencv).
            Chỉ lấy: Nội dung truyện. Ghép đoạn liền mạch.
            """
            try:
                response = model.generate_content([prompt, *batch])
                if response.text:
                    full_text += response.text + "\n"
            except Exception as e:
                full_text += f"\n[Lỗi đoạn này: {str(e)}]\n"

        return full_text

    except Exception as e:
        if driver: driver.quit()
        return f"Lỗi hệ thống: {str(e)}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    data = request.json
    return jsonify({'result': login_and_scrape(data)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
