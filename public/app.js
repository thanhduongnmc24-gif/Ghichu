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

    // --- 3. Dữ liệu ---
    let schedule = [];
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // --- 4. Logic Đồng hồ ---
    function updateClock() {
        const now = new Date();
        const dayName = days[now.getDay()];
        const dateStr = `${dayName}, ${now.toLocaleDateString('vi-VN')}`;
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        dateEl.textContent = dateStr;
        timeEl.textContent = timeStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // --- 5. Logic Hiển thị TKB ---
    function renderSchedule() {
        scheduleList.innerHTML = '';
        
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
        e.preventDefault();
        const newEvent = {
            day: manualDay.value,
            time: manualTime.value,
            event: manualEvent.value
        };
        schedule.push(newEvent);
        renderSchedule();
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });
            const data = await response.json();
            manualDay.value = data.day;
            manualTime.value = data.time;
            manualEvent.value = data.event;
            aiInput.value = '';
        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            alert('Không thể phân tích. Vui lòng thử lại.');
        }
    });

    // --- 8. Xử lý Nút Xóa TKB ---
    scheduleList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = e.target.getAttribute('data-index');
            schedule.splice(index, 1);
            renderSchedule();
        }
    });

    // --- 9. Logic Thông báo ---
    notifyButton.addEventListener('click', () => {
        if (!("Notification" in window)) {
            alert("Trình duyệt này không hỗ trợ thông báo.");
        } else if (Notification.permission === "granted") {
            new Notification("Đã bật!", { body: "Bạn đã bật thông báo thành công!" });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("Cảm ơn!", { body: "Thông báo đã được bật!" });
                }
            });
        }
    });

    // --- 10. Kiểm tra TKB để gửi Thông báo ---
    function checkNotifications() {
        if (Notification.permission !== "granted") return;
        const now = new Date();
        const currentDay = days[now.getDay()];
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        schedule.forEach(event => {
            if (event.day === currentDay && event.time === currentTime) {
                new Notification("Đến giờ rồi!", {
                    body: event.event,
                    icon: "icons/icon-192x192.png"
                });
            }
        });
    }
    setInterval(checkNotifications, 30000); // Kiểm tra mỗi 30 giây
    renderSchedule(); // Hiển thị TKB khi mới tải trang
});
