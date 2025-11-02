// --- Các thư viện cần thiết ---
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path'; 
import { fileURLToPath } from 'url'; 
import { GoogleGenerativeAI } from "@google/generative-ai";

// === MỚI: Thư viện Thông báo Đẩy và Hẹn giờ ===
import webpush from 'web-push';
import cron from 'node-cron';
// === KẾT THÚC MỚI ===

// ----- CÀI ĐẶT CACHE (RSS) -----
const cache = new Map();
const CACHE_DURATION_MS = 3 * 60 * 1000; // 3 phút

// --- Cài đặt Server ---
const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

// Lấy API Key từ Biến Môi Trường
const API_KEY = process.env.GEMINI_API_KEY;

// Khởi tạo client Google AI
let genAI;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
} else {
    console.error("Thiếu GEMINI_API_KEY trong biến môi trường!");
}


// ==========================================================
// === MỚI: CÀI ĐẶT PUSH NOTIFICATION (VAPID) ===
// ==========================================================

// 1. Lấy khóa VAPID (Bạn có thể lấy từ Biến Môi trường)
//    (Đây là cặp khóa tôi đã tạo cho bạn ở Bước 2)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BJa_K4XqWNbvYxTfOuwf-HhEy3B5-jL-wQyGf9i8fG7H5sUeXU-3qOAYyA9XjYc8TbyyF1PqX9HwB-eK0uOB8uU';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'z1JgI-3-qG3rYk9b-S3r7vA7q8bI9cE4wL5uF6dE1sE';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("Thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY!");
} else {
    // 2. Cấu hình web-push
    webpush.setVapidDetails(
        'mailto:your-email@example.com', // Thay bằng email của bạn
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    console.log("Web Push đã được cấu hình.");
}

// 3. Nơi lưu trữ (Tạm thời dùng bộ nhớ server)
//    LƯU Ý: Khi server restart, dữ liệu này sẽ mất.
//    Để dùng lâu dài, bạn nên lưu vào file hoặc CSDL.
let subscriptions = [];

// 4. Endpoint để client (index.html) đăng ký
app.post('/api/save-subscription', (req, res) => {
    try {
        const subscription = req.body;
        
        // Kiểm tra xem subscription đã tồn tại chưa
        const existing = subscriptions.find(sub => sub.endpoint === subscription.endpoint);
        if (!existing) {
            subscriptions.push(subscription);
            console.log(`[PUSH] Đã lưu subscription mới: ${subscription.endpoint}`);
        } else {
            console.log(`[PUSH] Subscription đã tồn tại: ${subscription.endpoint}`);
        }
        
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Lỗi khi lưu subscription:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// 5. Tác vụ Hẹn giờ (Chạy mỗi phút)
//    Nhiệm vụ: Gửi "ping" đánh thức Service Worker
cron.schedule('* * * * *', () => {
    // Lấy giờ hiện tại ở Việt Nam (GMT+7)
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, hour: '2-digit', minute: '2-digit' };
    const timeStr = new Date().toLocaleTimeString('en-US', options); // Ví dụ: "06:00", "20:00"

    let checkType = null;

    if (timeStr === '06:00') {
        checkType = 'ngay'; // Gửi tín hiệu kiểm tra ca Ngày
    } else if (timeStr === '20:00') {
        checkType = 'dem'; // Gửi tín hiệu kiểm tra ca Đêm
    } else if (timeStr === '08:00') {
        checkType = 'off'; // Gửi tín hiệu kiểm tra Giãn ca / Off
    }
    
    // Nếu đến giờ, gửi thông báo
    if (checkType) {
        console.log(`[CRON] Đã đến giờ ${timeStr}, gửi tín hiệu check: ${checkType}`);
        
        const payload = JSON.stringify({ check: checkType });
        const subsToRemove = []; // Lưu các subscription hỏng để xóa sau

        // Lặp qua tất cả và gửi
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload)
                .catch(err => {
                    // Nếu lỗi 410 (Gone) nghĩa là người dùng đã thu hồi quyền
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log(`[PUSH] Subscription đã hết hạn: ${sub.endpoint}. Sẽ xóa.`);
                        subsToRemove.push(sub.endpoint);
                    } else {
                        console.error(`[PUSH] Lỗi khi gửi thông báo: ${err.message}`);
                    }
                });
        });
        
        // Xóa các subscription hỏng
        subscriptions = subscriptions.filter(sub => !subsToRemove.includes(sub.endpoint));
    }
});
// === KẾT THÚC PHẦN MỚI ===
// ==========================================================


// ----- CÁC ENDPOINT CỦA TIN TỨC (Không thay đổi) -----

// Endpoint 1: Lấy RSS feed 
app.get('/get-rss', async (req, res) => {
    const rssUrl = req.query.url;
    if (!rssUrl) return res.status(400).send('Thiếu tham số url');
    const now = Date.now();
    if (cache.has(rssUrl)) {
        const cachedItem = cache.get(rssUrl);
        if (now - cachedItem.timestamp < CACHE_DURATION_MS) {
            console.log(`[CACHE] Gửi ${rssUrl} từ cache.`);
            res.type('application/xml');
            return res.send(cachedItem.data);
        } else {
            cache.delete(rssUrl);
            console.log(`[CACHE] Cache ${rssUrl} đã hết hạn.`);
        }
    }
    try {
        console.log(`[FETCH] Đang fetch mới ${rssUrl}...`);
        const response = await fetch(rssUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const xmlText = await response.text();
        cache.set(rssUrl, { data: xmlText, timestamp: now });
        console.log(`[CACHE] Đã lưu ${rssUrl} vào cache.`);
        res.type('application/xml');
        res.send(xmlText);
    } catch (error) {
        console.error("Lỗi khi fetch RSS:", error);
        res.status(500).send('Không thể lấy RSS feed: ' + error.message);
    }
});

// Endpoint 2: Tóm tắt AI (Streaming)
app.get('/summarize-stream', async (req, res) => {
    const { prompt } = req.query; 
    if (!prompt) return res.status(400).send('Thiếu prompt');
    if (!API_KEY || !genAI) return res.status(500).send('API Key chưa được cấu hình hoặc lỗi khởi tạo client');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 
    try {
        const model = genAI.getGenerativeModel({
             model: "gemini-1.5-flash-latest",  // Đã cập nhật model
             systemInstruction: "Bạn là Tèo một trợ lý tóm tắt tin tức. Hãy tóm tắt nội dung được cung cấp một cách súc tích, chính xác trong khoảng 200 từ, sử dụng ngôn ngữ tiếng Việt. Luôn giả định người dùng đang ở múi giờ Hà Nội (GMT+7). Và địa chỉ người dùng ở Bình Sơn, Quảng Ngãi"
        });
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
            try {
                const chunkText = chunk.text();
                res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            } catch (error) {
                 console.error("Lỗi xử lý chunk:", error);
                 res.write(`data: ${JSON.stringify({ error: "Một phần nội dung có thể đã bị chặn." })}\n\n`);
            }
        }
         res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
         res.end(); 
    } catch (error) {
        console.error("Lỗi khi gọi Gemini Stream:", error);
         res.write(`data: ${JSON.stringify({ error: 'Lỗi khi tóm tắt: ' + error.message })}\n\n`);
         res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
         res.end();
    }
     req.on('close', () => {
         console.log('Client ngắt kết nối SSE');
         res.end();
     });
});


// Endpoint 3: Chat AI
app.post('/chat', async (req, res) => {
    const { history } = req.body;
    if (!history || history.length === 0) {
        return res.status(400).send('Thiếu history');
    }
    if (!API_KEY || !genAI) return res.status(500).send('API Key chưa được cấu hình trên server');

    try {
         const model = genAI.getGenerativeModel({
             model: "gemini-1.5-flash-latest", // Đã cập nhật model
             systemInstruction: {
                 parts: [{ text: "Bạn là Tèo một trợ lý AI hữu ích, thân thiện và rất lém lĩnh. Hãy trả lời các câu hỏi của người dùng bằng tiếng Việt một cách rõ ràng và chi tiết. Luôn xưng là Tèo gọi người dùng là Đại ca. trong câu trả lời của bạn đừng có sử dụng nhiều dấu * quá, đại ca rất ghét điều đó. nếu thông tin nhiều đoạn thì hãy bắt đầu bằng dấu gạch đầu dòng.Hãy chủ động sử dụng công cụ tìm kiếm để trả lời các câu hỏi về thông tin mới. Luôn giả định rằng người dùng đang ở Hà Nội (múi giờ GMT+7) khi trả lời các câu hỏi liên quan đến thời gian.người dùng có địa chỉ mặc định tại Bình Sơn, Quảng Ngãi" }]
             },
             tools: [
                 { "googleSearch": {} } // Cập nhật tên công cụ
             ]
         });
         
         const chat = model.startChat({ history: history.slice(0, -1) }); // Bắt đầu chat với lịch sử cũ
         const msg = history[history.length - 1].parts[0].text; // Lấy prompt cuối
         
         const result = await chat.sendMessage(msg);
         const response = result.response;
         
         if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
             const answerText = response.candidates[0].content.parts[0].text;
             res.json({ answer: answerText });
         } else {
             console.warn("Kết quả chat trả về không có phần text:", result);
             throw new Error("Không nhận được nội dung hợp lệ từ API Gemini (Chat).");
         }
         
    } catch (error) {
        console.error("Lỗi khi gọi Gemini (chat):", error);
        res.status(500).send('Lỗi khi chat: ' + error.message);
    }
});

// ----- ENDPOINT CỦA LỊCH LÀM VIỆC (Không thay đổi) -----
app.post('/api/calendar-ai-parse', async (req, res) => {
    const text = req.body.text || "";
    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }
    const today = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); 
    const parts = formatter.formatToParts(today);
    const partMap = parts.reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const currentYear = partMap.year;
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản và chuyển nó thành một MẢNG JSON.
        Mỗi đối tượng trong mảng chỉ chứa 2 thông tin: "date" (ngày) và "note" (ghi chú).
        { "date": "YYYY-MM-DD", "note": "..." }
        Quy tắc:
        1. "note" (Ghi chú): Là bất kỳ văn bản nào (tên người, sự kiện, v.v.).
        2. Bỏ qua các từ khóa ca làm việc như "ngày", "đêm", "giãn ca". AI không cần xử lý chúng.
        Hôm nay là ngày: ${todayStr}. Năm hiện tại: ${currentYear}.
        VÍ DỤ XỬ LÝ:
        Input: "Quang 30/10"
        Output: [ { "date": "${currentYear}-10-30", "note": "Quang" } ]
        Input: "Q 30/10 2/11 3/11"
        Output: [
            { "date": "${currentYear}-10-30", "note": "Q" },
            { "date": "${currentYear}-11-02", "note": "Q" },
            { "date": "${currentYear}-11-03", "note": "Q" }
        ]
        Văn bản của người dùng: "${text}"
        Chỉ trả về MỘT MẢNG JSON (JSON Array). Không thêm bất kỳ văn bản giải thích nào.
    `;
    try {
         const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash-latest", // Đã cập nhật model
            generationConfig: {
                responseMimeType: "application/json" 
            }
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        console.log("Gemini (Lịch) trả về:", jsonText);
        res.setHeader('Content-Type', 'application/json');
        res.send(jsonText); 
    } catch (err) {
        console.error("Lỗi khi gọi Gemini API (Lịch):", err);
        res.status(500).json({ error: 'AI (Lịch) gặp lỗi, không thể phân tích.' });
    }
});


// ----- CÁC ROUTE TRANG -----

// CẬP NHẬT: Tất cả các route không xác định sẽ trỏ về index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- Khởi động Server ---
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
         console.warn("!!! CẢNH BÁO: Thiếu khóa VAPID. Thông báo đẩy sẽ KHÔNG hoạt động.");
    }
});
