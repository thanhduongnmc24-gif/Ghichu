# File: reset_db.py
from app import app, db

# Chạy trong ngữ cảnh của ứng dụng Flask
with app.app_context():
    print("⏳ Đang xóa toàn bộ bảng cũ...")
    db.drop_all()  # Lệnh này sẽ xóa sạch bách các bảng cũ bị lỗi
    
    print("🔨 Đang xây dựng lại cấu trúc bảng mới (có Menu, Admin)...")
    db.create_all() # Tạo lại từ đầu đầy đủ: User, AppTable, DataRow...
    
    print("✅ Xong rồi anh hai ơi! Giờ web chạy ngon lành rồi đó.")