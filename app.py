import os
import json
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__)
app.secret_key = 'bi_mat_cua_teo_v7_final' 

# --- KẾT NỐI DATABASE ---
db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='user') # 'admin' hoặc 'user'

class TableColumn(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class DataRow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.JSON, nullable=False) 
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            flash('Chỉ dành cho Admin!', 'error')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

# --- ROUTES ---
@app.route('/')
@login_required
def index():
    # 1. LẤY DỮ LIỆU CỦA USER ĐANG ĐĂNG NHẬP
    columns = TableColumn.query.filter_by(user_id=current_user.id).order_by(TableColumn.order_index).all()
    rows = DataRow.query.filter_by(created_by=current_user.id).order_by(DataRow.id.desc()).all()
    data_map = {row.id: row.content for row in rows}

    if not columns:
        defaults = ["Sản phẩm", "Mác thép", "Bộ gap", "Nhiệt lò nung", "Cơ tính"]
        for idx, name in enumerate(defaults):
            db.session.add(TableColumn(name=name, order_index=idx, user_id=current_user.id))
        db.session.commit()
        return redirect(url_for('index'))

    # 2. NẾU LÀ ADMIN: Lấy danh sách User (Sắp xếp Admin lên đầu)
    all_users = []
    if current_user.role == 'admin':
        # MẸO: Sắp xếp theo role (admin < user nên admin lên trước), sau đó theo ID
        all_users = User.query.order_by(User.role, User.id).all()

    return render_template('dashboard.html', columns=columns, rows=rows, data_map=data_map, all_users=all_users)

# --- CÁC HÀM QUẢN TRỊ ADMIN ---
@app.route('/admin/toggle_role/<int:user_id>')
@login_required
@admin_required
def toggle_role(user_id):
    if user_id == current_user.id:
        flash('Không thể tự phế truất chính mình!', 'error')
        return redirect(url_for('index'))
        
    user = User.query.get(user_id)
    if user:
        new_role = 'user' if user.role == 'admin' else 'admin'
        user.role = new_role
        db.session.commit()
        flash(f'Đã đổi quyền của {user.username} thành: {new_role.upper()}', 'success')
    return redirect(url_for('index'))

@app.route('/admin/reset_password/<int:user_id>', methods=['POST'])
@login_required
@admin_required
def admin_reset_password(user_id):
    user = User.query.get(user_id)
    if user:
        user.password = generate_password_hash('123456')
        db.session.commit()
        flash(f'Đã reset mật khẩu của {user.username} về 123456', 'success')
    return redirect(url_for('index'))

@app.route('/admin/delete_user/<int:user_id>')
@login_required
@admin_required
def admin_delete_user(user_id):
    user = User.query.get(user_id)
    if user:
        if user.role == 'admin':
            flash('Không thể xóa đồng nghiệp Admin!', 'error')
        else:
            DataRow.query.filter_by(created_by=user.id).delete()
            TableColumn.query.filter_by(user_id=user.id).delete()
            db.session.delete(user)
            db.session.commit()
            flash(f'Đã xóa user {user.username}!', 'success')
    return redirect(url_for('index'))

# --- CÁC ROUTE DATA ---
@app.route('/add_column', methods=['POST'])
@login_required
def add_column():
    col_name = request.form.get('col_name')
    if col_name:
        exists = TableColumn.query.filter_by(name=col_name, user_id=current_user.id).first()
        if not exists:
            max_order = db.session.query(db.func.max(TableColumn.order_index)).filter_by(user_id=current_user.id).scalar() or 0
            db.session.add(TableColumn(name=col_name, order_index=max_order + 1, user_id=current_user.id))
            db.session.commit()
            flash(f'Đã thêm cột: {col_name}', 'success')
        else:
            flash('Trùng tên cột rồi!', 'error')
    return redirect(url_for('index'))

@app.route('/delete_column/<int:id>')
@login_required
def delete_column(id):
    col = TableColumn.query.get(id)
    if col and col.user_id == current_user.id:
        db.session.delete(col)
        db.session.commit()
        flash('Đã xóa cột!', 'success')
    return redirect(url_for('index'))

@app.route('/batch_update_columns', methods=['POST'])
@login_required
def batch_update_columns():
    try:
        data = request.json.get('columns', [])
        my_rows = DataRow.query.filter_by(created_by=current_user.id).all()
        for item in data:
            col_id = item.get('id')
            new_name = item.get('name')
            new_order = item.get('order')
            col = TableColumn.query.get(col_id)
            if col and col.user_id == current_user.id:
                if col.name != new_name:
                    existing = TableColumn.query.filter_by(name=new_name, user_id=current_user.id).filter(TableColumn.id != col_id).first()
                    if existing: return jsonify({'status': 'error', 'message': f'Tên {new_name} bị trùng!'})
                    old_name = col.name
                    col.name = new_name 
                    for row in my_rows:
                        if row.content and old_name in row.content:
                            updated_content = dict(row.content)
                            updated_content[new_name] = updated_content.pop(old_name)
                            row.content = updated_content
                col.order_index = new_order
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/save_row', methods=['POST'])
@login_required
def save_row():
    row_id = request.form.get('row_id')
    columns = TableColumn.query.filter_by(user_id=current_user.id).all()
    row_data = {}
    for col in columns:
        raw_val = request.form.get(f'field_{col.id}', '')
        if '\n' in raw_val:
            lines = [line.strip() for line in raw_val.split('\n') if line.strip()]
            row_data[col.name] = lines
        else:
            row_data[col.name] = raw_val.strip()
    
    if row_id:
        row = DataRow.query.get(row_id)
        if row and row.created_by == current_user.id:
            row.content = row_data
            db.session.commit()
            flash('Đã cập nhật!', 'success')
    else:
        new_row = DataRow(content=row_data, created_by=current_user.id)
        db.session.add(new_row)
        db.session.commit()
        flash('Đã thêm dòng mới!', 'success')
    return redirect(url_for('index'))

@app.route('/delete_row/<int:id>')
@login_required
def delete_row(id):
    row = DataRow.query.get(id)
    if row and row.created_by == current_user.id:
        db.session.delete(row)
        db.session.commit()
    return redirect(url_for('index'))

@app.route('/print_row/<int:id>')
@login_required
def print_row(id):
    row = DataRow.query.get_or_404(id)
    if row.created_by != current_user.id: return "Không có quyền!", 403
    columns = TableColumn.query.filter_by(user_id=current_user.id).order_by(TableColumn.order_index).all()
    return render_template('print_ticket.html', row=row, columns=columns)

@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    new_pass = request.form.get('new_password')
    if new_pass:
        current_user.password = generate_password_hash(new_pass)
        db.session.commit()
        flash('Đổi mật khẩu thành công!', 'success')
    return redirect(url_for('index'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form.get('username')).first()
        if request.form.get('action') == 'register':
            if user: flash('Trùng tên rồi!', 'error')
            else:
                role = 'admin' if request.form.get('username') == 'admin' else 'user'
                db.session.add(User(username=request.form.get('username'), password=generate_password_hash(request.form.get('password')), role=role))
                db.session.commit()
                flash(f'Tạo xong! Role: {role}', 'success')
        elif user and check_password_hash(user.password, request.form.get('password')):
            login_user(user)
            return redirect(url_for('index'))
        else: flash('Sai mật khẩu!', 'error')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout(): logout_user(); return redirect(url_for('login'))

with app.app_context(): db.create_all()
# --- ROUTE DÀNH RIÊNG CHO UPTIME ROBOT ---
@app.route('/ping_db')
def ping_db():
    try:
        # Truy vấn nhẹ một cái để Supabase biết DB đang hoạt động
        # Đếm số lượng user (lệnh này siêu nhẹ)
        count = User.query.count()
        return f"Hello Robot! Database is awake. Users: {count}", 200
    except Exception as e:
        return f"Error: {str(e)}", 500
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)