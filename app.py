import os
import time
import io
from flask import Flask, render_template, request, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import google.generativeai as genai
from PIL import Image

app = Flask(__name__, template_folder='templates')

# Cấu hình Chrome cho môi trường Server (Render)
def init_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Chạy ẩn không hiện trình duyệt
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    
    # Cấu hình đường dẫn Chrome cho Render (nếu chạy local thì nó tự bỏ qua)
    chrome_path = "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome"
    if os.path.exists(chrome_path):
        chrome_options.binary_location = chrome_path

    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        return driver
    except Exception as e:
        print(f"Lỗi khởi tạo Driver: {e}")
        return None

def login_and_scrape(login_url, username, password, chapter_url, api_key):
    driver = init_driver()
    if not driver:
        return "Lỗi: Không thể khởi động trình duyệt Server."

    try:
        # 1. Đăng nhập
        print("Đang truy cập trang đăng nhập...")
        driver.get(login_url)
        time.sleep(3)

        # Tự động tìm ô input (thử các tên phổ biến)
        try:
            user_input = driver.find_element(By.CSS_SELECTOR, "input[name*='user'], input[name*='email'], input[name*='login']")
            pass_input = driver.find_element(By.CSS_SELECTOR, "input[name*='pass'], input[type='password']")
            
            user_input.send_keys(username)
            pass_input.send_keys(password)
            
            # Enter để login
            pass_input.submit()
            time.sleep(5) # Đợi login xong
        except Exception as e:
            driver.quit()
            return f"Lỗi đăng nhập: Không tìm thấy ô nhập liệu. ({str(e)})"

        # 2. Vào chương truyện
        print("Đang vào chương truyện...")
        driver.get(chapter_url)
        time.sleep(5)

        # 3. Chụp ảnh (Cuộn và chụp từng phần)
        total_height = driver.execute_script("return document.body.scrollHeight")
        viewport_height = 800 # Chiều cao mỗi lần chụp
        driver.set_window_size(1024, viewport_height)
        
        images = []
        current_scroll = 0
        
        while current_scroll < total_height:
            driver.execute_script(f"window.scrollTo(0, {current_scroll});")
            time.sleep(1) # Đợi load ảnh
            
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot))
            # Convert sang RGB để giảm dung lượng và tránh lỗi
            images.append(image.convert('RGB'))
            
            current_scroll += viewport_height
            if len(images) > 20: # Giới hạn 20 ảnh để tránh quá tải RAM server free
                break

        driver.quit()

        # 4. Gửi cho Gemini AI
        print("Đang gửi cho AI...")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        full_text = ""
        
        # Gửi từng đợt 5 ảnh một
        batch_size = 5
        for i in range(0, len(images), batch_size):
            batch = images[i:i+batch_size]
            prompt = """
            Đây là các phần của một chương truyện chữ bị chụp lại dưới dạng ảnh.
            Nhiệm vụ của bạn:
            1. Đọc tất cả văn bản tiếng Việt trong ảnh.
            2. Trả về định dạng Text thuần túy.
            3. Bỏ qua các menu, quảng cáo, số trang, chỉ lấy nội dung truyện.
            4. Nối tiếp nội dung một cách mạch lạc.
            """
            try:
                response = model.generate_content([prompt, *batch])
                full_text += response.text + "\n"
            except Exception as e:
                full_text += f"\n[Lỗi đoạn này: {str(e)}]\n"

        return full_text

    except Exception as e:
        driver.quit()
        return f"Lỗi không xác định: {str(e)}"

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
        return jsonify({'error': 'Thiếu thông tin bắt buộc!'})

    result_text = login_and_scrape(login_url, username, password, chapter_url, api_key)
    return jsonify({'result': result_text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
