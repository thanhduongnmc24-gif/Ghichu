const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Thêm công cụ AI
const app = express();

const PORT = process.env.PORT || 3001;

// --- CÀI ĐẶT GEMINI ---
// 1. Lấy API Key từ Biến Môi trường (mà bạn đã cài ở Render)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("LỖI: Chưa cài đặt GEMINI_API_KEY trên Render!");
}

// 2. Khởi tạo mô hình AI
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", // Dùng "flash" cho nhanh và rẻ
    generationConfig: {
        responseMimeType: "application/json" // Yêu cầu AI luôn trả về JSON
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
    
    // 3. Tạo câu lệnh (Prompt) cho AI
    const prompt = `
        Bạn là một trợ lý thông minh chuyên phân tích thời khóa biểu.
        Nhiệm vụ của bạn là đọc văn bản người dùng cung cấp và chuyển nó thành một đối tượng JSON CHÍNH XÁC theo định dạng sau:
        {
          "day": "...",
          "time": "HH:MM",
          "time_end": "HH:MM",
          "event": "..."
        }

        Quy tắc:
        1. "day": Phải là "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", hoặc "Chủ Nhật". Nếu người dùng nói "ngày mai" hoặc "hôm nay", hãy dùng ngày hiện tại (hôm nay là ${new Date().toLocaleDateString('vi-VN', { weekday: 'long' })}) để suy luận. Nếu không rõ, dùng "Chưa rõ".
        2. "time": Phải là giờ bắt đầu dạng "HH:MM" (24 giờ). Nếu không rõ, dùng "00:00".
        3. "time_end": Phải là giờ kết thúc dạng "HH:MM". Nếu không tìm thấy, hãy đặt nó BẰNG "time".
        4. "event": Là nội dung sự kiện.

        Văn bản của người dùng: "${text}"

        Chỉ trả về đối tượng JSON. Không thêm bất kỳ văn bản giải thích nào.
    `;

    // 4. Gọi API Gemini
    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();

        // 5. Gửi kết quả JSON về cho PWA
        console.log("Gemini trả về:", jsonText); // Rất quan trọng để debug
        
        // Gemini đã được cấu hình trả về JSON, nên chúng ta gửi thẳng
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
