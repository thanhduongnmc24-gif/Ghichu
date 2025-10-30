document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker ---
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
    const manualTimeStart = document.getElementById('manual-time-start');
    const manualTimeEnd = document.getElementById('manual-time-end');
    const manualEvent = document.getElementById('manual-event');
    
    // CẬP NHẬT: Lấy phần tử mới cho bảng
    const tableBody = document.getElementById('schedule-table-body');
    // const scheduleList = document.getElementById('schedule-list'); // Tham chiếu cũ

    // CÁC PHẦN TỬ MỚI CHO MODAL CÀI ĐẶT
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal');

    // --- 3. Dữ liệu ---
    let schedule = JSON.parse(localStorage.getItem('mySchedule')) || [];
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // --- Hàm Lưu TKB ---
    function saveSchedule() {
        localStorage.setItem('mySchedule', JSON.stringify(schedule));
    }

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

    // --- 5. LOGIC MỚI: Xử lý Modal Cài đặt ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });
    closeModalBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // --- 6. Logic Hiển thị TKB (CẬP NHẬT LỚN - DẠNG LƯỚI) ---
    function renderSchedule() {
        tableBody.innerHTML = ''; // Xóa bảng cũ

        // Tạo một 2D map để theo dõi các ô đã bị "rowspan" chiếm
        const occupied = {};
        days.forEach(day => { occupied[day] = {}; });

        // Lọc và đánh dấu các ô bị chiếm
        schedule.forEach((event, index) => {
            if (!event.day || !event.time || !event.time_end) return; 

            const [startHour, startMin] = event.time.split(':').map(Number);
            const [endHour, endMin] = event.time_end.split(':').map(Number);

            // Tính số giờ "hiệu dụng" mà sự kiện chiếm
            let effectiveEndHour = endHour;
            
            // Nếu 08:00 -> 09:30 (endMin > 0), nó chiếm cả slot 8 và 9.
            // effectiveEndHour = 9 + 1 = 10.
            if (endMin > 0) {
                effectiveEndHour += 1;
            }
            // Nếu 08:00 -> 09:00 (endMin = 0), nó chỉ chiếm slot 8.
            // effectiveEndHour = 9.
            
            // duration = 10 - 8 = 2. (Chiếm slot 8, 9)
            // duration = 9 - 8 = 1. (Chiếm slot 8)
            const duration = Math.max(1, effectiveEndHour - startHour);

            event.startHour = startHour; // Chỉ quan tâm giờ bắt đầu
            event.duration = duration;
            event.originalIndex = index; // Lưu index gốc để Xóa/Sửa

            // Đánh dấu các ô bị chiếm (TRỪ ô bắt đầu)
            for (let i = 1; i < duration; i++) {
                if (occupied[event.day]) {
                    occupied[event.day][startHour + i] = true;
                }
            }
        });

        // Vẽ 24 hàng (00:00 -> 23:00)
        for (let hour = 0; hour < 24; hour++) {
            const tr = document.createElement('tr');
            
            // Cột 1: Giờ
            const thTime = document.createElement('td');
            thTime.className = 'time-slot';
            thTime.textContent = `${String(hour).padStart(2, '0')}:00`;
            tr.appendChild(thTime);

            // Cột 2-8: Các ngày trong tuần (T2 -> CN)
            const weekDaysSorted = days.slice(1).concat(days[0]); // T2, T3, ..., CN
            
            weekDaysSorted.forEach(day => {
                
                // Nếu ô này đã bị 1 event ở trên chiếm (do rowspan), bỏ qua
                if (occupied[day] && occupied[day][hour]) {
                    return; // Không tạo <td>
                }

                // Tìm sự kiện bắt đầu vào (day, hour) này
                const event = schedule.find(e => e.day === day && e.startHour === hour);

                if (event) {
                    // Nếu có sự kiện, tạo ô với rowspan
                    const tdEvent = document.createElement('td');
                    tdEvent.className = 'event-cell';
                    tdEvent.rowSpan = event.duration;
                    
                    const offset = event.notify_offset || 0;

                    // Nội dung của ô sự kiện
                    tdEvent.innerHTML = `
                        <div class="event-item">
                            <div>
                                <strong class="event-title">${event.event}</strong>
                                <span class="event-time">${event.time} - ${event.time_end}</span>
                            </div>
                            <div>
                                <select class="notify-select" data-index="${event.originalIndex}">
                                    <option value="0" ${offset == 0 ? 'selected' : ''}>Báo đúng giờ</option>
                                    <option value="5" ${offset == 5 ? 'selected' : ''}>Báo trước 5 phút</option>
                                    <option value="10" ${offset == 10 ? 'selected' : ''}>Báo trước 10 phút</option>
                                    <option value="15" ${offset == 15 ? 'selected' : ''}>Báo trước 15 phút</option>
                                    <option value="30" ${offset == 30 ? 'selected' : ''}>Báo trước 30 phút</option>
                                </select>
                                <button class="delete-btn" data-index="${event.originalIndex}">Xóa</button>
                            </div>
                        </div>
                    `;
                    tr.appendChild(tdEvent);

                } else {
                    // Nếu không có sự kiện, tạo ô trống
                    const tdEmpty = document.createElement('td');
                    tdEmpty.dataset.day = day;
                    tdEmpty.dataset.hour = hour;
                    tr.appendChild(tdEmpty);
                }
            });

            tableBody.appendChild(tr);
        }
    }

    // --- 7. Xử lý Form Thủ Công ---
    manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newEvent = {
            day: manualDay.value,
            time: manualTimeStart.value,
            time_end: manualTimeEnd.value,
            event: manualEvent.value,
            notify_offset: 0 
        };

        schedule.push(newEvent);
        saveSchedule(); 
        renderSchedule(); 

        manualEvent.value = '';
        manualTimeStart.value = '';
        manualTimeEnd.value = '';
    });

    // --- 8. Xử lý Form AI ---
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
            manualTimeStart.value = data.time;
            manualTimeEnd.value = data.time_end;
            manualEvent.value = data.event;

            aiInput.value = '';
        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            alert('Không thể phân tích. Vui lòng kiểm tra lại prompt.');
        }
    });

    // --- 9. Xử lý Nút Xóa TKB (CẬP NHẬT) ---
    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = e.target.getAttribute('data-index');
            schedule.splice(index, 1); 
            saveSchedule();
            renderSchedule(); 
        }
    });

    // --- 10. LOGIC: Lưu khi thay đổi Báo trước (CẬP NHẬT) ---
    tableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('notify-select')) {
            const index = e.target.getAttribute('data-index');
            const newOffset = e.target.value;
            
            schedule[index].notify_offset = parseInt(newOffset);
            saveSchedule();
            console.log(`Đã lưu báo trước: ${newOffset} phút cho mục ${index}`);
        }
    });

    // --- 11. Logic Thông báo (toàn cục - trong modal) ---
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

    // --- 12. Kiểm tra TKB để gửi Thông báo ---
    function checkNotifications() {
        if (Notification.permission !== "granted") return;

        const now = new Date();
        const currentDay = days[now.getDay()];
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        schedule.forEach(event => {
            const offset = parseInt(event.notify_offset || 0);
            const [hours, minutes] = event.time.split(':').map(Number);
            const eventDate = new Date();
            eventDate.setHours(hours, minutes, 0, 0); 
            eventDate.setMinutes(eventDate.getMinutes() - offset);
            const notifyTimeStr = `${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`;

            if (event.day === currentDay && notifyTimeStr === currentTimeStr) {
                new Notification("Sắp đến giờ!", {
                    body: `${event.event} (lúc ${event.time})`,
                    icon: "icons/icon-192x192.png"
                });
            }
        });
    }
    
    setInterval(checkNotifications, 30000);

    // Khởi động
    renderSchedule();
});