const CACHE_NAME = 'ghichu-app-cache-v1';
// CẬP NHẬT: Thêm lại các tệp /calendar/ vào cache
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/calendar/',
    '/calendar/index.html',
    '/calendar/app.js',
    '/icons/icon-192x192.png'
    // (Các tệp CSS/JS của trang Tin Tức là từ CDN nên không cần cache)
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
    
    // CẬP NHẬT: Logic "Cache First" (Ưu tiên Cache)
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Nếu tìm thấy trong cache, trả về nó (TẢI TỨC THÌ)
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