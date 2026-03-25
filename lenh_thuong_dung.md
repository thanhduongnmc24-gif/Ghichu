# 📘 BÍ KÍP CÁC LỆNH THƯỜNG DÙNG (DỰ ÁN XƯỞNG THÉP)

## 1. 🗄️ Môi trường & Database
Dùng để test trên Codespaces mà không làm ảnh hưởng tới dữ liệu thật trên Render.
- Set link database chạy tạm bằng SQLite:
  ```bash
  export DATABASE_URL="sqlite:///test_tam.db"
  export DATABASE_URL="postgresql://postgres.zwzsmswhcvheyfyrzpgd:Nguyenthanhduong1511@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
  python reset_db.py
  pip install -r requirements.txt
  python app.py
  git add . && git commit -m "Cập nhật" && git push origin main