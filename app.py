import os
import json
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

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

class TableColumn(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    order_index = db.Column(db.Integer, default=0)

class DataRow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.JSON, nullable=False) 
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- ROUTES ---
@app.route('/')
@login_required
def index():
    columns = TableColumn.query.order_by(TableColumn.order_index).all()
    rows = DataRow.query.order_by(DataRow.id.desc()).all()
    
    # --- LOGIC MỚI: Đóng gói dữ liệu tại đây để JavaScript không phải loop ---
    # Tạo dictionary: { id_dòng: nội_dung_json }
    data_map = {row.id: row.content for row in rows}

    if not columns:
        defaults = ["Sản phẩm", "Mác thép", "Bộ gap", "Nhiệt lò nung", "Cơ tính"]
        for idx, name in enumerate(defaults):
            db.session.add(TableColumn(name=name, order_index=idx))
        db.session.commit()
        return redirect(url_for('index'))

    # Truyền thêm biến data_map sang HTML
    return render_template('dashboard.html', columns=columns, rows=rows, data_map=data_map)

# API: Thêm cột
@app.route('/add_column', methods=['POST'])
@login_required
def add_column():
    col_name = request.form.get('col_name')
    if col_name:
        exists = TableColumn.query.filter_by(name=col_name).first()
        if not exists:
            max_order = db.session.query(db.func.max(TableColumn.order_index)).scalar() or 0
            db.session.add(TableColumn(name=col_name, order_index=max_order + 1))
            db.session.commit()
            flash(f'Đã thêm cột: {col_name}', 'success')
        else:
            flash('Cột này có rồi anh hai ơi!', 'error')
    return redirect(url_for('index'))

# API: Sửa tên cột
@app.route('/edit_column', methods=['POST'])
@login_required
def edit_column():
    col_id = request.form.get('col_id')
    new_name = request.form.get('new_name')
    
    if col_id and new_name:
        col = TableColumn.query.get(col_id)
        if col:
            existing = TableColumn.query.filter_by(name=new_name).first()
            if existing and existing.id != col.id:
                 flash('Tên cột này đã tồn tại rồi!', 'error')
            else:
                col.name = new_name
                db.session.commit()
                flash('Đã đổi tên cột!', 'success')
    return redirect(url_for('index'))

# API: Xóa cột
@app.route('/delete_column/<int:id>')
@login_required
def delete_column(id):
    col = TableColumn.query.get(id)
    if col:
        db.session.delete(col)
        db.session.commit()
        flash(f'Đã xóa cột: {col.name}', 'success')
    return redirect(url_for('index'))

# API: Sắp xếp cột
@app.route('/reorder_columns', methods=['POST'])
@login_required
def reorder_columns():
    try:
        new_order = request.json.get('order', [])
        for index, col_id in enumerate(new_order):
            col = TableColumn.query.get(col_id)
            if col:
                col.order_index = index
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

# API: Thêm/Sửa dòng
@app.route('/save_row', methods=['POST'])
@login_required
def save_row():
    row_id = request.form.get('row_id')
    columns = TableColumn.query.all()
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
        if row:
            row.content = row_data
            db.session.commit()
            flash('Đã cập nhật dữ liệu!', 'success')
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
    if row:
        db.session.delete(row)
        db.session.commit()
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
                db.session.add(User(username=request.form.get('username'), password=generate_password_hash(request.form.get('password'))))
                db.session.commit()
                flash('Tạo xong!', 'success')
        elif user and check_password_hash(user.password, request.form.get('password')):
            login_user(user)
            return redirect(url_for('index'))
        else: flash('Sai mật khẩu!', 'error')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout(): logout_user(); return redirect(url_for('login'))

if __name__ == '__main__':
    with app.app_context(): db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)