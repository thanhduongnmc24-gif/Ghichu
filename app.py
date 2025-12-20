import os
import time
import io
import logging
import warnings

# --- TẮT CẢNH BÁO GOOGLE AI ---
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

from flask import Flask, render_template, request, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import google.generativeai as genai
from PIL import Image

app = Flask(__name__, template_folder='templates')

# Cấu hình logging để xem lỗi trên Render dễ hơn
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_driver():
    """Khởi tạo Chrome với cấu hình tối ưu cho Render"""
    chrome_options = Options()
    
    # --- CÁC TÙY CHỌN BẮT BUỘC CHO SERVER LINUX ---
    chrome_options.add_argument("--headless=new") # Chạy ẩn chế độ mới
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage") # Tránh lỗi thiếu bộ nhớ chia sẻ
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-software-rasterizer")
    chrome_options.add_argument("--window-size=1024,1200")
    
    # Đường dẫn Chrome trên Render (khớp với file render-build.sh)
    chrome_path = "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome"
    
    # Kiểm tra xem file Chrome có tồn tại không
    if os.path.exists(chrome_path):
        logger.info(f"Đã tìm thấy Chrome tại: {chrome_path}")
        chrome_options.binary_location = chrome_path
    else:
        logger.warning("Không tìm thấy Chrome ở đường dẫn mặc định, sẽ thử để Selenium tự tìm...")

    try:
        # Tự động cài driver phù hợp
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        return driver
    except Exception as e:
        logger.error(f"LỖI KHỞI TẠO DRIVER CHI TIẾT: {str(e)}")
        # In thêm biến môi trường để debug nếu cần
        logger.error(f"PATH hiện tại: {os.environ.get('PATH')}")
        return None

def login_and_scrape(login_url, username, password, chapter_url, api_key):
    driver = init_driver()
    if not driver:
        return "Lỗi chí mạng: Không thể khởi động Chrome. Xem log server để biết chi tiết."

    try:
        # 1. Đăng nhập
        logger.info(f"Đang truy cập: {login_url}")
        driver.get(login_url)
        time.sleep(5) # Đợi trang load

        # Tìm ô đăng nhập (Thử nhiều kiểu tên khác nhau)
        try:
            user_input = driver.find_element(By.CSS_SELECTOR, "input[name*='user'], input[name*='email'], input[name*='login'], input[type='email']")
            pass_input = driver.find_element(By.CSS_SELECTOR, "input[name*='pass'], input[type='password']")
            
            user_input.send_keys(username)
            pass_input.send_keys(password)
            
            # Submit form
            # Thử tìm nút login trước
            try:
                btn_submit = driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")
                btn_submit.click()
            except:
                pass_input.submit()
                
            time.sleep(5) 
        except Exception as e:
            logger.error(f"Lỗi form đăng nhập: {str(e)}")
            driver.quit()
            return f"Không đăng nhập được. Web này cấu trúc lạ quá anh hai ơi. Lỗi: {str(e)}"

        # 2. Vào chương truyện
        logger.info(f"Đang vào chương: {chapter_url}")
        driver.get(chapter_url)
        time.sleep(5)

        # 3. Chụp ảnh (Có giới hạn để không nổ RAM)
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 1000 
        
        images = []
        current_scroll = 0
        max_images = 15 # Giảm xuống 15 ảnh cho an toàn RAM 512MB
        
        while current_scroll < total_height and len(images) < max_images:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(1.5) 
            
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot))
            images.append(image.convert('RGB')) # Convert nhẹ ảnh
            
            current_scroll += viewport_height

        driver.quit()
        logger.info(f"Đã chụp được {len(images)} ảnh.")

        # 4. Gửi cho Gemini AI
        logger.info("Đang gửi cho Gemini...")
        genai.configure(api_key=api_key)
        # Dùng model flash cho nhanh và rẻ
        model = genai.GenerativeModel('gemini-1.5-flash')

        full_text = ""
        
        # Gửi từng cụm nhỏ (3 ảnh một lần)
        batch_size = 3
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = "Chuyển đổi nội dung truyện trong các ảnh này thành văn bản tiếng Việt. Chỉ lấy nội dung truyện, bỏ qua quảng cáo/menu."
            try:
                response = model.generate_content([prompt, *batch])
                if response.text:
                    full_text += response.text + "\n"
            except Exception as e:
                logger.error(f"Lỗi Gemini đoạn {i}: {str(e)}")
                full_text += f"\n[Lỗi đoạn này: {str(e)}]\n"

        return full_text if full_text else "AI không trả về kết quả nào (Có thể do ảnh trắng hoặc lỗi)."

    except Exception as e:
        if driver: driver.quit()
        logger.error(f"Lỗi không xác định: {str(e)}")
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
        return jsonify({'error': 'Thiếu thông tin rồi anh hai!'})

    result_text = login_and_scrape(login_url, username, password, chapter_url, api_key)
    return jsonify({'result': result_text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
