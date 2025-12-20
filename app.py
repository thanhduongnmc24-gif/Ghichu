import os
import time
import io
import logging
import warnings

# --- 1. TẮT CẢNH BÁO KHÔNG CẦN THIẾT ---
warnings.filterwarnings("ignore")

# --- 2. ÉP ĐƯỜNG DẪN CHROME VÀO HỆ THỐNG (FIX LỖI RENDER) ---
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

# Cấu hình log
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CẤU HÌNH KHỞI TẠO TRÌNH DUYỆT ---
def init_driver():
    """Khởi tạo Chrome với cấu hình tối ưu cho Render"""
    chrome_options = Options()
    
    # Các cờ bắt buộc cho môi trường Server Linux không màn hình
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,2000") # Mở cửa sổ dài để load ảnh
    chrome_options.add_argument("--disable-extensions")
    
    # Đường dẫn file chạy Chrome (Binary)
    chrome_binary_path = os.path.join(chrome_bin_dir, "google-chrome")
    
    # Kiểm tra xem Chrome có ở đúng chỗ không
    if os.path.exists(chrome_binary_path):
        logger.info(f"✅ Tìm thấy Chrome tại: {chrome_binary_path}")
        chrome_options.binary_location = chrome_binary_path
    else:
        logger.warning(f"⚠️ Không tìm thấy Chrome tại {chrome_binary_path}, Selenium sẽ tự tìm.")

    try:
        # Tự động tải Driver khớp với version Chrome
        logger.info("🛠 Đang cài đặt ChromeDriver...")
        service = Service(ChromeDriverManager(chrome_type=ChromeType.GOOGLE).install())
        
        driver = webdriver.Chrome(service=service, options=chrome_options)
        logger.info("🚀 Khởi động Chrome thành công!")
        return driver
    except Exception as e:
        logger.error(f"❌ LỖI KHỞI TẠO DRIVER: {str(e)}")
        return None

# --- HÀM XỬ LÝ COOKIE ---
def add_cookies_to_driver(driver, cookie_str, domain_url):
    """Tiêm cookie vào trình duyệt để bỏ qua đăng nhập"""
    try:
        logger.info("🍪 Đang xử lý Cookie...")
        driver.get(domain_url) # Phải vào domain trước mới set được cookie
        time.sleep(2)
        
        cookies = cookie_str.split(';')
        count = 0
        for item in cookies:
            if '=' in item:
                name, value = item.strip().split('=', 1)
                try:
                    driver.add_cookie({'name': name, 'value': value})
                    count += 1
                except:
                    pass
        
        logger.info(f"✅ Đã thêm {count} cookie. Refresh trang...")
        driver.refresh()
        time.sleep(3)
    except Exception as e:
        logger.error(f"Lỗi thêm cookie: {e}")

# --- HÀM LOGIC CHÍNH ---
def login_and_scrape(data):
    # Lấy thông tin từ request hoặc biến môi trường
    login_url = data.get('login_url')
    username = data.get('username')
    password = data.get('password')
    chapter_url = data.get('chapter_url')
    cookie_str = data.get('cookie_str')
    
    # Ưu tiên lấy Key từ FE gửi lên, nếu không có thì lấy từ biến môi trường Render
    api_key = data.get('api_key')
    if not api_key:
        api_key = os.environ.get('GEMINI_API_KEY')

    if not api_key:
        return "Lỗi: Chưa có API Key (Vui lòng nhập hoặc cài biến môi trường GEMINI_API_KEY)"

    driver = init_driver()
    if not driver:
        return "Lỗi Server: Không khởi động được Chrome. Vui lòng xem log Server."

    try:
        # --- CHIẾN THUẬT 1: DÙNG COOKIE (Ưu tiên) ---
        if cookie_str and len(cookie_str) > 10:
            # Lấy domain gốc từ link chương truyện (ví dụ: https://webtruyen.com)
            from urllib.parse import urlparse
            parsed_uri = urlparse(chapter_url)
            domain = '{uri.scheme}://{uri.netloc}/'.format(uri=parsed_uri)
            
            add_cookies_to_driver(driver, cookie_str, domain)
        
        # --- CHIẾN THUẬT 2: LOGIN THƯỜNG (Nếu Cookie fail hoặc ko có) ---
        elif login_url and username and password:
            logger.info(f"🔑 Đang thử đăng nhập thường: {login_url}")
            driver.get(login_url)
            time.sleep(3)
            try:
                # Tìm input user (quét nhiều loại tên phổ biến)
                user_input = driver.find_element(By.CSS_SELECTOR, "input[name*='user'], input[name*='email'], input[name*='login'], input[type='text']")
                pass_input = driver.find_element(By.CSS_SELECTOR, "input[name*='pass'], input[type='password']")
                
                user_input.send_keys(username)
                pass_input.send_keys(password)
                
                # Submit
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                    btn.click()
                except:
                    pass_input.submit()
                
                time.sleep(5)
            except Exception as e:
                logger.warning(f"Login thường thất bại: {e}")
        
        # --- VÀO TRUYỆN VÀ CHỤP ẢNH ---
        logger.info(f"📖 Đang truy cập chương: {chapter_url}")
        driver.get(chapter_url)
        time.sleep(5) # Đợi truyện load hết (ảnh, quảng cáo...)

        # Chụp cuộn trang
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 1200 
        
        images = []
        current_scroll = 0
        max_images = 15 # Giới hạn 15 ảnh để bảo vệ RAM 512MB của Render
        
        logger.info("📸 Đang chụp ảnh...")
        while current_scroll < total_height and len(images) < max_images:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(1.5) # Đợi render sau khi cuộn
            
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot))
            images.append(image.convert('RGB')) 
            
            current_scroll += viewport_height

        driver.quit()
        logger.info(f"✅ Đã chụp {len(images)} ảnh.")
        
        if not images:
            return "Lỗi: Trang trắng hoặc không chụp được ảnh nào."

        # --- GỬI CHO GEMINI ---
        logger.info("🤖 Đang gửi cho AI xử lý...")
        genai.configure(api_key=api_key)
        
        # SỬ DỤNG GEMINI 2.0 FLASH (EXPERIMENTAL)
        # Nếu model này chưa public cho key của anh, anh đổi lại thành 'gemini-1.5-flash'
        model_name = 'gemini-2.5-flash' 
        
        try:
            model = genai.GenerativeModel(model_name)
        except:
            logger.warning("Gemini 2.5 chưa khả dụng, quay về 2.5 Flash")
            model = genai.GenerativeModel('gemini-2.5-flash')

        full_text = ""
        batch_size = 4 # Gửi 4 ảnh một lúc
        
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = """
            Bạn là một chuyên gia OCR. Hãy nhìn vào các hình ảnh truyện tranh/truyện chữ này.
            Nhiệm vụ: Trích xuất toàn bộ nội dung văn bản tiếng Việt thành text.
            Yêu cầu:
            1. Chỉ lấy nội dung truyện, bỏ qua số trang, tên web, quảng cáo.
            2. Ghép nối các câu bị ngắt giữa các ảnh một cách liền mạch.
            3. Trả về kết quả dạng text thuần túy, không Markdown.
            """
            try:
                response = model.generate_content([prompt, *batch])
                if response.text:
                    full_text += response.text + "\n"
            except Exception as e:
                logger.error(f"Lỗi AI Batch {i}: {e}")
                full_text += f"\n[Lỗi xử lý đoạn này: {str(e)}]\n"

        return full_text

    except Exception as e:
        if driver: driver.quit()
        logger.error(f"Lỗi hệ thống: {str(e)}")
        return f"Lỗi hệ thống: {str(e)}"

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    data = request.json
    if not data.get('chapter_url'):
        return jsonify({'error': 'Thiếu Link truyện!'})

    result_text = login_and_scrape(data)
    return jsonify({'result': result_text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
