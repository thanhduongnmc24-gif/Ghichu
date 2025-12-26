import os
import json
from datetime import datetime, timedelta
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
    role = db.Column(db.String(20), default='user')

# MODEL MỚI: DANH SÁCH CÁC BẢNG (Menu)
class AppTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    # Bảng này do Admin quản lý, hiển thị cho tất cả mọi người

class TableColumn(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Cột này thuộc về Bảng nào?
    table_id = db.Column(db.Integer, db.ForeignKey('app_table.id'), nullable=False)

class DataRow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.JSON, nullable=False) 
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Dòng này thuộc về Bảng nào?
    table_id = db.Column(db.Integer, db.ForeignKey('app_table.id'), nullable=False)

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
@app.route('/table/<int:table_id>')
@login_required
def index(table_id=None):
    # 1. Lấy danh sách tất cả các bảng (Menu)
    all_tables = AppTable.query.order_by(AppTable.id).all()

    # Nếu chưa có bảng nào (lần đầu chạy), tự tạo bảng mặc định
    if not all_tables:
        default_table = AppTable(name="DATA XƯỞNG THÉP")
        db.session.add(default_table)
        db.session.commit()
        return redirect(url_for('index'))

    # 2. Xác định bảng hiện tại đang xem
    current_table = None
    if table_id:
        current_table = AppTable.query.get(table_id)
    
    # Nếu không tìm thấy hoặc không có ID, lấy bảng đầu tiên
    if not current_table:
        current_table = all_tables[0]
        # Redirect để URL đẹp hơn và đúng logic
        return redirect(url_for('index', table_id=current_table.id))

    # 3. Lấy dữ liệu CỦA USER và CỦA BẢNG HIỆN TẠI
    columns = TableColumn.query.filter_by(user_id=current_user.id, table_id=current_table.id).order_by(TableColumn.order_index).all()
    rows = DataRow.query.filter_by(created_by=current_user.id, table_id=current_table.id).order_by(DataRow.id.desc()).all()
    data_map = {row.id: row.content for row in rows}

    # Nếu bảng này chưa có cột nào (với user này), tạo mẫu
    if not columns:
        defaults = ["Tiêu đề 1", "Tiêu đề 2", "Ghi chú"]
        if current_table.name == "DATA XƯỞNG THÉP":
            defaults = ["Sản phẩm", "Mác thép", "Bộ gap", "Nhiệt lò nung", "Cơ tính"]
            
        for idx, name in enumerate(defaults):
            db.session.add(TableColumn(name=name, order_index=idx, user_id=current_user.id, table_id=current_table.id))
        db.session.commit()
        return redirect(url_for('index', table_id=current_table.id))

    all_users = []
    if current_user.role == 'admin':
        all_users = User.query.order_by(User.role, User.id).all()

    return render_template('dashboard.html', 
                           columns=columns, 
                           rows=rows, 
                           data_map=data_map, 
                           all_users=all_users,
                           all_tables=all_tables,     # Danh sách menu
                           current_table=current_table) # Bảng đang chọn

# --- ADMIN: QUẢN LÝ MENU (BẢNG) ---
@app.route('/admin/add_table', methods=['POST'])
@login_required
@admin_required
def add_table():
    name = request.form.get('table_name')
    if name:
        exists = AppTable.query.filter_by(name=name).first()
        if not exists:
            db.session.add(AppTable(name=name))
            db.session.commit()
            flash(f'Đã thêm mục mới: {name}', 'success')
        else:
            flash('Tên mục này đã tồn tại!', 'error')
    return redirect(url_for('index'))

@app.route('/admin/edit_table', methods=['POST'])
@login_required
@admin_required
def edit_table():
    table_id = request.form.get('table_id')
    new_name = request.form.get('new_name')
    if table_id and new_name:
        table = AppTable.query.get(table_id)
        if table:
            table.name = new_name
            db.session.commit()
            flash('Đã đổi tên mục thành công!', 'success')
    return redirect(url_for('index', table_id=table_id))

@app.route('/admin/delete_table/<int:table_id>')
@login_required
@admin_required
def delete_table(table_id):
    table = AppTable.query.get(table_id)
    if table:
        # Xóa tất cả dữ liệu liên quan đến bảng này của TẤT CẢ user
        DataRow.query.filter_by(table_id=table.id).delete()
        TableColumn.query.filter_by(table_id=table.id).delete()
        db.session.delete(table)
        db.session.commit()
        flash(f'Đã xóa mục {table.name} và toàn bộ dữ liệu bên trong!', 'success')
    return redirect(url_for('index'))

# --- USER: QUẢN LÝ DỮ LIỆU (Theo Table ID) ---

@app.route('/add_column', methods=['POST'])
@login_required
def add_column():
    table_id = request.form.get('table_id') # Lấy ID bảng từ form
    col_name = request.form.get('col_name')
    
    if col_name and table_id:
        exists = TableColumn.query.filter_by(name=col_name, user_id=current_user.id, table_id=table_id).first()
        if not exists:
            max_order = db.session.query(db.func.max(TableColumn.order_index)).filter_by(user_id=current_user.id, table_id=table_id).scalar() or 0
            db.session.add(TableColumn(name=col_name, order_index=max_order + 1, user_id=current_user.id, table_id=table_id))
            db.session.commit()
            flash(f'Đã thêm cột: {col_name}', 'success')
        else:
            flash('Trùng tên cột!', 'error')
    return redirect(url_for('index', table_id=table_id))

@app.route('/delete_column/<int:id>')
@login_required
def delete_column(id):
    col = TableColumn.query.get(id)
    if col and col.user_id == current_user.id:
        table_id = col.table_id # Lưu lại để redirect về đúng chỗ
        db.session.delete(col)
        db.session.commit()
        flash('Đã xóa cột!', 'success')
        return redirect(url_for('index', table_id=table_id))
    return redirect(url_for('index'))

@app.route('/save_row', methods=['POST'])
@login_required
def save_row():
    row_id = request.form.get('row_id')
    table_id = request.form.get('table_id') # Lấy ID bảng
    
    columns = TableColumn.query.filter_by(user_id=current_user.id, table_id=table_id).all()
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
        new_row = DataRow(content=row_data, created_by=current_user.id, table_id=table_id)
        db.session.add(new_row)
        db.session.commit()
        flash('Đã thêm dòng mới!', 'success')
        
    return redirect(url_for('index', table_id=table_id))

@app.route('/batch_update_columns', methods=['POST'])
@login_required
def batch_update_columns():
    # API này cần sửa lại xíu ở Frontend để gửi kèm table_id nếu cần check kỹ hơn
    # Nhưng hiện tại check col.user_id là đủ an toàn
    try:
        data = request.json.get('columns', [])
        # Lưu ý: Logic update content JSON hơi phức tạp khi đổi tên cột
        # Ở đây Tèo giả định các cột gửi lên đều thuộc cùng 1 table và user
        if not data: return jsonify({'status': 'success'})

        first_col = TableColumn.query.get(data[0]['id'])
        current_table_id = first_col.table_id
        
        my_rows = DataRow.query.filter_by(created_by=current_user.id, table_id=current_table_id).all()
        
        for item in data:
            col_id = item.get('id')
            new_name = item.get('name')
            new_order = item.get('order')
            
            col = TableColumn.query.get(col_id)
            if col and col.user_id == current_user.id:
                if col.name != new_name:
                    existing = TableColumn.query.filter_by(name=new_name, user_id=current_user.id, table_id=current_table_id).filter(TableColumn.id != col_id).first()
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

@app.route('/delete_row/<int:id>')
@login_required
def delete_row(id):
    row = DataRow.query.get(id)
    if row and row.created_by == current_user.id:
        table_id = row.table_id
        db.session.delete(row)
        db.session.commit()
        return redirect(url_for('index', table_id=table_id))
    return redirect(url_for('index'))

@app.route('/print_row/<int:id>')
@login_required
def print_row(id):
    row = DataRow.query.get_or_404(id)
    if row.created_by != current_user.id: return "Không có quyền!", 403
    
    # Lấy cột của đúng bảng mà dòng dữ liệu đang nằm
    columns = TableColumn.query.filter_by(user_id=current_user.id, table_id=row.table_id).order_by(TableColumn.order_index).all()
    
    vn_time = datetime.utcnow() + timedelta(hours=7)
    today_str = vn_time.strftime('%d/%m/%Y')
    return render_template('print_ticket.html', row=row, columns=columns, today=today_str)

# --- CÁC ROUTE ADMIN USER KHÁC GIỮ NGUYÊN ---
@app.route('/admin/toggle_role/<int:user_id>')
@login_required
@admin_required
def toggle_role(user_id):
    if user_id == current_user.id: return redirect(url_for('index'))
    user = User.query.get(user_id)
    if user:
        user.role = 'user' if user.role == 'admin' else 'admin'
        db.session.commit()
        flash(f'Đã đổi quyền user!', 'success')
    return redirect(url_for('index'))

@app.route('/admin/reset_password/<int:user_id>', methods=['POST'])
@login_required
@admin_required
def admin_reset_password(user_id):
    user = User.query.get(user_id)
    if user:
        user.password = generate_password_hash('123456')
        db.session.commit()
        flash('Reset pass thành công!', 'success')
    return redirect(url_for('index'))

@app.route('/admin/delete_user/<int:user_id>')
@login_required
@admin_required
def admin_delete_user(user_id):
    user = User.query.get(user_id)
    if user and user.role != 'admin':
        # Xóa hết dữ liệu của user này ở mọi bảng
        DataRow.query.filter_by(created_by=user.id).delete()
        TableColumn.query.filter_by(user_id=user.id).delete()
        db.session.delete(user)
        db.session.commit()
        flash('Đã xóa user!', 'success')
    return redirect(url_for('index'))

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
                flash(f'Tạo xong!', 'success')
        elif user and check_password_hash(user.password, request.form.get('password')):
            login_user(user)
            return redirect(url_for('index'))
        else: flash('Sai mật khẩu!', 'error')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout(): logout_user(); return redirect(url_for('login'))

@app.route('/ping_db')
def ping_db():
    try:
        count = User.query.count()
        return f"Hello Robot! {count}", 200
    except: return "Error", 500

with app.app_context(): db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)