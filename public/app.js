// Chạy khi toàn bộ trang đã tải
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker cho PWA ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker đã đăng ký!', reg))
            .catch(err => console.log('Đăng ký Service Worker lỗi:', err));
    }

    // --- 2. Lấy các phần tử DOM ---
    const dateEl = document.getElementById('date');
    const timeEl = document.getElementById('time');
    const notifyButton = document.getElementById('notify-button');
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const manualForm = document.getElementById('manual-form');
    const manualDay = document.getElementById('manual-day');
    const manualTime = document.getElementById('manual-time');
    const manualEvent = document.getElementById('manual-event');
    const scheduleList = document.getElementById('schedule-list');

    // --- 3. Dữ liệu (Tạm thời lưu ở đây) ---
    // Trong ứng dụng thực tế, bạn sẽ dùng localStorage hoặc IndexedDB
    let schedule = [];

    // --- 4. Logic Đồng hồ ---
    function updateClock() {
        const now = new Date();
        
        // Định dạng ngày: Thứ [2-CN], Ngày [dd]/[mm]/[yyyy]
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayName = days[now.getDay()];
        const dateStr = `${dayName}, ${now.toLocaleDateString('vi-VN')}`;
        
        // Định dạng giờ 00-24
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        dateEl.textContent = dateStr;
        timeEl.textContent = timeStr;
    }
    updateClock(); // Chạy lần đầu
    setInterval(updateClock, 1000); // Cập nhật mỗi giây

    // --- 5. Logic Hiển thị TKB ---
    function renderSchedule() {
        scheduleList.innerHTML = ''; // Xóa list cũ
        
        // Sắp xếp TKB theo thời gian
        schedule.sort((a, b) => {
            if (a.day !== b.day) return days.indexOf(a.day) - days.indexOf(b.day);
            return a.time.localeCompare(b.time);
        });

        if (schedule.length === 0) {
            scheduleList.innerHTML = '<li>Chưa có lịch trình nào.</li>';
            return;
        }

        schedule.forEach((event, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="time">${event.day}<br>${event.time}</div>
                <div class="event">${event.event}</div>
                <button class="delete-btn" data-index="${index}">Xóa</button>
            `;
            scheduleList.appendChild(li);
        });
    }

    // --- 6. Xử lý Form Thủ Công ---
    manualForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Ngăn trang tải lại
        
        const newEvent = {
            day: manualDay.value,
            time: manualTime.value,
            event: manualEvent.value
        };

        schedule.push(newEvent); // Thêm vào mảng
        renderSchedule(); // Vẽ lại TKB

        // Xóa form
        manualEvent.value = '';
    });

    // --- 7. Xử lý Form AI ---
    aiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = aiInput.value;
        if (!text) return;

        try {
            const response = await fetch('/api/ai-parse', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });

            const data = await response.json();

            // Tự động điền vào form thủ công
            manualDay.value = data.day;
            manualTime.value = data.time;
            manualEvent.value = data.event;

            aiInput.value = ''; // Xóa input AI
        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            alert('Không thể phân tích. Vui lòng thử lại.');
        }
    });

    // --- 8. Xử lý Nút Xóa TKB ---
    scheduleList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = e.target.getAttribute('data-index');
            schedule.splice(index, 1); // Xóa khỏi mảng
            renderSchedule(); // Vẽ lại
        }
    });

    // --- 9. Logic Thông báo ---
    notifyButton.addEventListener('click', () => {
        if (!("Notification" in window)) {
            alert("Trình duyệt này không hỗ trợ thông báo.");
        } else if (Notification.permission === "granted") {
            // Nếu đã có quyền, gửi thử 1 thông báo
            new Notification("Đã bật!", { body: "Bạn đã bật thông báo thành công!" });
        } else if (Notification.permission !== "denied") {
            // Hỏi quyền
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("Cảm ơn!", { body: "Thông báo đã được bật!" });
                }
            });
        }
    });

    // --- 10. Kiểm tra TKB để gửi Thông báo ---
    function checkNotifications() {
        if (Notification.permission !== "granted") {
            return; // Chưa cho phép, không làm gì cả
        }

        const now = new Date();
        const currentDay = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][now.getDay()];
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        schedule.forEach(event => {
            if (event.day === currentDay && event.time === currentTime) {
                // Đã đến giờ!
                new Notification("Đến giờ rồi!", {
                    body: event.event,
                    icon: "icons/icon-192x192.png" // (Bạn phải tự tạo icon này)
                });
            }
        });
    }

    // Chạy kiểm tra thông báo mỗi 30 giây (không nên chạy mỗi giây)
    setInterval(checkNotifications, 30000);

    // Khởi động
    renderSchedule();
});
