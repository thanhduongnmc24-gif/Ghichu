const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();

const PORT = process.env.PORT || 3001;

// --- CÀI ĐẶT GEMINI (Như cũ) ---
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("LỖI: Chưa cài đặt GEMINI_API_KEY trên Render!");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", // Hoặc "gemini-2.5-flash" như bạn đã dùng
    generationConfig: {
        responseMimeType: "application/json" 
    }
});

// --- Middleware (Như cũ) ---
app.use(express.json());
app.use(express.static('public'));

// --- API Endpoint cho AI (CẬP NHẬT PROMPT) ---
app.post('/api/ai-parse', async (req, res) => {
    const text = req.body.text || "";
    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }
    
    // Lấy ngày hôm nay theo múi giờ Hà Nội (GMT+7)
    const today = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); 
    
    const parts = formatter.formatToParts(today);
    const partMap = parts.reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const currentYear = partMap.year;

    // 3. Tạo câu lệnh (Prompt) MỚI
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản và chuyển nó thành một MẢNG JSON.
        Mỗi đối tượng trong mảng chỉ chứa 2 thông tin: "date" (ngày) và "note" (ghi chú).
        { 
          "date": "YYYY-MM-DD", 
          "note": "..."
        }

        Quy tắc:
        1. "note" (Ghi chú): Là bất kỳ văn bản nào (tên người, sự kiện, v.v.).
        2. Bỏ qua các từ khóa ca làm việc như "ngày", "đêm", "giãn ca". AI không cần xử lý chúng.
        
        Hôm nay là ngày: ${todayStr}. Năm hiện tại: ${currentYear}.

        VÍ DỤ XỬ LÝ:
        Input: "Quang 30/10"
        Output: [
            { "date": "${currentYear}-10-30", "note": "Quang" }
        ]

        Input: "Họp 28/11 và 15/11" (Hai ngày riêng biệt)
        Output: [
            { "date": "${currentYear}-11-28", "note": "Họp" },
            { "date": "${currentYear}-11-15", "note": "Họp" }
        ]
        
        Input: "Q 30/10 2/11 3/11" (Một ghi chú, nhiều ngày)
        Output: [
            { "date": "${currentYear}-10-30", "note": "Q" },
            { "date": "${currentYear}-11-02", "note": "Q" },
            { "date": "${currentYear}-11-03", "note": "Q" }
        ]
        
        Input: "Quang 30/10 ca đêm" (Bỏ qua "ca đêm")
        Output: [
            { "date": "${currentYear}-10-30", "note": "Quang" }
        ]

        Văn bản của người dùng: "${text}"

        Chỉ trả về MỘT MẢNG JSON (JSON Array). Không thêm bất kỳ văn bản giải thích nào.
    `;

    // 4. Gọi API Gemini (Như cũ)
    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();

        console.log("Gemini trả về:", jsonText);
        res.setHeader('Content-Type', 'application/json');
        res.send(jsonText); 

    } catch (err) {
        console.error("Lỗi khi gọi Gemini API:", err);
        res.status(500).json({ error: 'AI gặp lỗi, không thể phân tích.' });
    }
});

// Route cho PWA (Như cũ)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động server (Như cũ)
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});