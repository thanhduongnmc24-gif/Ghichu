// --- Các thư viện cần thiết ---
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
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
// (SỬA LỖI DEPLOY) Đảm bảo đường dẫn này đúng (server.js và public/ ngang hàng)
app.use(express.static(path.join(__dirname, 'public')));

// --- CÀI ĐẶT GOOGLE AI ---
const API_KEY = process.env.GEMINI_API_KEY;
let genAI;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
} else {
    console.error("Thiếu GEMINI_API_KEY trong biến môi trường!");
}

// ----- CÀI ĐẶT WEB PUSH -----
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
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(inputPassword, storedHash, salt) {
    const hashToCompare = crypto.pbkdf2Sync(inputPassword, salt, 1000, 64, 'sha512').toString('hex');
    return storedHash === hashToCompare;
}

// (MỚI) HÀM KHỞI TẠO DATABASE (Sẽ được gọi SAU KHI server chạy)
async function initializeDatabase() {
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
        console.log("Bảng 'subscriptions' đã sẵn sàng trên Supabase.");

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
        console.log("Bảng 'user_notes' (có is_admin) đã sẵn sàng trên Supabase.");

        // 3. Cập nhật bảng user_notes
        try {
            await client.query(`
                ALTER TABLE user_notes
                ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
            `);
            console.log("Bảng 'user_notes' đã được cập nhật với cột 'is_admin'.");
        } catch (alterErr) {
            // Lỗi này có thể xảy ra nếu cột đã tồn tại (race condition), bỏ qua
        }

        // 4. (CẬP NHẬT) Bảng Nhắc nhở (Reminders) - GỠ BỎ FOREIGN KEY
        await client.query(`
            CREATE TABLE IF NOT EXISTS reminders (
                id SERIAL PRIMARY KEY,
                endpoint TEXT NOT NULL,
                message TEXT NOT NULL,
                remind_at TIMESTAMP WITH TIME ZONE,
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                
                -- (SỬA) ĐÃ XÓA FOREIGN KEY ĐỂ TRÁNH LỖI KHI LƯU
            );
        `);
        console.log("Bảng 'reminders' (đã gỡ FK) đã sẵn sàng.");

        // 5. Xóa bảng cũ nếu tồn tại
        try {
            await client.query(`DROP TABLE IF EXISTS scheduled_notifications;`);
            console.log("Đã xóa bảng 'scheduled_notifications' cũ (nếu có).");
        } catch (dropErr) {
            // Bỏ qua nếu không xóa được
        }

    } catch (err) {
        console.error("LỖI KHỞI TẠO DATABASE:", err);
        // Ném lỗi này để báo cho server biết là DB hỏng
        throw err; 
    } finally {
        client.release();
    }
}


// ----- HÀM MIDDLEWARE KIỂM TRA ADMIN (Không thay đổi) -----
const checkAdmin = async (req, res, next) => {
    // ... (Giữ nguyên code)
    const { adminUser, adminPass } = req.body;

    if (!adminUser || !adminPass) {
        return res.status(401).json({ error: 'Thiếu thông tin xác thực Admin.' });
    }

    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [adminUser]);
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Admin không tồn tại.' });
        }

        const admin = userResult.rows[0];
        
        const isVerified = verifyPassword(adminPass, admin.password_hash, admin.salt);
        if (!isVerified) {
            return res.status(401).json({ error: 'Mật khẩu Admin không đúng.' });
        }

        if (admin.is_admin !== true) {
            return res.status(403).json({ error: 'Tài khoản này không có quyền Admin.' });
        }
        
        next();

    } catch (error) {
        console.error("Lỗi khi checkAdmin:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi xác thực Admin.' });
    } finally {
        client.release();
    }
};


// ----- CÁC ENDPOINT CỦA TIN TỨC (Không thay đổi) -----
app.get('/get-rss', async (req, res) => {
    // ... (Giữ nguyên code)
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
    // ... (Giữ nguyên code)
    const { prompt } = req.query; 

    if (!prompt) return res.status(400).send('Thiếu prompt');
    if (!API_KEY || !genAI) return res.status(500).send('API Key chưa được cấu hình hoặc lỗi khởi tạo client');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    try {
        const model = genAI.getGenerativeModel({
             model: "gemini-2.5-flash-preview-09-2025", 
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
         res.end();
     });
});

app.post('/chat', async (req, res) => {
    // ... (Giữ nguyên code)
    const { history } = req.body;

    if (!history || history.length === 0) {
        return res.status(400).send('Thiếu history');
    }
    if (!API_KEY) return res.status(500).send('API Key chưa được cấu hình trên server');

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

    const payload = {
        contents: history,
        systemInstruction: {
            parts: [{ text: "Bạn là Tèo một trợ lý AI hữu ích, thân thiện và rất lém lĩnh. Hãy trả lời các câu hỏi của người dùng bằng tiếng Việt một cách rõ ràng và chi tiết. Luôn xưng là Tèo gọi người dùng là Đại ca. trong câu trả lời của bạn đừng có sử dụng nhiều dấu * quá, đại ca rất ghét điều đó. nếu thông tin nhiều đoạn thì hãy bắt đầu bằng dấu gạch đầu dòng.Hãy chủ động sử dụng công cụ tìm kiếm để trả lời các câu hỏi về thông tin mới. Luôn giả định rằng người dùng đang ở Hà Nội (múi giờ GMT+7) khi trả lời các câu hỏi liên quan đến thời gian.người dùng có địa chỉ mặc định tại Bình Sơn, Quảng Ngãi" }]
        },
        tools: [
            { "google_search": {} }
        ]
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


// ----- ENDPOINT CỦA LỊCH LÀM VIỆC (Không thay đổi) -----
app.post('/api/calendar-ai-parse', async (req, res) => {
    // ... (Giữ nguyên code)
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
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json" 
            }
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


// ----- CÁC ENDPOINT CHO PUSH NOTIFICATION (Không thay đổi) -----
app.get('/vapid-public-key', (req, res) => {
    // ... (Giữ nguyên code)
    if (!VAPID_PUBLIC_KEY) {
        return res.status(500).send("VAPID Public Key chưa được cấu hình trên server.");
    }
    res.send(VAPID_PUBLIC_KEY);
});

app.post('/subscribe', async (req, res) => {
    // ... (Giữ nguyên code)
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
        console.log("Đã lưu/cập nhật subscription:", endpoint);
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi lưu subscription vào DB:", error);
        res.status(500).send("Lỗi máy chủ khi lưu subscription.");
    }
});

app.post('/unsubscribe', async (req, res) => {
    // ... (Giữ nguyên code)
    const { endpoint } = req.body;
    if (!endpoint) {
        return res.status(400).send("Thiếu thông tin endpoint.");
    }
    
    const query = "DELETE FROM subscriptions WHERE endpoint = $1";
    
    try {
        const result = await pool.query(query, [endpoint]);
        if (result.rowCount > 0) {
            console.log("Đã xóa subscription:", endpoint);
        } else {
            console.log("Không tìm thấy subscription để xóa:", endpoint);
        }
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi hủy đăng ký subscription:", error);
        res.status(500).send("Lỗi máy chủ khi hủy đăng ký.");
    }
});

app.post('/update-notes', async (req, res) => {
    // ... (Giữ nguyên code)
    const { endpoint, noteData } = req.body;
    if (!endpoint || !noteData) {
        return res.status(400).send("Thiếu endpoint hoặc noteData.");
    }

    const query = "UPDATE subscriptions SET notes = $1 WHERE endpoint = $2";

    try {
        await pool.query(query, [noteData, endpoint]);
        console.log("Đã đồng bộ ghi chú cho:", endpoint);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Lỗi khi cập nhật ghi chú:", error);
        res.status(500).send("Lỗi máy chủ khi cập nhật ghi chú.");
    }
});


// ----- CÁC ENDPOINT CHO SYNC ONLINE (Không thay đổi) -----
app.post('/api/sync/up', async (req, res) => {
    // ... (Giữ nguyên code)
    const { username, password, noteData } = req.body;
    if (!username || !password || !noteData) {
        return res.status(400).json({ error: 'Thiếu Tên, Mật khẩu, hoặc Dữ liệu Ghi chú.' });
    }

    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [username]);
        
        if (userResult.rows.length > 0) {
            // --- Người dùng tồn tại -> Cập nhật ---
            const user = userResult.rows[0];
            const isVerified = verifyPassword(password, user.password_hash, user.salt);
            
            if (!isVerified) {
                return res.status(401).json({ error: 'Mật khẩu không đúng.' });
            }

            await client.query("UPDATE user_notes SET notes = $1 WHERE username = $2", [noteData, username]);
            res.status(200).json({ success: true, message: 'Đã cập nhật dữ liệu thành công.' });

        } else {
            // --- Người dùng mới -> Tạo mới ---
            const { salt, hash } = hashPassword(password);
            await client.query(
                "INSERT INTO user_notes (username, password_hash, salt, notes) VALUES ($1, $2, $3, $4)",
                [username, hash, salt, noteData]
            );
            res.status(201).json({ success: true, message: 'Đã tạo tài khoản và lưu dữ liệu thành công.' });
        }
    } catch (error) {
        console.error("Lỗi khi /api/sync/up:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally {
        client.release();
    }
});

app.post('/api/sync/down', async (req, res) => {
    // ... (Giữ nguyên code)
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Thiếu Tên hoặc Mật khẩu.' });
    }

    const client = await pool.connect();
    try {
        const userResult = await client.query("SELECT * FROM user_notes WHERE username = $1", [username]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tên đăng nhập không tồn tại.' });
        }

        const user = userResult.rows[0];
        const isVerified = verifyPassword(password, user.password_hash, user.salt);

        if (!isVerified) {
            return res.status(401).json({ error: 'Mật khẩu không đúng.' });
        }

        res.status(200).json(user.notes || {}); // Trả về data

    } catch (error) {
        console.error("Lỗi khi /api/sync/down:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally {
        client.release();
    }
});


// ----- CÁC ENDPOINT CHO ADMIN (Không thay đổi) -----
app.post('/api/admin/get-users', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên code)
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT username, created_at, is_admin FROM user_notes WHERE username != $1 ORDER BY created_at DESC",
            [req.body.adminUser]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Lỗi khi /api/admin/get-users:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally {
        client.release();
    }
});

app.post('/api/admin/get-notes', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên code)
    const { targetUser } = req.body;
    if (!targetUser) {
        return res.status(400).json({ error: 'Thiếu targetUser.' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query("SELECT notes FROM user_notes WHERE username = $1", [targetUser]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Người dùng mục tiêu không tồn tại.' });
        }
        res.status(200).json(result.rows[0].notes || {});
    } catch (error) {
        console.error("Lỗi khi /api/admin/get-notes:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally {
        client.release();
    }
});

app.post('/api/admin/delete-user', checkAdmin, async (req, res) => {
    // ... (Giữ nguyên code)
    const { targetUser } = req.body;
    if (!targetUser) {
        return res.status(400).json({ error: 'Thiếu targetUser.' });
    }
    
    if (targetUser === req.body.adminUser) {
         return res.status(400).json({ error: 'Không thể tự xóa tài khoản Admin.' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query("DELETE FROM user_notes WHERE username = $1 AND is_admin = false", [targetUser]);
        
        if (result.rowCount > 0) {
            res.status(200).json({ success: true, message: `Đã xóa người dùng: ${targetUser}` });
        } else {
            res.status(404).json({ error: 'Người dùng không tồn tại hoặc là Admin khác.' });
        }
    } catch (error) {
        console.error("Lỗi khi /api/admin/delete-user:", error);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    } finally {
        client.release();
    }
});


// ==========================================================
// ===== (CẬP NHẬT) CÁC ENDPOINT CHO NHẮC NHỞ (REMINDERS) =====
// ==========================================================

// API 1: Thêm một nhắc nhở (Không đổi)
app.post('/api/add-reminder', async (req, res) => {
    const { endpoint, message } = req.body;

    if (!endpoint || !message) {
        return res.status(400).json({ error: 'Thiếu endpoint hoặc message.' });
    }

    try {
        const query = `
            INSERT INTO reminders (endpoint, message, remind_at, is_active)
            VALUES ($1, $2, NULL, false)
            RETURNING *
        `;
        const result = await pool.query(query, [endpoint, message]);
        
        console.log("Đã thêm nhắc nhở mới cho:", endpoint);
        res.status(201).json(result.rows[0]); // Trả về item vừa tạo

    } catch (error) {
        console.error("Lỗi khi lưu nhắc nhở:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi lưu nhắc nhở.' });
    }
});

// (CẬP NHẬT) API 2: Lấy tất cả nhắc nhở (Sửa lỗi SQL)
app.post('/api/get-reminders', async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) {
        return res.status(400).json({ error: 'Thiếu endpoint.' });
    }

    try {
        // (SỬA LỖI) Thêm 'created_at' vào SELECT
        const query = `
            SELECT id, message, remind_at, is_active, created_at
            FROM reminders 
            WHERE endpoint = $1
            ORDER BY remind_at ASC NULLS LAST, created_at ASC
        `;
        
        const result = await pool.query(query, [endpoint]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách nhắc nhở:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách.' });
    }
});

// (CẬP NHẬT) API 3: Cập nhật một nhắc nhở (bật/tắt, đổi ngày/giờ)
app.post('/api/update-reminder', async (req, res) => {
    // (SỬA) Đổi 'time' -> 'datetime'
    const { id, endpoint, datetime, isActive } = req.body;
    // (SỬA) Bỏ yêu cầu 'datetime' vì có thể chỉ Bật/Tắt
    if (!id || !endpoint || isActive === undefined) { 
        return res.status(400).json({ error: 'Thiếu thông tin (id, endpoint, isActive).' });
    }

    try {
        // (SỬA) Chuyển đổi 'datetime' (chuỗi ISO) thành TIMESTAMP
        const remindAt = (datetime && datetime !== "") ? new Date(datetime) : null;
        
        const query = `
            UPDATE reminders 
            SET remind_at = $1, is_active = $2
            WHERE id = $3 AND endpoint = $4
            RETURNING *
        `;
        const result = await pool.query(query, [remindAt, isActive, id, endpoint]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Không tìm thấy nhắc nhở hoặc không có quyền.' });
        }
        
        res.status(200).json(result.rows[0]); // Trả về item vừa cập nhật

    } catch (error) {
        console.error("Lỗi khi cập nhật nhắc nhở:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật.' });
    }
});

// API 4: Xóa một nhắc nhở (Không đổi)
app.post('/api/delete-reminder', async (req, res) => {
    const { id, endpoint } = req.body;
    if (!id || !endpoint) {
        return res.status(400).json({ error: 'Thiếu ID hoặc endpoint.' });
    }

    try {
        const query = "DELETE FROM reminders WHERE id = $1 AND endpoint = $2";
        const result = await pool.query(query, [id, endpoint]);

        if (result.rowCount > 0) {
            res.status(200).json({ success: true, message: 'Đã xóa nhắc nhở.' });
        } else {
            res.status(404).json({ error: 'Không tìm thấy nhắc nhở hoặc không có quyền xóa.' });
        }
    } catch (error) {
        console.error("Lỗi khi xóa nhắc nhở:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi xóa.' });
    }
});

// (CẬP NHẬT) API 5: Xóa nhắc nhở theo tháng (dựa trên 'remind_at')
app.post('/api/delete-reminders-by-month', async (req, res) => {
    const { endpoint, monthYear } = req.body; // "YYYY-MM" hoặc "null"
    if (!endpoint || !monthYear) {
        return res.status(400).json({ error: 'Thiếu endpoint hoặc monthYear.' });
    }
    
    try {
        let query;
        let queryParams;
        let successMessage;

        if (monthYear === "null") {
            // Xóa các mục "Chưa sắp xếp"
            query = `
                DELETE FROM reminders 
                WHERE endpoint = $1 AND remind_at IS NULL
            `;
            queryParams = [endpoint];
            successMessage = "Đã xóa các nhắc nhở 'Chưa sắp xếp'.";
        
        } else {
            // Xóa theo tháng
            const [year, month] = monthYear.split('-');
            const startDate = new Date(Date.UTC(year, parseInt(month)-1, 1)); 
            const endDate = new Date(Date.UTC(year, parseInt(month), 1)); 

            query = `
                DELETE FROM reminders 
                WHERE endpoint = $1 
                AND remind_at >= $2 
                AND remind_at < $3
            `;
            queryParams = [endpoint, startDate, endDate];
            successMessage = `Đã xóa các nhắc nhở của tháng ${monthYear}.`;
        }
        
        const result = await pool.query(query, queryParams);

        res.status(200).json({ 
            success: true, 
            message: successMessage.replace("Đã xóa", `Đã xóa ${result.rowCount}`)
        });
    } catch (error) {
        console.error("Lỗi khi xóa nhắc nhở theo tháng:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi xóa.' });
    }
});


// ==========================================================
// ===== (CẬP NHẬT) LOGIC GỬI THÔNG BÁO =====
// ==========================================================

// Logic tính ca (Không thay đổi)
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
function getHanoiTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh' };
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
    const timeStr = timeFormatter.format(now); // "HH:mm"
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateStr = dateFormatter.format(now); // "YYYY-MM-DD"
    return { timeStr, dateStr };
}
async function deleteSubscription(endpoint) {
    console.log("Đang xóa sub hết hạn:", endpoint);
    try {
        // (SỬA) Gỡ bỏ FK nên phải xóa reminders thủ công
        await pool.query("DELETE FROM reminders WHERE endpoint = $1", [endpoint]);
        await pool.query("DELETE FROM subscriptions WHERE endpoint = $1", [endpoint]);
    } catch (err) {
        console.error("Lỗi khi xóa sub hết hạn:", err);
    }
}

// (CẬP NHẬT) Hàm kiểm tra thông báo
let lastNotificationCheckTime = null;
async function checkAndSendNotifications() {
    
    // === PHẦN 1: LẤY THỜI GIAN VÀ SUBSCRIPTIONS ===
    const { timeStr, dateStr } = getHanoiTime(); // timeStr là "HH:mm" (Hà Nội)
    const hanoiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

    if (timeStr === lastNotificationCheckTime && hanoiNow.getSeconds() > 5) {
        return;
    }
    lastNotificationCheckTime = timeStr;
    
    let subscriptions;
    try {
        const result = await pool.query("SELECT endpoint, keys, settings, notes FROM subscriptions");
        subscriptions = result.rows;
    } catch (error) {
        console.error("Không thể đọc subscriptions từ DB:", error);
        return;
    }

    // === (CẬP NHẬT) PHẦN 2: KIỂM TRA NHẮC NHỞ (REMINDERS) ===
    let reminderJobs = [];
    try {
        // Làm tròn hanoiNow về 0 giây để khớp chính xác phút
        const hanoiNowRounded = new Date(hanoiNow.getFullYear(), hanoiNow.getMonth(), hanoiNow.getDate(), hanoiNow.getHours(), hanoiNow.getMinutes());
        
        const jobQuery = `
            SELECT id, endpoint, message 
            FROM reminders 
            WHERE is_active = true AND remind_at = $1
        `;
        // (SỬA) So sánh chính xác ngày/giờ/phút (đã làm tròn)
        const jobResult = await pool.query(jobQuery, [hanoiNowRounded]); 
        reminderJobs = jobResult.rows;
    } catch (err) {
        console.error("Lỗi khi truy vấn nhắc nhở:", err);
    }
    
    // Tạo Map (Không đổi)
    const subMap = new Map(subscriptions.map(sub => [sub.endpoint, sub.keys]));
    const reminderPromises = []; 

    if (reminderJobs.length > 0) {
        console.log(`[Notify Check] Phát hiện ${reminderJobs.length} nhắc nhở cần gửi (vào lúc ${timeStr}).`);
    }

    reminderJobs.forEach(job => {
        const keys = subMap.get(job.endpoint);
        if (!keys) {
            console.warn("Không tìm thấy keys cho nhắc nhở (endpoint):", job.endpoint);
            return; 
        }

        const title = "Nhắc nhở (Tèo)!";
        const body = job.message;
        
        // Logic gửi push (Không đổi)
        let notificationPayload;
        if (job.endpoint.startsWith('https://web.push.apple.com')) {
            notificationPayload = JSON.stringify({ aps: { alert: { title: title, body: body } } });
        } else {
            notificationPayload = JSON.stringify({ title: title, body: body });
        }
        
        const pushSubscription = { endpoint: job.endpoint, keys: keys };

        const sendPromise = webpush.sendNotification(pushSubscription, notificationPayload)
            .then(() => {
                // (SỬA) Gửi thành công -> XÓA LUÔN
                console.log("Đã gửi và XÓA nhắc nhở ID:", job.id);
                return pool.query("DELETE FROM reminders WHERE id = $1", [job.id]);
            })
            .catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    deleteSubscription(job.endpoint); 
                } else {
                    console.error("Lỗi khi gửi push (nhắc nhở):", err);
                }
            });
        
        reminderPromises.push(sendPromise);
    });
    

    // === PHẦN 3: KIỂM TRA LỊCH CA (LOGIC CŨ, KHÔNG THAY ĐỔI) ===
    
    const todayShift = getShiftForDate(dateStr);
    console.log(`[Notify Check] ${timeStr} | Ca hôm nay: ${todayShift} | Subs: ${subscriptions.length}`);

    const sendPromises = subscriptions.map(sub => {
        const { endpoint, keys, settings, notes } = sub;
        
        let timeToAlert = null;
        if (todayShift === 'ngày') timeToAlert = settings.notifyTimeNgay;
        else if (todayShift === 'đêm') timeToAlert = settings.notifyTimeDem;
        else if (todayShift === 'giãn ca') timeToAlert = settings.notifyTimeOff;

        if (timeToAlert && timeStr === timeToAlert) {
            console.log(`Đang gửi thông báo ${todayShift} đến:`, endpoint);
            
            // ... (toàn bộ logic tạo title, body, payload, gửi... giữ nguyên) ...
            const notesForToday = (notes && notes[dateStr]) ? notes[dateStr] : [];
            let bodyContent = ""; 
            if (notesForToday.length > 0) {
                bodyContent = "Ghi chú:\n" + notesForToday.join('\n');
            } else {
                bodyContent = `Không có ghi chú cho hôm nay (${dateStr}).`;
            }
            if (bodyContent.length > 150) {
                bodyContent = bodyContent.substring(0, 150) + "...";
            }
            const title = `Lịch Luân Phiên - Ca ${todayShift.toUpperCase()}`;
            const body = bodyContent; 
            
            let notificationPayload;
            if (endpoint.startsWith('https://web.push.apple.com')) {
                notificationPayload = JSON.stringify({
                    aps: { alert: { title: title, body: body } }
                });
            } else {
                notificationPayload = JSON.stringify({
                    title: title,
                    body: body
                });
            }

            const pushSubscription = {
                endpoint: endpoint,
                keys: keys
            };
            
            return webpush.sendNotification(pushSubscription, notificationPayload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        deleteSubscription(endpoint);
                    } else {
                        console.error("Lỗi khi gửi push (ca):", err);
                    }
                });
        }
        return Promise.resolve();
    });
    
    // (SỬA) Chạy cả hai hàng đợi (lịch ca và lịch hẹn)
    await Promise.all([...sendPromises, ...reminderPromises]);
}

// Endpoint của Cron Job (Giữ lại để test, nhưng không dùng chính)
app.get('/trigger-notifications', async (req, res) => {
    // ... (Giữ nguyên code)
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.VAPID_PRIVATE_KEY) { 
        console.warn("Cron trigger không hợp lệ (sai secret)");
        return res.status(401).send("Unauthorized");
    }

    try {
        console.log("Cron Job triggered MANUALLY: Đang chạy kiểm tra thông báo...");
        await checkAndSendNotifications();
        res.status(200).send('Notification check OK.');
    } catch (err) {
        console.error("Lỗi khi chạy Cron Job:", err);
        res.status(500).send('Cron Job Error.');
    }
});


// ----- CÁC ROUTE TRANG -----
app.get('*', (req, res) => {
    // (SỬA LỖI DEPLOY) Đảm bảo đường dẫn này đúng (server.js và public/ ngang hàng)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ==========================================================
// ===== (CẬP NHẬT) KHỞI ĐỘNG SERVER =====
// ==========================================================
app.listen(PORT, async () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    
    // (MỚI) Khởi động server NGAY LẬP TỨC
    // Sau đó mới chạy khởi tạo DB
    try {
        await initializeDatabase();
        console.log("Khởi tạo Database thành công.");
    } catch (err) {
        console.error("Lỗi nghiêm trọng khi khởi tạo Database, server có thể không ổn định.", err);
    }

    // (Giữ nguyên) Tự động kiểm tra thông báo
    console.log("Khởi động bộ đếm thời gian thông báo (kiểm tra mỗi 60 giây)...");
    (async () => {
        console.log("Khởi động: Chạy kiểm tra thông báo lần đầu...");
        try {
            await checkAndSendNotifications();
        } catch (err) {
            console.error("Lỗi khi chạy kiểm tra thông báo lần đầu:", err);
        }
    })();

    setInterval(async () => {
        try {
            // Hàm này đã có log riêng ("Notify Check...") nên không cần log thêm
            await checkAndSendNotifications();
        } catch (err) {
            console.error("Lỗi trong quá trình kiểm tra thông báo tự động:", err);
        }
    }, 60 * 1000); // 60 giây
});