// --- Các thư viện cần thiết ---
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
import webpush from 'web-push'; // <-- GÓI MỚI

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

// --- CÀI ĐẶT API KEYS ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

// Khởi tạo client Google AI
let genAI;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
} else {
    console.error("Thiếu GEMINI_API_KEY trong biến môi trường!");
}

// CÀI ĐẶT WEB-PUSH (VAPID)
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:your-email@example.com', // Thay bằng email của bạn (không bắt buộc)
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    console.log("Web Push VAPID đã được cài đặt.");
} else {
    console.error("Thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY!");
}

// CƠ SỞ DỮ LIỆU GIẢ LẬP (Lưu "số điện thoại" đăng ký)
// Khi server restart, dữ liệu này sẽ mất. 
// Trong tương lai, bạn có thể lưu vào file JSON hoặc database.
let subscriptions = [];

// ===================================================================
// ENDPOINTS
// ===================================================================

// ----- CÁC ENDPOINT CỦA TIN TỨC -----
// (Toàn bộ logic /get-rss, /summarize-stream, /chat giữ nguyên)
app.get('/get-rss', async (req, res) => {
    // (Giữ nguyên logic fetch RSS...)
    const rssUrl = req.query.url;
    if (!rssUrl) return res.status(400).send('Thiếu tham số url');
    const now = Date.now();
    if (cache.has(rssUrl)) {
        const cachedItem = cache.get(rssUrl);
        if (now - cachedItem.timestamp < CACHE_DURATION_MS) {
            res.type('application/xml');
            return res.send(cachedItem.data);
        } else {
            cache.delete(rssUrl);
        }
    }
    try {
        const response = await fetch(rssUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const xmlText = await response.text();
        cache.set(rssUrl, { data: xmlText, timestamp: now });
        res.type('application/xml');
        res.send(xmlText);
    } catch (error) {
        console.error("Lỗi khi fetch RSS:", error);
        res.status(500).send('Không thể lấy RSS feed: ' + error.message);
    }
});
app.get('/summarize-stream', async (req, res) => {
    // (Giữ nguyên logic Tóm tắt...)
    const { prompt } = req.query; 
    if (!prompt) return res.status(400).send('Thiếu prompt');
    if (!GEMINI_API_KEY || !genAI) return res.status(500).send('API Key chưa được cấu hình hoặc lỗi khởi tạo client');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 
    try {
        const model = genAI.getGenerativeModel({
             model: "gemini-2.5-flash-preview-09-2025", 
             systemInstruction: "Bạn là Tèo một trợ lý tóm tắt tin tức..."
        });
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
            try {
                const chunkText = chunk.text();
                res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            } catch (error) {
                 res.write(`data: ${JSON.stringify({ error: "Một phần nội dung có thể đã bị chặn." })}\n\n`);
            }
        }
         res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
         res.end(); 
    } catch (error) {
         res.write(`data: ${JSON.stringify({ error: 'Lỗi khi tóm tắt: ' + error.message })}\n\n`);
         res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
         res.end();
    }
     req.on('close', () => { res.end(); });
});
app.post('/chat', async (req, res) => {
    // (Giữ nguyên logic Chat...)
    const { history } = req.body;
    if (!history || history.length === 0) return res.status(400).send('Thiếu history');
    if (!GEMINI_API_KEY) return res.status(500).send('API Key chưa được cấu hình trên server');
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: history,
        systemInstruction: {
            parts: [{ text: "Bạn là Tèo một trợ lý AI hữu ích..." }]
        },
        tools: [ { "google_search": {} } ]
    };
    try {
        const geminiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            throw new Error(`Lỗi từ Gemini: ${geminiResponse.status}`);
        }
        const result = await geminiResponse.json();
        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            const answerText = result.candidates[0].content.parts[0].text;
            res.json({ answer: answerText });
        } else {
            throw new Error("Không nhận được nội dung hợp lệ từ API Gemini.");
        }
    } catch (error) {
        console.error("Lỗi khi gọi Gemini (chat):", error);
        res.status(500).send('Lỗi khi chat: ' + error.message);
    }
});

// ----- ENDPOINT CỦA LỊCH LÀM VIỆC -----
app.post('/api/calendar-ai-parse', async (req, res) => {
    // (Giữ nguyên logic AI của Lịch...)
    const text = req.body.text || "";
    if (!text) return res.status(400).json({ error: 'Không có văn bản' });
    const today = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); 
    const parts = formatter.formatToParts(today);
    const partMap = parts.reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const currentYear = partMap.year;
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc...
        { "date": "YYYY-MM-DD", "note": "..." }
        ...
        Văn bản của người dùng: "${text}"
        ...
    `;
    try {
         const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        res.setHeader('Content-Type', 'application/json');
        res.send(jsonText); 
    } catch (err) {
        console.error("Lỗi khi gọi Gemini API (Lịch):", err);
        res.status(500).json({ error: 'AI (Lịch) gặp lỗi, không thể phân tích.' });
    }
});

// ----- CẬP NHẬT: ENDPOINT MỚI CHO WEB PUSH -----
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    
    // Kiểm tra xem subscription đã tồn tại chưa (dựa trên endpoint)
    const exists = subscriptions.find(s => s.endpoint === subscription.endpoint);
    if (!exists) {
        subscriptions.push(subscription);
        console.log('Đã lưu subscription mới:', subscription.endpoint);
    } else {
        console.log('Subscription đã tồn tại.');
    }

    res.status(201).json({ status: 'success' });
});

// ----- CÁC ROUTE TRANG -----
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// LOGIC BÁO THỨC (CHẠY 24/7 TRÊN SERVER)
// ===================================================================

// --- Các hàm tính toán ca (giống hệt app.js) ---
function dateToDays(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}
const EPOCH_DAYS = dateToDays('2025-10-26');
const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];
function getShiftForDate(dateStr) {
    const currentDays = dateToDays(dateStr);
    const diffDays = currentDays - EPOCH_DAYS;
    const patternIndex = (diffDays % SHIFT_PATTERN.length + SHIFT_PATTERN.length) % SHIFT_PATTERN.length;
    return SHIFT_PATTERN[patternIndex];
}

// --- Hàm kiểm tra và gửi Thông báo Đẩy ---
let lastCheckedMinute = -1;

async function checkAndSendNotifications() {
    try {
        // 1. Lấy giờ hiện tại (GMT+7)
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        const currentMinute = now.getMinutes();
        
        // 2. Chỉ chạy 1 lần mỗi phút
        if (currentMinute === lastCheckedMinute) {
            return;
        }
        lastCheckedMinute = currentMinute;
        
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        // 3. Tìm xem có ca nào khớp với giờ hiện tại không
        // (Chúng ta không thể đọc localStorage của người dùng, nên tạm thời hardcode)
        // (Trong tương lai, bạn sẽ lưu cài đặt này chung với subscription)
        const settings = {
            notifyTimeNgay: "06:00",
            notifyTimeDem: "20:00",
            notifyTimeOff: "08:00"
        };
        
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayShift = getShiftForDate(todayStr);

        let shiftDisplayName = "";
        let timeToAlert = "";

        if (todayShift === 'ngày') {
            shiftDisplayName = "Ca Ngày";
            timeToAlert = settings.notifyTimeNgay;
        } else if (todayShift === 'đêm') {
            shiftDisplayName = "Ca Đêm";
            timeToAlert = settings.notifyTimeDem;
        } else if (todayShift === 'giãn ca') {
            shiftDisplayName = "Giãn Ca";
            timeToAlert = settings.notifyTimeOff;
        }

        // 4. Nếu đúng giờ
        if (timeToAlert && currentTimeStr === timeToAlert) {
            console.log(`ĐÃ ĐẾN GIỜ BÁO THỨC: ${shiftDisplayName} lúc ${currentTimeStr}`);

            // 5. Chuẩn bị nội dung thông báo
            const payload = JSON.stringify({
                title: "Lịch Luân Phiên",
                body: `${shiftDisplayName}` // Server không thể đọc Ghi chú (vì nó lưu ở localStorage),
                                          // chúng ta sẽ sửa điều này sau.
            });

            // 6. Gửi cho TẤT CẢ những ai đã đăng ký
            const sendPromises = subscriptions.map(sub => 
                webpush.sendNotification(sub, payload)
                    .catch(err => {
                        console.error("Lỗi gửi push, có thể subscription đã hết hạn:", err.statusCode);
                        // Nếu lỗi 410 (Gone), xóa sub này đi
                        if (err.statusCode === 410) {
                            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        }
                    })
            );
            
            await Promise.all(sendPromises);
        }

    } catch (error) {
        console.error("Lỗi nghiêm trọng trong vòng lặp kiểm tra thông báo:", error);
    }
}

// --- Khởi động Server ---
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    // Bắt đầu vòng lặp kiểm tra thông báo (chạy mỗi phút)
    setInterval(checkAndSendNotifications, 60000); 
});
