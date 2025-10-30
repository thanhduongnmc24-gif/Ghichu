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
    // Nút Bật Thông Báo (vẫn ID cũ, nhưng giờ ở trong modal)
    const notifyButton = document.getElementById('notify-button'); 
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const manualForm = document.getElementById('manual-form');
    const manualDay = document.getElementById('manual-day');
    const manualTimeStart = document.getElementById('manual-time-start');
    const manualTimeEnd = document.getElementById('manual-time-end');
    const manualEvent = document.getElementById('manual-event');
    const scheduleList = document.getElementById('schedule-list');

    // CÁC PHẦN TỬ MỚI CHO MODAL CÀI ĐẶT
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal');

    // --- 3. Dữ liệu (Lấy từ localStorage - như cũ) ---
    // Cấu trúc dữ liệu TKB bây giờ là:
    // { day, time, time_end, event, notify_offset }
    let schedule = JSON.parse(localStorage.getItem('mySchedule')) || [];
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // --- Hàm Lưu TKB (như cũ) ---
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

    // --- 5. LOGIC MỚI: Xử lý Modal Cài đặt ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });
    closeModalBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    // Đóng modal khi nhấn ra ngoài
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // --- 6. Logic Hiển thị TKB (CẬP NHẬT LỚN) ---
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
            
            // Lấy giá trị báo trước (mặc định là 0 - đúng giờ)
            const offset = event.notify_offset || 0;

            const timeDisplay = (event.time_end && event.time_end !== event.time) ?
                                `${event.time} - ${event.time_end}` :
                                event.time;

            // CẬP NHẬT: Thêm dropdown Báo trước
            li.innerHTML = `
                <div class="time">${event.day}<br>${timeDisplay}</div>
                <div class="event">${event.event}</div>
                
                <select class="notify-select" data-index="${index}">
                    <option value="0" ${offset == 0 ? 'selected' : ''}>Báo đúng giờ</option>
                    <option value="5" ${offset == 5 ? 'selected' : ''}>Báo trước 5 phút</option>
                    <option value="10" ${offset == 10 ? 'selected' : ''}>Báo trước 10 phút</option>
                    <option value="15" ${offset == 15 ? 'selected' : ''}>Báo trước 15 phút</option>
                    <option value="30" ${offset == 30 ? 'selected' : ''}>Báo trước 30 phút</option>
                </select>

                <button class="delete-btn" data-index="${index}">Xóa</button>
            `;
            scheduleList.appendChild(li);
        });
    }

    // --- 7. Xử lý Form Thủ Công (CẬP NHẬT) ---
    manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newEvent = {
            day: manualDay.value,
            time: manualTimeStart.value,
            time_end: manualTimeEnd.value,
            event: manualEvent.value,
            notify_offset: 0 // Thêm giá trị mặc định là "Báo đúng giờ"
        };

        schedule.push(newEvent);
        saveSchedule(); // <-- LƯU LẠI
        renderSchedule();

        manualEvent.value = '';
        manualTimeStart.value = '';
        manualTimeEnd.value = '';
    });

    // --- 8. Xử lý Form AI (CẬP NHẬT) ---
    // (Cần cập nhật để AI trả về cả offset, nhưng tạm thời để mặc định)
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
            // Gemini trả về text, nên parse là json()
            const data = await response.json(); 

            manualDay.value = data.day;
            manualTimeStart.value = data.time;
            manualTimeEnd.value = data.time_end;
            manualEvent.value = data.event;
            // (Hiện tại AI chưa hỗ trợ offset, nên sẽ dùng mặc định khi lưu)

            aiInput.value = '';
        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            // Kiểm tra xem lỗi có phải do response không phải JSON không
            console.log("Response text (nếu có):", await err.response?.text());
            alert('Không thể phân tích. Vui lòng kiểm tra lại prompt.');
        }
    });

    // --- 9. Xử lý Nút Xóa TKB (như cũ) ---
    scheduleList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = e.target.getAttribute('data-index');
            schedule.splice(index, 1);
            saveSchedule();
            renderSchedule();
        }
    });

    // --- 10. LOGIC MỚI: Lưu khi thay đổi Báo trước ---
    scheduleList.addEventListener('change', (e) => {
        if (e.target.classList.contains('notify-select')) {
            const index = e.target.getAttribute('data-index');
            const newOffset = e.target.value;
            
            schedule[index].notify_offset = parseInt(newOffset);
            saveSchedule();
            
            // (Không cần render lại, chỉ cần lưu)
            console.log(`Đã lưu báo trước: ${newOffset} phút cho mục ${index}`);
        }
    });

    // --- 11. Logic Thông báo (toàn cục - như cũ, nút giờ ở trong modal) ---
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

    // --- 12. Kiểm tra TKB để gửi Thông báo (CẬP NHẬT LỚN) ---
    function checkNotifications() {
        if (Notification.permission !== "granted") return;

        const now = new Date();
        const currentDay = days[now.getDay()];
        // Lấy giờ hiện tại "HH:MM"
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        schedule.forEach(event => {
            // Lấy thời gian báo trước (mặc định 0)
            const offset = parseInt(event.notify_offset || 0);

            // 1. Phân tích giờ bắt đầu của sự kiện
            const [hours, minutes] = event.time.split(':').map(Number);

            // 2. Tạo đối tượng Date cho thời gian sự kiện
            const eventDate = new Date();
            eventDate.setHours(hours, minutes, 0, 0); // Đặt giờ sự kiện

            // 3. Trừ đi số phút báo trước
            eventDate.setMinutes(eventDate.getMinutes() - offset);

            // 4. Lấy thời gian "HH:MM" cần báo thức
            const notifyTimeStr = `${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`;

            // 5. So sánh
            if (event.day === currentDay && notifyTimeStr === currentTimeStr) {
                // Đã đến giờ báo thức!
                new Notification("Sắp đến giờ!", {
                    body: `${event.event} (lúc ${event.time})`,
                    icon: "icons/icon-192x192.png"
                });
            }
        });
    }
    
    // Tăng tần suất kiểm tra lên mỗi 30 giây (như cũ)
    setInterval(checkNotifications, 30000);

    // Khởi động
    renderSchedule();
});