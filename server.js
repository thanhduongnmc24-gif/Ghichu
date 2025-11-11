// --- Các thư viện cần thiết ---
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import webpush from 'web-push'; 
import pg from 'pg'; 
import crypto from 'crypto'; 

// ----- CÀI ĐẶT CACHE (RSS) -----
const cache = new Map();
const CACHE_DURATION_MS = 3 * 60 * 1000; 

// --- Cài đặt Server ---
const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(cors());
app.use(express.json());
// (SỬA LỖI ĐƯỜNG DẪN 1/2) Dùng đường dẫn gốc (giả định public và server.js ở cùng 1 cấp)
app.use(express.static(path.join(__dirname, 'public')));

// --- CÀI ĐẶT GOOGLE AI ---
const API_KEY = process.env.GEMINI_API_KEY;
let genAI;
let aiModel;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
    aiModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-preview-09-2025", 
        safetySettings
    });

} else {
    console.error("Thiếu GEMINI_API_KEY trong biến môi trường!");
}

// ----- CÀI ĐẶT WEB PUSH -----
// ... (Giữ nguyên)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error("Thiếu VAPID keys! Thông báo PUSH sẽ không hoạt động.");
} else {
    webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    console.log("Web Push đã được cấu hình.");
}

// ----- CÀI ĐẶT DATABASE -----
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- Helper functions for Password Hashing ---
// ... (Giữ nguyên)
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}
function verifyPassword(inputPassword, storedHash, salt) {
    const hashToCompare = crypto.pbkdf2Sync(inputPassword, salt, 1000, 64, 'sha512').toString('hex');
    return storedHash === hashToCompare;
}

// --- (Các hàm tiện ích) ---
function getHanoiTime() {
    // ... (Giữ nguyên hàm getHanoiTime)
    const now = new Date();
    const hanoiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const timeStr = hanoiNow.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateStr = hanoiNow.toLocaleDateString('en-CA');
    const isoStr = new Date(hanoiNow.getTime() - (hanoiNow.getTimezoneOffset() * 60000)).toISOString().replace('Z', '+07:00');
    return { timeStr, dateStr, isoStr };
}

async function saveAlertToDb(endpoint, topic, alertTimeISO) {
    // ... (Giữ nguyên hàm saveAlertToDb)
    if (!endpoint) {
        console.warn("Thất bại: set_alert được gọi nhưng không có endpoint.");
        return { success: false, message: "Lỗi: Không tìm thấy danh tính người dùng. Hãy yêu cầu họ bật thông báo đẩy trước khi hẹn giờ." };
    }
    const alertTime = new Date(alertTimeISO);
    if (isNaN(alertTime.getTime())) {
        console.warn("Thất bại: set_alert được gọi với thời gian không hợp lệ:", alertTimeISO);
        return { success: false, message: `Lỗi: Thời gian không hợp lệ: ${alertTimeISO}` };
    }
    const query = `INSERT INTO ai_alerts (endpoint, topic, alert_time) VALUES ($1, $2, $3)`;
    try {
        await pool.query(query, [endpoint, topic, alertTime]);
        console.log("Đã lưu ai_alert:", { endpoint, topic, alertTimeISO });
        return { success: true, message: `Đã hẹn thành công thông báo cho chủ đề '${topic}' vào lúc ${alertTimeISO}` };
    } catch (error) {
        console.error("Lỗi khi lưu ai_alert vào DB:", error);
        return { success: false, message: "Lỗi: Không thể lưu hẹn giờ vào cơ sở dữ liệu." };
    }
}


// (SỬA LỖI RACE CONDITION) Hàm tự động tạo/cập nhật bảng VÀ KHỞI ĐỘNG SERVER
(async () => {
    const client = await pool.connect();
    try {
        // 1. Bảng Subscriptions
        await client.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                endpoint TEXT NOT NULL UNIQUE,
                keys JSONB NOT NULL,
                settings JSONB NOT NULL,
                notes JSONB DEFAULT '{}'::jsonb, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Bảng 'subscriptions' đã sẵn sàng.");

        // 2. Bảng User Notes
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_notes (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                notes JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_admin BOOLEAN DEFAULT false
            );
        `);
        try {
            await client.query(`ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;`);
        } catch (alterErr) { /* Bỏ qua nếu cột đã tồn tại */ }
        console.log("Bảng 'user_notes' đã sẵn sàng.");

        // 3. Bảng Hẹn giờ AI
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS ai_alerts (
                    id SERIAL PRIMARY KEY,
                    endpoint TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    alert_time TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log("Bảng 'ai_alerts' đã sẵn sàng trên Supabase.");
        } catch (alterErr) {
            console.error("Lỗi khi tạo bảng 'ai_alerts':", alterErr);
        }
        
        // ==========================================================
        // (SỬA LỖI RACE CONDITION) DI CHUYỂN app.listen VÀO ĐÂY
        // ==========================================================
        // Server CHỈ khởi động SAU KHI đã tạo bảng xong
        
        app.listen(PORT, () => {
            console.log(`Server đang chạy tại http://localhost:${PORT}`);
            
            console.log("Khởi động bộ đếm thời gian (kiểm tra mỗi 60 giây)...");
            
            // Chạy ngay lần đầu
            (async () => {
                console.log("Khởi động: Chạy kiểm tra lần đầu...");
                try {
                    await checkAndSendShiftNotifications();
                    await checkAndSendAiAlerts();
                } catch (err) {
                    console.error("Lỗi khi chạy kiểm tra lần đầu:", err);
                }
            })();

            // Chạy định kỳ mỗi phút
            setInterval(async () => {
                try {
                    await checkAndSendShiftNotifications();
                    await checkAndSendAiAlerts();
                } catch (err) {
                    console.error("Lỗi trong quá trình kiểm tra tự động:", err);
                }
            }, 60 * 1000); // 60 giây
        });
        // ==========================================================
        // KẾT THÚC DI CHUYỂN
        // ==========================================================

    } catch (err) {
        console.error("LỖI NGHIÊM TRỌNG KHI KHỞI TẠO DB:", err);
        // Nếu lỗi ở đây, server sẽ không khởi động (do app.listen nằm bên trong)
    } finally {
        client.release();
    }
})(); // <--- Hàm này tự chạy


// ----- (HÀM MIDDLEWARE KIỂM TRA ADMIN) -----
const checkAdmin = async (req, res, next) => {
    // ... (Giữ nguyên hàm checkAdmin)
    const { adminUser, adminPass } = req.body;
    if (!adminUser || !adminPass) return res.status(401).json({ error: 'Thiếu thông tin xác thực Admin.' });
    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [adminUser]);
        if (userResult.rows.length === 0) return res.status(401).json({ error: 'Admin không tồn tại.' });
        const admin = userResult.rows[0];
        const isVerified = verifyPassword(adminPass, admin.password_hash, admin.salt);
        if (!isVerified) return res.status(401).json({ error: 'Mật khẩu Admin không đúng.' });
        if (admin.is_admin !== true) return res.status(403).json({ error: 'Tài khoản này không có quyền Admin.' });
        next();
    } catch (error) {
        console.error("Lỗi khi checkAdmin:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi xác thực Admin.' });
    } finally {
        client.release();
    }
};


// ----- CÁC ENDPOINT CỦA TIN TỨC -----
app.get('/get-rss', async (req, res) => {
    // ... (Giữ nguyên hàm get-rss)
    const rssUrl = req.query.url;
    if (!rssUrl) return res.status(400).send('Thiếu tham số url');
    const now = Date.now();
    if (cache.has(rssUrl)) {
        const cachedItem = cache.get(rssUrl);
        if (now - cachedItem.timestamp < CACHE_DURATION_MS) {
            res.type('application/xml');
            return res.send(cachedItem.data);
        } else { cache.delete(rssUrl); }
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
    // ... (Giữ nguyên hàm summarize-stream)
    const { prompt } = req.query; 
    if (!prompt) return res.status(400).send('Thiếu prompt');
    if (!API_KEY || !genAI) return res.status(500).send('API Key chưa được cấu hình hoặc lỗi khởi tạo client');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
     req.on('close', () => { res.end(); });
});


// ----- ENDPOINT CHAT ĐÃ NÂNG CẤP -----
app.post('/chat', async (req, res) => {
    // ... (Giữ nguyên hàm /chat đã nâng cấp)
    const { history, endpoint } = req.body;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
    if (!history || history.length === 0) return res.status(400).send('Thiếu history');
    if (!API_KEY) return res.status(500).send('API Key chưa được cấu hình');
    const { isoStr } = getHanoiTime();
    const tools = [
        { "functionDeclarations": [
            { "name": "set_alert",
              "description": "Đặt một thông báo/hẹn giờ/nhắc nhở cho người dùng vào một thời điểm cụ thể trong tương lai.",
              "parameters": {
                "type": "OBJECT",
                "properties": {
                  "topic": { "type": "STRING", "description": "Chủ đề hoặc nội dung cần thông báo. Ví dụ: 'tin tức iPhone 17', 'thời tiết Quảng Ngãi ngày mai', 'kết quả trận M.U.'" },
                  "alert_time": { "type": "STRING", "description": "Thời gian chính xác để gửi thông báo, phải ở định dạng ISO 8601 (ví dụ: '2025-11-13T07:00:00+07:00')." }
                },
                "required": ["topic", "alert_time"]
              }
            }
        ]},
        { "googleSearch": {} }
    ];
    const systemInstruction = {
        parts: [{ text: `
Bạn là Tèo, một trợ lý AI hữu ích, thân thiện và lém lỉnh. Luôn xưng là Tèo, gọi người dùng là Đại ca.
Múi giờ của Đại ca là Hà Nội (GMT+7). Địa chỉ mặc định: Bình Sơn, Quảng Ngãi.
HÔM NAY LÀ: ${isoStr}. Hãy dùng mốc thời gian này để tính toán mọi thời gian tương đối (ví dụ: 'ngày mai', '7h tối').
Bạn có 2 công cụ:
1.  googleSearch: Tự động tìm kiếm thông tin mới.
2.  set_alert(topic, alert_time): Hẹn giờ để Tèo chủ động gửi thông báo cho Đại ca.
    -   Khi Đại ca yêu cầu hẹn giờ, hãy luôn chuyển đổi thời gian (ví dụ: '7h sáng mai') sang định dạng ISO 8601 đầy đủ (ví dụ: '${isoStr.substring(0, 11)}07:00:00+07:00') dựa vào mốc 'HÔM NAY LÀ'.
    -   Luôn xác nhận chủ đề (topic) rõ ràng.
KHÔNG sử dụng nhiều dấu * trong câu trả lời.
        `.trim() }]
    };
    try {
        let contents = [...history];
        let payload = { contents: contents, systemInstruction: systemInstruction, tools: tools };
        let geminiResponse = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error("Lỗi vòng 1 Gemini:", errorBody);
            throw new Error(`Lỗi từ Gemini: ${geminiResponse.status}`);
        }
        let result = await geminiResponse.json();
        const call = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;
        if (call) {
            if (call.name === 'set_alert') {
                const { topic, alert_time } = call.args;
                const dbResult = await saveAlertToDb(endpoint, topic, alert_time);
                contents.push(result.candidates[0].content); 
                contents.push({ "role": "function", "parts": [{ "functionResponse": { "name": "set_alert", "response": dbResult }}] });
                payload.contents = contents; 
                geminiResponse = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!geminiResponse.ok) {
                    const errorBody = await geminiResponse.json();
                    console.error("Lỗi vòng 2 Gemini:", errorBody);
                    throw new Error(`Lỗi từ Gemini (vòng 2): ${geminiResponse.status}`);
                }
                result = await geminiResponse.json();
            }
        }
        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            const answerText = result.candidates[0].content.parts[0].text;
            res.json({ answer: answerText });
        } else {
            console.warn("Gemini không trả về text:", result);
            throw new Error("Không nhận được nội dung hợp lệ từ API Gemini.");
        }
    } catch (error) {
        console.error("Lỗi khi gọi Gemini (chat):", error);
        res.status(500).send('Lỗi khi chat: ' + error.message);
    }
});


// ----- ENDPOINT CỦA LỊCH LÀM VIỆC -----
app.post('/api/calendar-ai-parse', async (req, res) => {
    // ... (Giữ nguyên hàm calendar-ai-parse)
    const text = req.body.text || "";
    if (!text) return res.status(400).json({ error: 'Không có văn bản' });
    const { dateStr, isoStr } = getHanoiTime();
    const currentYear = dateStr.substring(0, 4);
    const prompt = `
        Bạn là trợ lý phân tích lịch làm việc. Nhiệm vụ của bạn là đọc văn bản và chuyển nó thành một MẢNG JSON.
        Mỗi đối tượng trong mảng chỉ chứa 2 thông tin: "date" (ngày) và "note" (ghi chú).
        { "date": "YYYY-MM-DD", "note": "..." }
        Quy tắc:
        1. "note" (Ghi chú): Là bất kỳ văn bản nào (tên người, sự kiện, v.v.).
        2. Bỏ qua các từ khóa ca làm việc như "ngày", "đêm", "giãn ca". AI không cần xử lý chúng.
        Hôm nay là ngày: ${dateStr}. Năm hiện tại: ${currentYear}.
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
            model: "gemini-1.5-flash",
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


// ----- CÁC ENDPOINT CHO PUSH NOTIFICATION -----
app.get('/vapid-public-key', (req, res) => {
    // ... (Giữ nguyên)
    if (!VAPID_PUBLIC_KEY) return res.status(500).send("VAPID Public Key chưa được cấu hình.");
    res.send(VAPID_PUBLIC_KEY);
});

app.post('/subscribe', async (req, res) => {
    // ... (Giữ nguyên)
    const { subscription, settings, noteData } = req.body;
    if (!subscription || !settings || !subscription.endpoint || !subscription.keys) {
        return res.status(400).send("Thiếu thông tin subscription hoặc settings.");
    }
    const { endpoint, keys } = subscription;
    const notesToStore = noteData || {}; 
    const query = `
        INSERT INTO subscriptions (endpoint, keys, settings, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (endpoint)
        DO UPDATE SET settings = $3, notes = $4;
    `;
    try {
        await pool.query(query, [endpoint, keys, settings, notesToStore]);
        console.log("Đã lưu/cập nhật subscription:", endpoint.slice(-10));
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi lưu subscription vào DB:", error);
        res.status(500).send("Lỗi máy chủ khi lưu subscription.");
    }
});

app.post('/unsubscribe', async (req, res) => {
    // ... (Giữ nguyên)
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).send("Thiếu thông tin endpoint.");
    const query = "DELETE FROM subscriptions WHERE endpoint = $1";
    try {
        const result = await pool.query(query, [endpoint]);
        if (result.rowCount > 0) console.log("Đã xóa subscription:", endpoint.slice(-10));
        else console.log("Không tìm thấy subscription để xóa:", endpoint.slice(-10));
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi hủy đăng ký subscription:", error);
        res.status(500).send("Lỗi máy chủ khi hủy đăng ký.");
    }
});

app.post('/update-notes', async (req, res) => {
    // ... (Giữ nguyên)
    const { endpoint, noteData } = req.body;
    if (!endpoint || !noteData) return res.status(400).send("Thiếu endpoint hoặc noteData.");
    const query = "UPDATE subscriptions SET notes = $1 WHERE endpoint = $2";
    try {
        await pool.query(query, [noteData, endpoint]);
        console.log("Đã đồng bộ ghi chú cho:", endpoint.slice(-10));
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi cập nhật ghi chú:", error);
        res.status(500).send("Lỗi máy chủ khi cập nhật ghi chú.");
    }
});


// ----- CÁC ENDPOINT CHO SYNC ONLINE -----
app.post('/api/sync/up', async (req, res) => {
    // ... (Giữ nguyên)
    const { username, password, noteData } = req.body;
    if (!username || !password || !noteData) return res.status(400).json({ error: 'Thiếu Tên, Mật khẩu, hoặc Dữ liệu Ghi chú.' });
    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [username]);
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const isVerified = verifyPassword(password, user.password_hash, user.salt);
            if (!isVerified) return res.status(401).json({ error: 'Mật khẩu không đúng.' });
            await client.query("UPDATE user_notes SET notes = $1 WHERE username = $2", [noteData, username]);
            res.status(200).json({ success: true, message: 'Đã cập nhật dữ liệu thành công.' });
        } else {
            const { salt, hash } = hashPassword(password);
            await client.query("INSERT INTO user_notes (username, password_hash, salt, notes) VALUES ($1, $2, $3, $4)", [username, hash, salt, noteData]);
            res.status(201).json({ success: true, message: 'Đã tạo tài khoản và lưu dữ liệu thành công.' });
        }
    } catch (error) {
        console.error("Lỗi khi /api/sync/up:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally { client.release(); }
});

app.post('/api/sync/down', async (req, res) => {
    // ... (Giữ nguyên)
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu Tên hoặc Mật khẩu.' });
    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [username]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'Tên đăng nhập không tồn tại.' });
        const user = userResult.rows[0];
        const isVerified = verifyPassword(password, user.password_hash, user.salt);
        if (!isVerified) return res.status(401).json({ error: 'Mật khẩu không đúng.' });
        res.status(200).json(user.notes || {});
    } catch (error) {
        console.error("Lỗi khi /api/sync/down:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally { client.release(); }
});


// ----- CÁC ENDPOINT CHO ADMIN -----
app.post('/api/admin/get-users', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên)
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT username, created_at, is_admin FROM user_notes WHERE username != $1 ORDER BY created_at DESC", [req.body.adminUser]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Lỗi khi /api/admin/get-users:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally { client.release(); }
});

app.post('/api/admin/get-notes', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên)
    const { targetUser } = req.body;
    if (!targetUser) return res.status(400).json({ error: 'Thiếu targetUser.' });
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT notes FROM user_notes WHERE username = $1", [targetUser]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Người dùng mục tiêu không tồn tại.' });
        res.status(200).json(result.rows[0].notes || {});
    } catch (error) {
        console.error("Lỗi khi /api/admin/get-notes:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally { client.release(); }
});

app.post('/api/admin/delete-user', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên)
    const { targetUser } = req.body;
    if (!targetUser) return res.status(400).json({ error: 'Thiếu targetUser.' });
    if (targetUser === req.body.adminUser) return res.status(400).json({ error: 'Không thể tự xóa tài khoản Admin.' });
    const client = await pool.connect();
    try {
        const result = await client.query("DELETE FROM user_notes WHERE username = $1 AND is_admin = false", [targetUser]);
        if (result.rowCount > 0) res.status(200).json({ success: true, message: `Đã xóa người dùng: ${targetUser}` });
        else res.status(404).json({ error: 'Người dùng không tồn tại hoặc là Admin khác.' });
    } catch (error) {
        console.error("Lỗi khi /api/admin/delete-user:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally { client.release(); }
});


// ----- LOGIC GỬI THÔNG BÁO -----

// Logic tính ca
const EPOCH_DAYS = dateToDays('2025-10-26');
const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];
function dateToDays(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}
function getShiftForDate(dateStr) {
    const currentDays = dateToDays(dateStr);
    const diffDays = currentDays - EPOCH_DAYS;
    const patternIndex = (diffDays % SHIFT_PATTERN.length + SHIFT_PATTERN.length) % SHIFT_PATTERN.length;
    return SHIFT_PATTERN[patternIndex];
}
async function deleteSubscription(endpoint) {
    console.log("Đang xóa sub hết hạn:", endpoint.slice(-10));
    try {
        await pool.query("DELETE FROM subscriptions WHERE endpoint = $1", [endpoint]);
        await pool.query("DELETE FROM ai_alerts WHERE endpoint = $1", [endpoint]);
    } catch (err) {
        console.error("Lỗi khi xóa sub hết hạn:", err);
    }
}

/**
 * Gửi thông báo đẩy (đã tùy chỉnh cho iOS).
 */
async function sendNotification(subscription, title, body) {
    let notificationPayload;
    if (subscription.endpoint.startsWith('https://web.push.apple.com')) {
        notificationPayload = JSON.stringify({
            aps: { alert: { title: title, body: body } }
        });
    } else {
        notificationPayload = JSON.stringify({ title: title, body: body });
    }
    
    try {
        await webpush.sendNotification(subscription, notificationPayload);
    } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
            deleteSubscription(subscription.endpoint);
        } else {
            console.error("Lỗi khi gửi push:", err);
        }
    }
}


let lastNotificationCheckTime = null;
async function checkAndSendShiftNotifications() {
    const { timeStr, dateStr } = getHanoiTime();
    if (timeStr === lastNotificationCheckTime) return;
    lastNotificationCheckTime = timeStr;
    const todayShift = getShiftForDate(dateStr);
    let subscriptions;
    try {
        const result = await pool.query("SELECT endpoint, keys, settings, notes FROM subscriptions");
        subscriptions = result.rows;
    } catch (error) {
        console.error("Không thể đọc subscriptions từ DB:", error);
        return;
    }
    if (subscriptions.length === 0) return;
    console.log(`[Notify Check] ${timeStr} | Ca hôm nay: ${todayShift} | Subs: ${subscriptions.length}`);
    const sendPromises = subscriptions.map(sub => {
        const { endpoint, keys, settings, notes } = sub;
        let timeToAlert = null;
        if (todayShift === 'ngày') timeToAlert = settings.notifyTimeNgay;
        else if (todayShift === 'đêm') timeToAlert = settings.notifyTimeDem;
        else if (todayShift === 'giãn ca') timeToAlert = settings.notifyTimeOff;
        if (timeToAlert && timeStr === timeToAlert) {
            console.log(`Đang gửi thông báo ${todayShift} đến:`, endpoint.slice(-10));
            const notesForToday = (notes && notes[dateStr]) ? notes[dateStr] : [];
            let bodyContent = "";
            if (notesForToday.length > 0) bodyContent = "Ghi chú:\n" + notesForToday.join('\n');
            else bodyContent = `Không có ghi chú cho hôm nay (${dateStr}).`;
            if (bodyContent.length > 150) bodyContent = bodyContent.substring(0, 150) + "...";
            const title = `Lịch Luân Phiên - Ca ${todayShift.toUpperCase()}`;
            const pushSubscription = { endpoint: endpoint, keys: keys };
            return sendNotification(pushSubscription, title, bodyContent);
        }
        return Promise.resolve();
    });
    await Promise.all(sendPromises);
}

// (MỚI - GĐ 4) HÀM KIỂM TRA HẸN GIỜ AI
async function checkAndSendAiAlerts() {
    let alerts;
    try {
        // Lấy tất cả hẹn giờ đã đến lúc (NOW() đã bao gồm múi giờ)
        const result = await pool.query(
            "SELECT id, endpoint, topic FROM ai_alerts WHERE alert_time <= NOW()"
        );
        alerts = result.rows;
    } catch (error) {
        console.error("Không thể đọc ai_alerts từ DB:", error);
        return; // Lỗi 42P01 sẽ xảy ra ở đây
    }

    if (alerts.length === 0) return; // Không có hẹn giờ nào

    console.log(`[AI Alert Check] Tìm thấy ${alerts.length} hẹn giờ AI cần gửi.`);

    const sendPromises = alerts.map(async (alert) => {
        const { id, endpoint, topic } = alert;
        let subscription;
        try {
            const subResult = await pool.query("SELECT keys FROM subscriptions WHERE endpoint = $1", [endpoint]);
            if (subResult.rows.length === 0) {
                console.warn(`Không tìm thấy subscription cho endpoint ${endpoint} (AI Alert), đang xóa hẹn giờ...`);
                await pool.query("DELETE FROM ai_alerts WHERE id = $1", [id]);
                return;
            }
            subscription = { endpoint: endpoint, keys: subResult.rows[0].keys };
        } catch (err) {
            console.error("Lỗi khi lấy keys cho AI Alert:", err);
            return;
        }

        // Tạo prompt cho AI để tìm tin
        const prompt = `Bạn là Tèo. Hãy tìm thông tin mới nhất và tóm tắt về chủ đề sau trong khoảng 50 từ, viết bằng tiếng Việt: "${topic}"`;
        let summary = `Không thể tìm thấy thông tin về: "${topic}"`;
        try {
            const chatSession = aiModel.startChat({
                tools: [{ "googleSearch": {} }]
            });
            const result = await chatSession.sendMessage(prompt);
            summary = result.response.text();
        } catch (aiError) {
            console.error("Lỗi khi AI tìm tin (AI Alert):", aiError);
            summary = `Tèo bị lỗi khi tìm tin về: "${topic}".`;
        }
        
        console.log(`Đang gửi AI Alert về '${topic}' đến:`, endpoint.slice(-10));
        const title = `Tèo Báo Tin: ${topic}`;
        await sendNotification(subscription, title, summary);
        
        try {
            await pool.query("DELETE FROM ai_alerts WHERE id = $1", [id]);
        } catch (deleteErr) {
            console.error("Lỗi khi xóa ai_alert (id: ${id}):", deleteErr);
        }
    });
    await Promise.all(sendPromises);
}


// Endpoint của Cron Job (Giữ lại để test)
app.get('/trigger-notifications', (req, res) => {
    // ... (Giữ nguyên)
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.VAPID_PRIVATE_KEY) { 
        console.warn("Cron trigger không hợp lệ (sai secret)");
        return res.status(401).send("Unauthorized");
    }
    try {
        console.log("Cron Job triggered MANUALLY: Đang chạy kiểm tra...");
        checkAndSendShiftNotifications();
        checkAndSendAiAlerts();
        res.status(200).send('Notification check OK.');
    } catch (err) {
        console.error("Lỗi khi chạy Cron Job:", err);
        res.status(500).send('Cron Job Error.');
    }
});


// ----- CÁC ROUTE TRANG -----
app.get('*', (req, res) => {
    // (SỬA LỖI ĐƯỜNG DẪN 2/2)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ==========================================================
// ===== (SỬA LỖI RACE CONDITION) KHỞI ĐỘNG SERVER =====
// ==========================================================
// TOÀN BỘ LOGIC app.listen ĐÃ ĐƯỢC DI CHUYỂN LÊN TRÊN, VÀO BÊN TRONG HÀM TẠO BẢNG
// (async () => { ... })();
// Mục này bây giờ để trống.