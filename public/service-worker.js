/* =================================================================== */
/* FILE: public/service-worker.js (ĐÃ SỬA LỖI CACHING)                 */
/* =================================================================== */

// THAY ĐỔI 1: Tăng phiên bản CACHE_NAME để buộc cập nhật
const CACHE_NAME = 'ghichu-app-cache-v2';

// THAY ĐỔI 2: Cập nhật danh sách file cần cache cho chính xác
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',          // Thêm file JS chính
    '/style.css',      // Thêm file CSS chính
    '/utils.js',       // Thêm file utils
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png' // Thêm icon 512
    // Xóa các đường dẫn '/calendar/' cũ không còn dùng
];

// 1. Cài đặt Service Worker: Mở cache và lưu các tệp
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened main cache v2'); // Cập nhật log
                // Bỏ qua lỗi nếu 1 file không cache được (ví dụ: /)
                return cache.addAll(urlsToCache).catch(err => {
                    console.warn("Một số file không cache được khi cài đặt:", err);
                });
            })
    );
});

// 2. Fetch: (THAY ĐỔI 3: Cập nhật logic fetch)
// Phản hồi từ Cache trước, nếu không có mới lấy từ Mạng (VÀ LƯU VÀO CACHE)
self.addEventListener('fetch', event => {
    // Bỏ qua các request không phải GET (ví dụ: POST, PUT)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 1. Có trong cache -> Trả về
                if (cachedResponse) {
                    return cachedResponse;
                }

                // 2. Không có trong cache -> Lấy từ mạng
                return fetch(event.request).then(
                    networkResponse => {
                        // 3. Lấy thành công -> Lưu vào cache và trả về
                        // Chỉ cache các request 'basic' (cùng nguồn)
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Sao chép response vì nó chỉ được dùng 1 lần
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                ).catch(error => {
                    // 4. Lỗi mạng (offline)
                    console.log('Fetch thất bại; không có trong cache:', error);
                    // (Đại ca có thể trả về một trang offline dự phòng ở đây nếu muốn)
                });
            })
    );
});


// 3. Kích hoạt: Xóa các cache cũ nếu có (Rất quan trọng)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME]; // Bây giờ là 'v2'
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        // Sẽ xóa 'ghichu-app-cache-v1'
                        console.log('Xóa cache cũ:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 4. (CẬP NHẬT CHO IOS) Lắng nghe Push Notification từ Server (Giữ nguyên)
self.addEventListener('push', event => {
    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'Thông báo', body: event.data.text() };
    }

    // (MỚI) Biến logic để lưu tiêu đề và nội dung
    let title;
    let body;

    // Kiểm tra xem đây là payload APNs (Apple) hay VAPID (Chuẩn)
    if (data.aps && data.aps.alert) {
        // Đây là định dạng của Apple: { "aps": { "alert": { "title": "...", "body": "..." } } }
        title = data.aps.alert.title;
        body = data.aps.alert.body;
    } else {
        // Đây là định dạng chuẩn: { "title": "...", "body": "..." }
        title = data.title;
        body = data.body;
    }

    // (CẬP NHẬT) Dùng các biến mới, với dự phòng
    const finalTitle = title || 'Ghichu App';
    const options = {
        body: body || 'Bạn có thông báo mới.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png', // Dành cho Android
        vibrate: [100, 50, 100],
        data: {
            url: self.registration.scope // URL để mở khi nhấn vào
        }
    };

    event.waitUntil(
        self.registration.showNotification(finalTitle, options)
    );
});

// 5. (MỚI) Xử lý khi người dùng nhấn vào thông báo (Giữ nguyên)
self.addEventListener('notificationclick', event => {
    event.notification.close(); // Đóng thông báo
    
    // Mở trang Lịch (hoặc trang chủ)
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Kiểm tra xem có tab nào đang mở không
                const focusedClient = windowClients.find(client => client.focused);
                if (focusedClient) {
                    return focusedClient.navigate('/#calendar').then(client => client.focus());
                }
                if (windowClients.length > 0) {
                    return windowClients[0].navigate('/#calendar').then(client => client.focus());
                }
                // Nếu không có tab nào mở, mở tab mới
                return clients.openWindow('/#calendar');
            })
    );
});