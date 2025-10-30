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
        responseMimeType: "application/json" // Yêu cầu AI luôn trả về JSON
    }
});

// --- Middleware (Như cũ) ---
app.use(express.json());
app.use(express.static('public'));

// --- API Endpoint cho AI (ĐÃ NÂNG CẤP LỚN) ---
app.post('/api/ai-parse', async (req, res) => {
    const text = req.body.text || "";
    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }
    
    // Lấy ngày hôm nay để AI biết "ngày mai", "hôm nay"
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentYear = today.getFullYear();

    // 3. Tạo câu lệnh (Prompt) MỚI
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản người dùng cung cấp và chuyển nó thành một mảng (array) JSON.
        Mỗi đối tượng trong mảng phải có 1 trong 3 định dạng sau:
        1. { "date": "YYYY-MM-DD", "note": "nội dung" } (Ví dụ: "quang", "đêm", "ngày")
        2. { "date": "YYYY-MM-DD", "type": "kiểu" } (Ví dụ: "giãn ca")
        3. { "date": "YYYY-MM-DD", "clear": true } (Ví dụ: "xóa ngày", "nghỉ")

        Hôm nay là ngày: ${todayStr}.
        Năm hiện tại (nếu không được chỉ định) là: ${currentYear}.
        
        Quy tắc:
        - Người dùng Việt Nam dùng định dạng DD/MM.
        - "đêm" -> { "note": "đêm" }
        - "ngày" -> { "note": "ngày" }
        - "giãn ca" -> { "type": "giãn ca" }
        - "xóa" hoặc "nghỉ" -> { "clear": true }
        - "quang 28-15/11" (hoặc "quang 28/11 và 15/11") -> có nghĩa là 2 ngày riêng biệt.
        - "quang 28/10 - 15/11" (hoặc "quang từ 28/10 đến 15/11") -> có nghĩa là một KHOẢNG ngày.
        
        VÍ DỤ XỬ LÝ:
        Input: "30/10 đêm, 31/10 giãn ca, 1/11 ngày. quang 28/11 và 15/11."
        Output: [
            { "date": "${currentYear}-10-30", "note": "đêm" },
            { "date": "${currentYear}-10-31", "type": "giãn ca" },
            { "date": "${currentYear}-11-01", "note": "ngày" },
            { "date": "${currentYear}-11-28", "note": "quang" },
            { "date": "${currentYear}-11-15", "note": "quang" }
        ]

        Input: "hôm nay ca ngày, ngày mai giãn ca"
        Output: [
            { "date": "${todayStr}", "note": "ngày" },
            { "date": "${new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0]}", "type": "giãn ca" }
        ]
        
        Văn bản của người dùng: "${text}"

        Chỉ trả về MỘT MẢNG JSON (JSON Array). Không thêm bất kỳ văn bản giải thích nào.
    `;

    // 4. Gọi API Gemini (Như cũ)
    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();

        // 5. Gửi kết quả JSON (dạng mảng) về cho PWA
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