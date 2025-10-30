document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker (như cũ) ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker đã đăng ký!', reg))
            .catch(err => console.log('Đăng ký Service Worker lỗi:', err));
    }

    // --- 2. Lấy các phần tử DOM (CẬP NHẬT) ---
    const dateEl = document.getElementById('date');
    const timeEl = document.getElementById('time');
    const notifyButton = document.getElementById('notify-button');
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const manualForm = document.getElementById('manual-form');
    const manualDay = document.getElementById('manual-day');
    const manualTimeStart = document.getElementById('manual-time-start'); // ID ĐÃ ĐỔI
    const manualTimeEnd = document.getElementById('manual-time-end');   // ID MỚI
    const manualEvent = document.getElementById('manual-event');
    const scheduleList = document.getElementById('schedule-list');

    // --- 3. Dữ liệu (CẬP NHẬT: Lấy từ localStorage) ---
    let schedule = JSON.parse(localStorage.getItem('mySchedule')) || [];
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // --- HÀM MỚI: Lưu TKB vào localStorage ---
    function saveSchedule() {
        localStorage.setItem('mySchedule', JSON.stringify(schedule));
    }

    // --- 4. Logic Đồng hồ (như cũ) ---
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

    // --- 5. Logic Hiển thị TKB (CẬP NHẬT) ---
    function renderSchedule() {
        scheduleList.innerHTML = '';
        
        schedule.sort((a, b) => {
            if (a.day !== b.day) return days.indexOf(a.day) - days.indexOf(b.day);
            return a.time.localeCompare(b.time); // Sắp xếp theo giờ bắt đầu
        });

        if (schedule.length === 0) {
            scheduleList.innerHTML = '<li>Chưa có lịch trình nào.</li>';
            return;
        }

        schedule.forEach((event, index) => {
            const li = document.createElement('li');

            // CẬP NHẬT HIỂN THỊ: Thêm time_end
            // Chỉ hiển thị "8:00 - 9:00" nếu giờ kết thúc khác giờ bắt đầu
            const timeDisplay = (event.time_end && event.time_end !== event.time) ?
                                `${event.time} - ${event.time_end}` :
                                event.time;

            li.innerHTML = `
                <div class="time">${event.day}<br>${timeDisplay}</div>
                <div class="event">${event.event}</div>
                <button class="delete-btn" data-index="${index}">Xóa</button>
            `;
            scheduleList.appendChild(li);
        });
    }

    // --- 6. Xử lý Form Thủ Công (CẬP NHẬT) ---
    manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newEvent = {
            day: manualDay.value,
            time: manualTimeStart.value, // Dùng ID mới
            time_end: manualTimeEnd.value, // Dùng ID mới
            event: manualEvent.value
        };

        schedule.push(newEvent);
        saveSchedule(); // <-- LƯU LẠI
        renderSchedule();

        // Xóa form
        manualEvent.value = '';
        manualTimeStart.value = ''; // Xóa giờ bắt đầu
        manualTimeEnd.value = '';   // Xóa giờ kết thúc
    });

    // --- 7. Xử lý Form AI (CẬP NHẬT) ---
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

            // CẬP NHẬT: Điền cả 2 ô thời gian
            manualDay.value = data.day;
            manualTimeStart.value = data.time;      // Dùng ID mới
            manualTimeEnd.value = data.time_end;    // Dùng ID mới
            manualEvent.value = data.event;

            aiInput.value = '';
        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            alert('Không thể phân tích. Vui lòng thử lại.');
        }
    });

    // --- 8. Xử lý Nút Xóa TKB (CẬP NHẬT) ---
    scheduleList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = e.target.getAttribute('data-index');
            schedule.splice(index, 1); // Xóa khỏi mảng
            saveSchedule(); // <-- LƯU LẠI
            renderSchedule();
        }
    });

    // --- 9. Logic Thông báo (như cũ) ---
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

    // --- 10. Kiểm tra TKB để gửi Thông báo (như cũ) ---
    // Logic này vẫn đúng, nó sẽ kiểm tra giờ BẮT ĐẦU (event.time)
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
    setInterval(checkNotifications, 30000);

    // Khởi động: Hiển thị TKB đã lưu khi mới tải trang
    renderSchedule();
});
