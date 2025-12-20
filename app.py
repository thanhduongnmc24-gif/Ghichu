import os
import time
import io
import logging
import warnings

# --- 1. TẮT CẢNH BÁO ---
warnings.filterwarnings("ignore")

# --- 2. ÉP ĐƯỜNG DẪN CHROME VÀO HỆ THỐNG (FIX LỖI PATH) ---
# Đây là chìa khóa để sửa lỗi của anh hai
chrome_bin_dir = "/opt/render/project/.render/chrome/opt/google/chrome"
os.environ["PATH"] += os.pathsep + chrome_bin_dir

from flask import Flask, render_template, request, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType # Thêm cái này
import google.generativeai as genai
from PIL import Image

app = Flask(__name__, template_folder='templates')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_driver():
    """Khởi tạo Chrome với cấu hình 'trâu bò' cho Render"""
    chrome_options = Options()
    
    # --- CẤU HÌNH CHROME ---
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,1080")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-infobars")
    
    # Đường dẫn file chạy Chrome (Binary)
    chrome_binary_path = os.path.join(chrome_bin_dir, "google-chrome")
    
    if os.path.exists(chrome_binary_path):
        logger.info(f"✅ Đã tìm thấy Chrome tại: {chrome_binary_path}")
        chrome_options.binary_location = chrome_binary_path
    else:
        logger.error(f"❌ Không tìm thấy Chrome tại {chrome_binary_path}")
        return None

    try:
        # --- FIX LỖI SESSION NOT CREATED ---
        # Tự động tải Driver khớp với version Chrome đã cài
        logger.info("Đang cài đặt ChromeDriver...")
        service = Service(ChromeDriverManager(chrome_type=ChromeType.GOOGLE).install())
        
        driver = webdriver.Chrome(service=service, options=chrome_options)
        logger.info("🚀 Khởi động Chrome thành công!")
        return driver
    except Exception as e:
        logger.error(f"LỖI KHỞI TẠO DRIVER: {str(e)}")
        # In version chrome ra để debug nếu cần
        try:
            version = os.popen(f"{chrome_binary_path} --version").read().strip()
            logger.error(f"Version Chrome hiện tại: {version}")
        except:
            pass
        return None

def login_and_scrape(login_url, username, password, chapter_url, api_key):
    driver = init_driver()
    if not driver:
        return "Lỗi Server: Không bật được trình duyệt. Vui lòng xem log."

    try:
        # 1. Đăng nhập
        logger.info(f"Đang vào login: {login_url}")
        driver.get(login_url)
        time.sleep(3) 

        # Tìm ô đăng nhập (Thử nhiều kiểu tên khác nhau)
        try:
            # Tìm input user
            user_input = driver.find_element(By.CSS_SELECTOR, "input[name*='user'], input[name*='email'], input[name*='login'], input[type='text']")
            # Tìm input password
            pass_input = driver.find_element(By.CSS_SELECTOR, "input[name*='pass'], input[type='password']")
            
            user_input.send_keys(username)
            pass_input.send_keys(password)
            
            # Submit (Enter)
            pass_input.submit()
            logger.info("Đã submit form đăng nhập")
            time.sleep(5) 
        except Exception as e:
            logger.warning(f"Đăng nhập tự động thất bại (có thể web ko cần login hoặc sai ID): {e}")
            # Vẫn cho chạy tiếp, lỡ đâu truyện không cần login vẫn xem được

        # 2. Vào chương truyện
        logger.info(f"Đang vào chương: {chapter_url}")
        driver.get(chapter_url)
        time.sleep(5)

        # 3. Chụp ảnh
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 1000 
        
        images = []
        current_scroll = 0
        max_images = 10 # Giảm xuống 10 để an toàn tuyệt đối cho RAM
        
        while current_scroll < total_height and len(images) < max_images:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(1) 
            
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot))
            images.append(image.convert('RGB')) 
            
            current_scroll += viewport_height

        driver.quit()
        
        if not images:
            return "Lỗi: Không chụp được ảnh nào (Trang trắng hoặc chưa load xong)."

        # 4. Gửi cho Gemini AI
        logger.info(f"Đang gửi {len(images)} ảnh cho Gemini...")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        full_text = ""
        batch_size = 3
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = "Chuyển đổi toàn bộ nội dung văn bản tiếng Việt trong các ảnh này thành text. Bỏ qua quảng cáo. Chỉ trả về nội dung truyện."
            try:
                response = model.generate_content([prompt, *batch])
                if response.text:
                    full_text += response.text + "\n"
            except Exception as e:
                full_text += f"\n[Lỗi AI đoạn {i}: {str(e)}]\n"

        return full_text

    except Exception as e:
        if driver: driver.quit()
        logger.error(f"Lỗi hệ thống: {str(e)}")
        return f"Lỗi hệ thống: {str(e)}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    data = request.json
    api_key = data.get('api_key')
    login_url = data.get('login_url')
    username = data.get('username')
    password = data.get('password')
    chapter_url = data.get('chapter_url')

    if not api_key or not chapter_url:
        return jsonify({'error': 'Thiếu API Key hoặc Link truyện!'})

    result_text = login_and_scrape(login_url, username, password, chapter_url, api_key)
    return jsonify({'result': result_text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
