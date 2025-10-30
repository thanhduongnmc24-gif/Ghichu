const CACHE_NAME = 'tkb-app-cache-v1';
// Các tệp cốt lõi cần thiết để app chạy
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json'
    // Bạn nên thêm các icon vào đây, ví dụ: '/icons/icon-192x192.png'
];

// 1. Cài đặt Service Worker: Mở cache và lưu các tệp
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. Fetch: Phản hồi từ Cache trước, nếu không có mới lấy từ Mạng
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Nếu tìm thấy trong cache, trả về nó
                if (response) {
                    return response;
                }
                // Nếu không, fetch từ mạng
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
