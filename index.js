const express = require('express');
const path = require('path');
const app = express();

// Render sẽ tự gán PORT, hoặc dùng 3001 nếu chạy ở máy
const PORT = process.env.PORT || 3001;

// Middleware để đọc JSON từ các request
app.use(express.json());

// Phục vụ tất cả các tệp tĩnh (HTML, CSS, JS, PWA) từ thư mục 'public'
app.use(express.static('public'));

// --- API Endpoint cho AI ---
app.post('/api/ai-parse', (req, res) => {
    const text = req.body.text || "";

    // LOGIC GIẢ LẬP AI (Đơn giản)
    // "Học Toán lúc 10:30 Thứ Ba"
    let day = "Chưa rõ";
    let time = "00:00";
    let event = text;

    // Tìm thời gian (vd: 14:00)
    const timeMatch = text.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
        time = timeMatch[1];
        event = event.replace(timeMatch[0], ''); // Xóa khỏi sự kiện
    }

    // Tìm ngày (vd: Thứ Hai)
    const dayMatch = text.match(/(Thứ\s[Hai|Ba|Tư|Năm|Sáu|Bảy|Chủ Nhật])/i);
    if (dayMatch) {
        day = dayMatch[1];
        event = event.replace(dayMatch[0], ''); // Xóa khỏi sự kiện
    }

    // Dọn dẹp sự kiện
    event = event.replace('lúc', '').replace('vào', '').trim();

    // Trả về kết quả đã phân tích
    res.json({
        day: day,
        time: time,
        event: event
    });
});

// Bất kỳ route nào không phải API sẽ được chuyển về index.html
// Điều này quan trọng cho PWA khi tải lại trang
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
