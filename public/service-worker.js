console.log('Service Worker (Push) đã tải!');

// 1. Lắng nghe "cuộc gọi" (push event)
self.addEventListener('push', event => {
    console.log('[Service Worker] Đã nhận Push Event.');

    let data;
    try {
        // Đọc dữ liệu server gửi (JSON: { title: "...", body: "..." })
        data = event.data.json();
    } catch (e) {
        console.error("Không thể parse data:", e);
        data = {
            title: "Lỗi Thông Báo",
            body: "Không thể đọc nội dung thông báo."
        };
    }

    const title = data.title || "Thông Báo Mới";
    const options = {
        body: data.body || "Bạn có tin nhắn mới.",
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png' // Icon nhỏ trên Android
    };

    // Hiển thị thông báo lên màn hình
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// 2. Lắng nghe khi người dùng nhấn vào thông báo
self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] Đã nhấn vào Thông báo.');
    event.notification.close(); // Đóng thông báo

    // Mở trang Lịch khi nhấn vào
    event.waitUntil(
        // CẬP NHẬT: Chúng ta không thể mở /calendar/
        // vì nó là một tab. Chúng ta sẽ mở trang chính ('/')
        // và JavaScript trên trang chính sẽ tự chuyển tab (nếu cần).
        clients.openWindow('/')
    );
});
