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

// 4. (CẬP NHẬT CHO IOS) Lắng nghe Push Notification từ Server
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

// 5. (MỚI) Xử lý khi người dùng nhấn vào thông báo
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
