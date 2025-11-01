// --- Các thư viện cần thiết ---
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
import webpush from 'web-push'; 

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
let subscriptions = [];

// ===================================================================
// ENDPOINTS
// ===================================================================

// ----- CÁC ENDPOINT CỦA TIN TỨC -----
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

// ----- ENDPOINT CỦA LỊCH LÀM VIỆC (CẬP NHẬT) -----
app.post('/api/calendar-ai-parse', async (req, res) => {
    // CẬP NHẬT 1: Nhận cả 'text' và 'viewDate'
    const { text, viewDate } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }
    
    // CẬP NHẬT 2: Ưu tiên dùng 'viewDate' (năm 2025)
    let currentYear;
    let todayStr;

    if (viewDate && /^\d{4}-\d{2}-\d{2}$/.test(viewDate)) {
        // Nếu app gửi 'viewDate' (ví dụ: '2025-10-31'), hãy dùng năm đó
        currentYear = viewDate.substring(0, 4);
        todayStr = viewDate;
    } else {
        // Nếu không (dự phòng), dùng ngày của server (GMT+7)
        const today = new Date();
        const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options); 
        const parts = formatter.formatToParts(today);
        const partMap = parts.reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
        todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
        currentYear = partMap.year;
    }

    // CẬP NHẬT 3: Đã đưa "currentYear" đúng vào prompt
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản và chuyển nó thành một MẢNG JSON.
        Mỗi đối tượng trong mảng chỉ chứa 2 thông tin: "date" (ngày) và "note" (ghi chú).
        { "date": "YYYY-MM-DD", "note": "..." }

        Quy tắc:
        1. "note" (Ghi chú): Là bất kỳ văn bản nào (tên người, sự kiện, v.v.).
        2. Bỏ qua các từ khóa ca làm việc như "ngày", "đêm", "giãn ca". AI không cần xử lý chúng.
        
        Hôm nay là ngày: ${todayStr}. Năm hiện tại (RẤT QUAN TRỌNG, dùng năm này nếu không rõ): ${currentYear}.

        VÍ DỤ XỬ LÝ:
        Input: "Quang 30/10"
        Output: [ { "date": "${currentYear}-10-30", "note": "Quang" } ]

        Input: "Q 30/10 2/11 3/11"
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

    try {
         // CẬP NHẬT 4: Đổi "gemini-1.5-flash" thành model đang chạy
         const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-preview-09-2025",
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

// ----- ENDPOINT MỚI CHO WEB PUSH -----
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    
    const exists = subscriptions.find(s => s.endpoint === subscription.endpoint);
    if (!exists) {
        subscriptions.push(subscription);
        console.log('Đã lưu subscription mới:', subscription.endpoint);
    } else {
        console.log('Subscription đã tồn tại.');
    }

    res.status(201).json({ status: 'success' });
});

// Endpoint mới để gửi VAPID Key an toàn
app.get('/api/vapid-public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
        return res.status(500).json({ error: 'VAPID Public Key chưa được cài đặt trên server.' });
    }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
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
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
    } catch (e) {
        console.error("Lỗi dateToDays:", e, dateStr);
        return 0;
    }
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
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        const currentMinute = now.getMinutes();
        
        if (currentMinute === lastCheckedMinute) {
            return;
        }
        lastCheckedMinute = currentMinute;
        
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        // (Đây là logic cài đặt cứng, chúng ta sẽ cải tiến sau)
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

        if (timeToAlert && currentTimeStr === timeToAlert) {
            console.log(`ĐÃ ĐẾN GIỜ BÁO THỨC: ${shiftDisplayName} lúc ${currentTimeStr}`);

            const payload = JSON.stringify({
                title: "Lịch Luân Phiên",
                body: `${shiftDisplayName}` // (Tạm thời chưa có ghi chú)
            });

            const sendPromises = subscriptions.map(sub => 
                webpush.sendNotification(sub, payload)
                    .catch(err => {
                        console.error("Lỗi gửi push, có thể subscription đã hết hạn:", err.statusCode);
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
    setInterval(checkAndSendNotifications, 60000); 
});
