const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static('public'));

// --- API Endpoint cho AI (ĐÃ CẬP NHẬT) ---
app.post('/api/ai-parse', (req, res) => {
    const text = req.body.text || "";

    let day = "Chưa rõ";
    let event = text;

    // CẬP NHẬT: Tìm TẤT CẢ các mốc thời gian (vd: 8:00, 10:30)
    // 'g' là "global match", tìm tất cả
    const timeMatches = text.match(/(\d{1,2}:\d{2})/g);
    
    let time_start = "00:00";
    let time_end = "00:00";

    if (timeMatches) {
        // Nếu tìm thấy ít nhất 1 mốc giờ
        if (timeMatches.length > 0) {
            time_start = timeMatches[0];
            event = event.replace(timeMatches[0], ''); // Xóa thời gian khỏi event
        }
        // Nếu tìm thấy mốc giờ thứ 2
        if (timeMatches.length > 1) {
            time_end = timeMatches[1];
            event = event.replace(timeMatches[1], ''); // Xóa thời gian khỏi event
        } else {
            // Nếu chỉ có 1 mốc giờ, thì giờ kết thúc = giờ bắt đầu
            time_end = time_start;
        }
    }

    // Tìm ngày (như cũ)
    const dayMatch = text.match(/(Thứ\s[Hai|Ba|Tư|Năm|Sáu|Bảy|Chủ Nhật])/i);
    if (dayMatch) {
        day = dayMatch[1];
        event = event.replace(dayMatch[0], '');
    }

    // Dọn dẹp event (thêm 'từ', 'đến')
    event = event.replace('lúc', '').replace('vào', '').replace('từ', '').replace('đến', '').trim();

    // Trả về kết quả với 2 mốc thời gian
    res.json({
        day: day,
        time: time_start,  // Giờ bắt đầu
        time_end: time_end // Giờ kết thúc
    });
});

// Route cho PWA (như cũ)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động server (như cũ)
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
