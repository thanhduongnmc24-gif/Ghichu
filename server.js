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
app.use(express.static(path.join(__dirname, 'public')));

// --- CÀI ĐẶT GOOGLE AI ---
const API_KEY = process.env.GEMINI_API_KEY;
let genAI;
// (CẬP NHẬT) Lấy URL API ra biến toàn cục để tái sử dụng
let GEMINI_API_URL; 
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    // (MỚI) Định nghĩa URL API ở đây
    GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
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


// (CẬP NHẬT) Hàm tự động tạo/cập nhật bảng
(async () => {
    const client = await pool.connect();
    try {
        // 1. Bảng Subscriptions (Không đổi)
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

        // 2. Bảng User Notes (Không đổi)
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

        // 3. (MỚI - ADMIN) Cập nhật bảng user_notes để thêm cột 'is_admin'
        try {
            await client.query(`
                ALTER TABLE user_notes
                ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
            `);
            console.log("Bảng 'user_notes' đã được cập nhật với cột 'is_admin'.");
        } catch (alterErr) {
            // Lỗi này có thể xảy ra nếu cột đã tồn tại (race condition), bỏ qua
        }

        // 4. (MỚI - Trợ lý Hẹn giờ) Bảng scheduled_tasks
        // Bảng này sẽ lưu các nhiệm vụ mà Tèo cần làm
        await client.query(`
            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id SERIAL PRIMARY KEY,
                endpoint TEXT NOT NULL,
                task_time TIMESTAMP WITH TIME ZONE NOT NULL,
                task_prompt TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Bảng 'scheduled_tasks' đã sẵn sàng trên Supabase.");


    } catch (err) {
        console.error("Lỗi khi tạo/cập nhật bảng:", err);
    } finally {
        client.release();
    }
})();


// ----- (MỚI - ADMIN) HÀM MIDDLEWARE KIỂM TRA ADMIN -----
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
    // (CẬP NHẬT) Lấy thêm `endpoint` từ GĐ 2
    const { history, endpoint } = req.body; 

    if (!history || history.length === 0) {
        return res.status(400).send('Thiếu history');
    }
    if (!API_KEY || !GEMINI_API_URL) return res.status(500).send('API Key chưa được cấu hình trên server');

    // (CẬP NHẬT) Dùng biến toàn cục GEMINI_API_URL
    // const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

    // (MỚI) Định nghĩa các hàm (tools) mà AI có thể gọi
    const tools = [
        { "google_search": {} }, // Tool tìm kiếm (đã có)
        {
            // (MỚI) Tool hẹn giờ
            "functionDeclarations": [
                {
                    "name": "schedule_task",
                    "description": "Hẹn giờ một nhiệm vụ cho người dùng. Chỉ sử dụng khi người dùng yêu cầu rõ ràng về MỘT THỜI ĐIỂM CỤ THỂ TRONG TƯƠNG LAI (ví dụ: 5 giờ sáng, 7 giờ tối mai, 10:00 15/11) và MỘT NỘI DUNG NHIỆM VỤ (ví dụ: tìm tin tức, báo thức).",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "task_time_iso": {
                                "type": "STRING",
                                "description": "Thời gian thực hiện nhiệm vụ, định dạng chuẩn ISO 8601 (YYYY-MM-DDTHH:MM:SS+07:00). Luôn dùng múi giờ +07:00."
                            },
                            "task_prompt": {
                                "type": "STRING",
                                "description": "Nội dung nhiệm vụ người dùng yêu cầu, ví dụ: 'tìm tin tức về iphone 17', 'báo thức đi làm'."
                            }
                        },
                        "required": ["task_time_iso", "task_prompt"]
                    }
                }
            ]
        }
    ];

    const payload = {
        contents: history,
        systemInstruction: {
            parts: [{ text: "Bạn là Tèo một trợ lý AI hữu ích, thân thiện và rất lém lỉnh. Hãy trả lời các câu hỏi của người dùng bằng tiếng Việt một cách rõ ràng và chi tiết. Luôn xưng là Tèo gọi người dùng là Đại ca. trong câu trả lời của bạn đừng có sử dụng nhiều dấu * quá, đại ca rất ghét điều đó. nếu thông tin nhiều đoạn thì hãy bắt đầu bằng dấu gạch đầu dòng.Hãy chủ động sử dụng công cụ tìm kiếm để trả lời các câu hỏi về thông tin mới. Luôn giả định rằng người dùng đang ở Hà Nội (múi giờ GMT+7) khi trả lời các câu hỏi liên quan đến thời gian.người dùng có địa chỉ mặc định tại Bình Sơn, Quảng Ngãi" }]
        },
        tools: tools // (CẬP NHẬT) Sử dụng tools mới
    };

    try {
        const geminiResponse = await fetch(GEMINI_API_URL, { // (CẬP NHẬT)
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            throw new Error(`Lỗi từ Gemini: ${geminiResponse.status}`);
        }

        const result = await geminiResponse.json();
        
        // (MỚI) Kiểm tra xem AI có muốn gọi hàm không
        const functionCall = result.candidates?.[0]?.content?.parts?.find(part => part.functionCall);

        if (functionCall && functionCall.functionCall.name === 'schedule_task') {
            // ===== AI MUỐN HẸN GIỜ =====
            const args = functionCall.functionCall.args;
            const { task_time_iso, task_prompt } = args;

            if (!endpoint) {
                // Nếu không có endpoint (danh tính), không thể hẹn giờ
                res.json({ answer: `Tèo đã hiểu ý đại ca muốn hẹn giờ. Nhưng đại ca cần bật "Thông Báo Push" trong tab Cài Đặt để Tèo biết gửi thông báo cho ai nhé!` });
                return;
            }

            // Gọi API nội bộ để lưu nhiệm vụ
            // (Dùng fetch localhost, hoặc gọi hàm trực tiếp)
            try {
                const client = await pool.connect();
                try {
                    // Kiểm tra sub tồn tại
                    const subResult = await client.query("SELECT 1 FROM subscriptions WHERE endpoint = $1", [endpoint]);
                    if (subResult.rowCount === 0) {
                        throw new Error('Endpoint này chưa đăng ký nhận thông báo.');
                    }
                    // Lưu nhiệm vụ
                    await client.query(
                        "INSERT INTO scheduled_tasks (endpoint, task_time, task_prompt, status) VALUES ($1, $2, $3, 'pending')",
                        [endpoint, task_time_iso, task_prompt]
                    );
                    console.log(`[Task Scheduled via Chat] Nhiệm vụ mới cho ${endpoint} lúc ${task_time_iso}`);
                    
                    // Trả lời Tèo
                    res.json({ answer: `Dạ rõ thưa đại ca! Tèo đã hẹn giờ lúc ${new Date(task_time_iso).toLocaleString('vi-VN')} sẽ tìm "${task_prompt}" và báo cho đại ca.` });

                } finally {
                    client.release();
                }
            } catch (scheduleError) {
                console.error("Lỗi khi /chat cố gắng hẹn giờ:", scheduleError);
                res.json({ answer: `Tèo hiểu ý đại ca, nhưng Tèo đang bị lỗi hệ thống hẹn giờ: ${scheduleError.message}` });
            }
            return; // Kết thúc sớm
        }

        // ===== KHÔNG HẸN GIỜ (Chat/Search bình thường) =====
        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            const answerText = result.candidates[0].content.parts[0].text;
            res.json({ answer: answerText });
        } else {
            // (Cập nhật) Xử lý trường hợp AI gọi Google Search nhưng không nói gì
             const searchCall = result.candidates?.[0]?.content?.parts?.find(part => part.functionCall && part.functionCall.name === 'google_search');
             if(searchCall) {
                res.json({ answer: "Tèo đang tìm kiếm trên Google... nhưng có vẻ Tèo quên mất cách trả lời rồi. Đại ca hỏi lại câu khác xem." });
             } else {
                throw new Error("Không nhận được nội dung hợp lệ từ API Gemini.");
             }
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


// ----- (MỚI - Trợ lý Hẹn giờ) API (Đã được tích hợp vào /chat) -----
// Chúng ta không cần API /api/schedule-task riêng nữa
// vì logic đã được đưa vào /chat.


// ----- CÁC ENDPOINT CHO SYNC ONLINE (Không thay đổi) -----
app.post('/api/sync/up', async (req, res) => {
    // ... (Gi muutuyên code)
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


// ----- (MỚI - ADMIN) CÁC ENDPOINT CHO ADMIN -----
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


// ----- (MỚI) LOGIC TRỢ LÝ HẸN GIỜ (XỬ LÝ TASK) -----

/**
 * (MỚI) Hàm này gọi Google Search (thông qua Gemini) để tìm tin tức.
 * Nó sử dụng logic tương tự như endpoint /chat, nhưng được tối ưu cho việc tìm kiếm.
 */
async function findNewsWithGoogleSearch(prompt) {
    if (!API_KEY || !GEMINI_API_URL) {
        console.error("[Task Search] Thiếu API Key hoặc URL.");
        return null;
    }

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: `Hãy tìm thông tin mới nhất về: "${prompt}". Trả lời bằng cách tóm tắt kết quả tìm kiếm. Nếu có thể, hãy cung cấp link (URL) của bài báo liên quan nhất ở dòng cuối cùng.` }]
        }],
        tools: [ { "google_search": {} } ],
        systemInstruction: {
            parts: [{ text: "Bạn là một trợ lý tìm kiếm, chỉ tóm tắt kết quả tìm được. Luôn giả định người dùng ở GMT+7. Nếu tìm thấy một link (URL) bài báo, hãy trả nó về ở dòng CUỐI CÙNG và CHỈ MỘT link." }]
        }
    };

    try {
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            throw new Error(`Lỗi từ Gemini: ${geminiResponse.status}`);
        }

        const result = await geminiResponse.json();

        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            const answerText = result.candidates[0].content.parts[0].text;
            
            // Tách URL (nếu có) ở dòng cuối cùng
            const lines = answerText.trim().split('\n');
            let url = `https://www.google.com/search?q=${encodeURIComponent(prompt)}`; // URL dự phòng
            let body = answerText;
            
            const lastLine = lines[lines.length - 1];
            // Kiểm tra kỹ hơn xem có phải URL không
            if (lastLine.startsWith('http://') || lastLine.startsWith('https://')) {
                try {
                    new URL(lastLine); // Thử parse URL
                    url = lastLine;
                    body = lines.slice(0, lines.length - 1).join('\n'); // Phần còn lại là body
                } catch (e) {
                    // Không phải URL hợp lệ, giữ nguyên body
                }
            }

            if (!body.trim()) { // Nếu body rỗng (ví dụ AI chỉ trả về link)
                body = "Tèo tìm thấy nội dung, nhấn để xem nhé.";
            }

            const title = `Tèo tìm thấy: ${prompt.substring(0, 20)}...`;
            
            return { title, body, url };

        } else {
            throw new Error("Không nhận được nội dung hợp lệ từ API Gemini.");
        }
    } catch (error) {
        console.error("[Task Search] Lỗi khi tìm kiếm:", error);
        // Fallback nếu có lỗi
        return {
            title: `Kết quả cho: ${prompt}`,
            body: "Tèo đã tìm kiếm, nhưng không lấy được tóm tắt. Đại ca nhấn để xem trên Google nhé.",
            url: `https://www.google.com/search?q=${encodeURIComponent(prompt)}`
        };
    }
}

/**
 * (MỚI) Hàm kiểm tra và gửi các nhiệm vụ đã hẹn giờ.
 */
async function checkAndSendScheduledTasks() {
    const now = new Date(); // Giờ server (có thể là UTC)
    
    // Lấy tất cả task 'pending' đã đến giờ
    const query = `
        SELECT id, endpoint, task_prompt 
        FROM scheduled_tasks 
        WHERE status = 'pending' AND task_time <= $1;
    `;
    
    let tasks;
    const client = await pool.connect();
    try {
        // $1 là `now`, DB sẽ so sánh (task_time <= now)
        const result = await client.query(query, [now]);
        tasks = result.rows;

        if (tasks.length > 0) {
            console.log(`[Task Runner] Tìm thấy ${tasks.length} nhiệm vụ cần xử lý.`);
        }

        for (const task of tasks) {
            // 1. Lấy thông tin subscription (keys) để gửi
            const subResult = await client.query("SELECT keys FROM subscriptions WHERE endpoint = $1", [task.endpoint]);
            if (subResult.rowCount === 0) {
                console.warn(`[Task Runner] Không tìm thấy subscription cho task ${task.id}, đang xóa task.`);
                await client.query("DELETE FROM scheduled_tasks WHERE id = $1", [task.id]);
                continue;
            }
            const keys = subResult.rows[0].keys;

            // 2. Thực thi nhiệm vụ: Tìm kiếm tin tức
            console.log(`[Task Runner] Đang thực thi task ${task.id}: ${task.task_prompt}`);
            
            // (Cập nhật) Xử lý 2 loại task: báo thức và tìm kiếm
            let searchResult;
            if (task.task_prompt.toLowerCase().includes('báo thức')) {
                searchResult = {
                    title: "Báo thức!",
                    body: task.task_prompt,
                    url: "/" // Mở trang chủ
                };
            } else {
                searchResult = await findNewsWithGoogleSearch(task.task_prompt);
            }
            
            if (!searchResult) {
                console.error(`[Task Runner] Tìm kiếm cho task ${task.id} thất bại. Sẽ thử lại sau.`);
                // Không cập nhật status, để lần sau chạy lại
                continue;
            }

            // 3. Chuẩn bị payload thông báo
            const { title, body, url } = searchResult;

            // (Quan trọng) Thêm `url` vào data để service-worker biết mở
            const payloadData = {
                title: title,
                body: body.substring(0, 150) + (body.length > 150 ? "..." : ""),
                data: {
                    url: url // URL để mở khi nhấn vào
                }
            };
            
            // Logic kiểm tra iOS (giống hệt thông báo ca kíp)
            let notificationPayload;
            if (task.endpoint.startsWith('https://web.push.apple.com')) {
                // Định dạng APNs (Apple)
                notificationPayload = JSON.stringify({
                    aps: {
                        alert: {
                            title: payloadData.title,
                            body: payloadData.body
                        }
                    },
                    // (MỚI) Thêm data cho iOS, hy vọng service-worker đọc được
                    data: payloadData.data 
                });
            } else {
                // Định dạng VAPID chuẩn
                notificationPayload = JSON.stringify(payloadData);
            }

            // 4. Gửi thông báo
            const pushSubscription = { endpoint: task.endpoint, keys: keys };
            
            try {
                await webpush.sendNotification(pushSubscription, notificationPayload);
                console.log(`[Task Runner] Đã gửi thông báo cho task ${task.id}.`);
                
                // 5. Cập nhật status
                await client.query("UPDATE scheduled_tasks SET status = 'completed' WHERE id = $1", [task.id]);
                
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription hết hạn
                    console.warn(`[Task Runner] Subscription cho task ${task.id} đã hết hạn. Đang xóa sub và task.`);
                    await deleteSubscription(task.endpoint); // (Hàm này đã có)
                    // (CẬP NHẬT) Xóa tất cả task của endpoint này
                    await client.query("DELETE FROM scheduled_tasks WHERE endpoint = $1", [task.endpoint]);
                } else {
                    console.error(`[Task Runner] Lỗi khi gửi push cho task ${task.id}:`, err);
                    // Không cập nhật status, để thử lại lần sau
                }
            }
        } // end for loop

    } catch (error) {
        console.error("[Task Runner] Lỗi nghiêm trọng khi xử lý tasks:", error);
    } finally {
        client.release();
    }
}


// ----- LOGIC GỬI THÔNG BÁO (CA KÍP) -----

// Logic tính ca (Giữ nguyên)
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
    const timeStr = timeFormatter.format(now);
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateStr = dateFormatter.format(now);
    return { timeStr, dateStr };
}
async function deleteSubscription(endpoint) {
    console.log("Đang xóa sub hết hạn:", endpoint);
    try {
        await pool.query("DELETE FROM subscriptions WHERE endpoint = $1", [endpoint]);
    } catch (err) {
        console.error("Lỗi khi xóa sub hết hạn:", err);
    }
}

// (Giữ nguyên)
let lastNotificationCheckTime = null;
async function checkAndSendNotifications() {
    // ... (Giữ nguyên logic kiểm tra ca kíp)
    const { timeStr, dateStr } = getHanoiTime();

    if (timeStr === lastNotificationCheckTime) {
        // console.log("Đã kiểm tra trong phút này, bỏ qua.");
        return;
    }
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

    if (subscriptions.length === 0) {
         // console.log("Không có ai đăng ký thông báo.");
        return;
    }
    
    // Chỉ log nếu có người đăng ký
    // console.log(`[Notify Check] ${timeStr} | Ca hôm nay: ${todayShift} | Subs: ${subscriptions.length}`);

    const sendPromises = subscriptions.map(sub => {
        const { endpoint, keys, settings, notes } = sub;
        
        let timeToAlert = null;
        if (todayShift === 'ngày') timeToAlert = settings.notifyTimeNgay;
        else if (todayShift === 'đêm') timeToAlert = settings.notifyTimeDem;
        else if (todayShift === 'giãn ca') timeToAlert = settings.notifyTimeOff;

        if (timeToAlert && timeStr === timeToAlert) {
            console.log(`Đang gửi thông báo ${todayShift} đến:`, endpoint.substring(0, 50) + "...");
            
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
            
            // (CẬP NHẬT) Thêm data cho thông báo ca kíp
            const payloadData = {
                title: title,
                body: body,
                data: {
                    url: "/#calendar" // (MỚI) Dữ liệu để mở tab Lịch
                }
            };
            

            let notificationPayload;
            if (endpoint.startsWith('https://web.push.apple.com')) {
                // Định dạng APNs (Apple)
                notificationPayload = JSON.stringify({
                    aps: {
                        alert: {
                            title: payloadData.title,
                            body: payloadData.body
                        }
                    },
                    data: payloadData.data // (MỚI) Thêm data cho iOS
                });
            } else {
                // Định dạng VAPID chuẩn (Android, Desktop)
                notificationPayload = JSON.stringify(payloadData);
            }

            const pushSubscription = {
                endpoint: endpoint,
                keys: keys
            };
            
            return webpush.sendNotification(pushSubscription, notificationPayload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        deleteSubscription(endpoint);
                        // (MỚI) Cũng xóa các task đã hẹn
                        pool.query("DELETE FROM scheduled_tasks WHERE endpoint = $1", [endpoint])
                            .catch(err => console.error("Lỗi xóa task cho sub hết hạn:", err));
                    } else {
                        console.error("Lỗi khi gửi push:", err);
                    }
                });
        }
        return Promise.resolve();
    });
    
    await Promise.all(sendPromises);
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
        console.log("Cron Job triggered MANUALLY: Đang chạy kiểm tra...");
        await checkAndSendNotifications();
        await checkAndSendScheduledTasks(); // (MỚI) Chạy cả task
        res.status(200).send('Notification check OK.');
    } catch (err) {
        console.error("Lỗi khi chạy Cron Job:", err);
        res.status(500).send('Cron Job Error.');
    }
});


// ----- CÁC ROUTE TRANG -----
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ==========================================================
// ===== (CẬP NHẬT) KHỞI ĐỘNG SERVER =====
// ==========================================================
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    
    console.log("Khởi động bộ đếm thời gian (kiểm tra mỗi 60 giây)...");
    
    // Chạy ngay lần đầu tiên khi khởi động để kiểm tra
    (async () => {
        console.log("Khởi động: Chạy kiểm tra lần đầu...");
        try {
            // (MỚI) Tách ra để chạy song song
            const shiftPromise = checkAndSendNotifications();
            const taskPromise = checkAndSendScheduledTasks();
            await Promise.all([shiftPromise, taskPromise]);
        } catch (err) {
            console.error("Lỗi khi chạy kiểm tra lần đầu:", err);
        }
    })();

    // Sau đó chạy định kỳ mỗi phút
    setInterval(async () => {
        try {
            // Chạy kiểm tra ca kíp
            await checkAndSendNotifications();
            
            // (MỚI) Chạy kiểm tra nhiệm vụ hẹn giờ
            await checkAndSendScheduledTasks();

        } catch (err) {
            console.error("Lỗi trong quá trình kiểm tra định kỳ:", err);
        }
    }, 60 * 1000); // 60 giây
});

