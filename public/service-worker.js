const CACHE_NAME = 'ghichu-app-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/calendar/',
    '/calendar/index.html',
    '/calendar/app.js',
    '/icons/icon-192x192.png'
];

// 1. Cài đặt Service Worker: Mở cache và lưu các tệp
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened main cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. Fetch: Phản hồi từ Cache trước, nếu không có mới lấy từ Mạng
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

// 3. Kích hoạt: Xóa các cache cũ nếu có
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

// 4. (CẬP NHẬT) Lắng nghe Push Notification từ Server
self.addEventListener('push', event => {
    let data;
    let urlToOpen = '/'; // (MỚI) URL mặc định khi nhấn vào
    let title = 'Ghichu App';
    let body = 'Bạn có thông báo mới.';
    
    try {
        // Thử phân tích JSON (VAPID chuẩn)
        data = event.data.json();
        
        // Kiểm tra xem đây là payload APNs (Apple) hay VAPID (Chuẩn)
        if (data.aps && data.aps.alert) {
            // --- Định dạng của Apple ---
            // { "aps": { "alert": { "title": "...", "body": "..." } }, "data": { "url": "..." } }
            title = data.aps.alert.title || title;
            body = data.aps.alert.body || body;
            // (MỚI) Lấy URL từ data (nếu Apple hỗ trợ)
            if (data.data && data.data.url) {
                urlToOpen = data.data.url;
            }

        } else {
            // --- Định dạng chuẩn VAPID (Android, Desktop) ---
            // { "title": "...", "body": "...", "data": { "url": "..." } }
            title = data.title || title;
            body = data.body || body;
            // (MỚI) Lấy URL từ data
            if (data.data && data.data.url) {
                urlToOpen = data.data.url;
            }
        }

    } catch (e) {
        // Nếu không phải JSON (có thể là tin nhắn văn bản đơn giản hoặc APNs cũ)
        body = event.data.text();
        title = 'Thông báo'; // Tiêu đề mặc định nếu là text
    }

    const options = {
        body: body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        // (MỚI) Lưu URL vào data của thông báo
        data: {
            url: urlToOpen 
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// 5. (CẬP NHẬT) Xử lý khi người dùng nhấn vào thông báo
self.addEventListener('notificationclick', event => {
    event.notification.close(); // Đóng thông báo
    
    // (MỚI) Lấy URL từ data của thông báo
    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                
                // (MỚI) Kiểm tra xem URL là link bên ngoài hay link của ứng dụng
                if (urlToOpen.startsWith('http://') || urlToOpen.startsWith('https://')) {
                    // Nếu là link ngoài (ví dụ: Google, VnExpress), mở tab mới
                    return clients.openWindow(urlToOpen);
                }

                // Nếu là link nội bộ (ví dụ: '/#calendar' hoặc '/')
                const targetUrl = new URL(urlToOpen, self.location.origin).href;

                // Tìm tab đang mở ứng dụng
                const focusedClient = windowClients.find(client => client.focused);
                if (focusedClient) {
                    // Nếu có tab đang focus, điều hướng tab đó và focus
                    return focusedClient.navigate(targetUrl).then(client => client.focus());
                }
                if (windowClients.length > 0) {
                    // Nếu có tab (nhưng không focus), điều hướng tab đầu tiên và focus
                    return windowClients[0].navigate(targetUrl).then(client => client.focus());
                }
                
                // Nếu không có tab nào mở, mở tab mới
                return clients.openWindow(targetUrl);
            })
    );
});
