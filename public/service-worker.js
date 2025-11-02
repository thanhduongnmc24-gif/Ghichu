// === PHẦN 1: LOGIC CACHE (Giữ nguyên của bạn) ===

const CACHE_NAME = 'ghichu-app-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png' // Thêm icon 512 cho chắc chắn
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened main cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});


// ==========================================================
// === PHẦN 2: LOGIC PUSH NOTIFICATION (Mới) ===
// ==========================================================

// --- Trình trợ giúp IndexedDB (Copy từ index.html) ---
// Service Worker không thể truy cập localStorage,
// nên chúng ta phải dùng IndexedDB để đọc cài đặt
const dbName = 'GhichuAppDB';
const storeName = 'keyval';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- Trình trợ giúp Lịch (Copy từ index.html) ---

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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


// --- TRÌNH XỬ LÝ SỰ KIỆN PUSH (Quan trọng nhất) ---

self.addEventListener('push', event => {
    console.log('[Service Worker] Đã nhận được Push.');

    // Chúng ta cần một hàm async để dùng 'await'
    const handlePush = async (event) => {
        let payload;
        try {
            // Lấy payload (dữ liệu) mà server gửi (VD: {"check":"ngay"})
            payload = event.data ? event.data.json() : null;
        } catch (e) {
            console.error('Không thể đọc payload:', e);
            payload = null;
        }

        // Nếu server không gửi tín hiệu 'check', chúng ta không làm gì cả
        if (!payload || !payload.check) {
            console.log('Push nhận được không có payload check.');
            return;
        }

        try {
            // 1. Mở IndexedDB
            const db = await openDB();
            
            // 2. Đọc Cài đặt và Ghi chú (thay vì localStorage)
            const settings = await dbGet('myScheduleSettings');
            const notes = await dbGet('myScheduleNotes');

            // Nếu người dùng chưa bao giờ lưu cài đặt, thoát
            if (!settings) {
                console.log('Không tìm thấy cài đặt trong DB. Bỏ qua thông báo.');
                return;
            }
            
            // 3. Tái tạo logic kiểm tra
            const todayStr = getLocalDateString(new Date());
            const todayShift = getShiftForDate(todayStr);

            let shiftDisplayName = "";
            let timeToAlert = "";

            if (todayShift === 'ngày') {
                shiftDisplayName = "Ca Ngày";
                timeToAlert = settings.notifyTimeNgay || "06:00";
            } else if (todayShift === 'đêm') {
                shiftDisplayName = "Ca Đêm";
                timeToAlert = settings.notifyTimeDem || "20:00";
            } else if (todayShift === 'giãn ca') {
                shiftDisplayName = "Giãn Ca";
                timeToAlert = settings.notifyTimeOff || "08:00";
            } else { // 'off'
                shiftDisplayName = "Ngày Nghỉ";
                timeToAlert = settings.notifyTimeOff || "08:00";
            }
            
            // 4. KIỂM TRA: Tín hiệu server gửi có khớp với ca hôm nay không?
            // Ví dụ: Server gửi "check: ngay", nhưng hôm nay là "ca đêm" -> Bỏ qua
            if (payload.check === 'ngay' && todayShift !== 'ngày') {
                console.log('Server ping ca Ngày, nhưng hôm nay là', todayShift, '-> Bỏ qua.');
                return;
            }
            if (payload.check === 'dem' && todayShift !== 'đêm') {
                console.log('Server ping ca Đêm, nhưng hôm nay là', todayShift, '-> Bỏ qua.');
                return;
            }
            if (payload.check === 'off' && (todayShift !== 'giãn ca' && todayShift !== 'off')) {
                console.log('Server ping ca Off, nhưng hôm nay là', todayShift, '-> Bỏ qua.');
                return;
            }
            
            // 5. Nếu khớp, tạo nội dung thông báo
            let notesString = "";
            if (notes && notes[todayStr] && notes[todayStr].length > 0) {
                notesString = " - Ghi chú: " + notes[todayStr].join(', ');
            }
            
            const title = "Lịch Luân Phiên";
            const body = `${shiftDisplayName}${notesString}`;

            // 6. Hiển thị thông báo
            // Đây là hàm thực sự hiện thông báo lên màn hình
            return self.registration.showNotification(title, {
                body: body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png' // Icon nhỏ trên thanh trạng thái
            });

        } catch (err) {
            console.error('Lỗi khi xử lý Push:', err);
            // Hiển thị thông báo lỗi chung nếu có sự cố
            return self.registration.showNotification('Lịch Luân Phiên', {
                body: 'Có lỗi khi đồng bộ lịch của bạn.'
            });
        }
    };

    // Yêu cầu trình duyệt giữ Service Worker chạy cho đến khi
    // hàm handlePush() hoàn thành
    event.waitUntil(handlePush(event));
});
