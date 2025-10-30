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
    model: "gemini-2.5-flash", // Hoặc "gemini-2.5-flash" như bạn đã dùng
    generationConfig: {
        responseMimeType: "application/json" 
    }
});

// --- Middleware (Như cũ) ---
app.use(express.json());
app.use(express.static('public'));

// --- API Endpoint cho AI (ĐÃ NÂNG CẤP) ---
app.post('/api/ai-parse', async (req, res) => {
    const text = req.body.text || "";
    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentYear = today.getFullYear();

    // 3. Tạo câu lệnh (Prompt) MỚI
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản và chuyển nó thành một MẢNG JSON.
        Mỗi đối tượng trong mảng phải có định dạng:
        { 
          "date": "YYYY-MM-DD", 
          "shift": "...", 
          "note": "..."
        }

        Quy tắc:
        1. "shift" (Ca): Phải là một trong các giá trị: "ngày", "đêm", "giãn ca", "off" (nếu người dùng nói nghỉ). Nếu không nói, để trống ("").
        2. "note" (Ghi chú): Là bất kỳ văn bản nào còn lại (tên người, sự kiện, v.v.). Nếu không nói, để trống ("").
        
        Hôm nay là ngày: ${todayStr}. Năm hiện tại: ${currentYear}.

        VÍ DỤ XỬ LÝ:
        Input: "30/10 đêm, 31/10 giãn ca, 1/11 ngày."
        Output: [
            { "date": "${currentYear}-10-30", "shift": "đêm", "note": "" },
            { "date": "${currentYear}-10-31", "shift": "giãn ca", "note": "" },
            { "date": "${currentYear}-11-01", "shift": "ngày", "note": "" }
        ]

        Input: "Quang 30/10" (Giống ví dụ của người dùng)
        Output: [
            { "date": "${currentYear}-10-30", "shift": "", "note": "Quang" }
        ]

        Input: "Quang 30/10 ca đêm" (Kết hợp cả hai)
        Output: [
            { "date": "${currentYear}-10-30", "shift": "đêm", "note": "Quang" }
        ]

        Input: "quang 28-15/11" (Hai ngày riêng biệt)
        Output: [
            { "date": "${currentYear}-11-28", "shift": "", "note": "quang" },
            { "date": "${currentYear}-11-15", "shift": "", "note": "quang" }
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