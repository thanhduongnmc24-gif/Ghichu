#!/usr/bin/env bash
# exit on error
set -o errexit

STORAGE_DIR=/opt/render/project/.render

echo "...Downloading Chrome and Dependencies"

# Tạo thư mục chứa Chrome
mkdir -p $STORAGE_DIR/chrome
cd $STORAGE_DIR/chrome

# 1. Tải Chrome bản ổn định
wget -P ./ https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# 2. Giải nén Chrome
dpkg -x ./google-chrome-stable_current_amd64.deb $STORAGE_DIR/chrome

# 3. Dọn dẹp file deb
rm ./google-chrome-stable_current_amd64.deb

# 4. Trở về thư mục gốc
cd $HOME/project/src

# 5. Cài đặt thư viện Python
pip install -r requirements.txt

# 6. Thêm đường dẫn Chrome vào biến môi trường (để chắc chắn)
export PATH="${PATH}:/opt/render/project/.render/chrome/opt/google/chrome"
