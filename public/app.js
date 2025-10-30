document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker (Như cũ) ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker đã đăng ký!', reg))
            .catch(err => console.log('Đăng ký Service Worker lỗi:', err));
    }

    // --- 2. Lấy các phần tử DOM (CẬP NHẬT) ---
    const dateEl = document.getElementById('date');
    const timeEl = document.getElementById('time');
    
    // Form AI (Như cũ)
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    
    // Cài đặt (Như cũ)
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const notifyButton = document.getElementById('notify-button');

    // DOM Lịch Mới
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');

    // DOM Modal Ghi Chú Mới
    const noteModal = document.getElementById('note-modal');
    const closeNoteModalBtn = document.getElementById('close-note-modal');
    const noteModalTitle = document.getElementById('note-modal-title');
    const noteForm = document.getElementById('note-form');
    const noteInput = document.getElementById('note-input');
    const deleteNoteBtn = document.getElementById('delete-note-btn');

    // --- 3. Dữ liệu (CẤU TRÚC MỚI) ---
    // Dữ liệu TKB giờ là một Object, key là "YYYY-MM-DD"
    let scheduleData = JSON.parse(localStorage.getItem('myScheduleData')) || {};
    // Biến toàn cục để theo dõi tháng/năm đang xem
    let currentViewDate = new Date();

    // --- Hàm Lưu TKB (MỚI) ---
    function saveScheduleData() {
        localStorage.setItem('myScheduleData', JSON.stringify(scheduleData));
    }

    // --- 4. Logic Đồng hồ (Như cũ) ---
    function updateClock() {
        const now = new Date();
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayName = days[now.getDay()];
        const dateStr = `${dayName}, ${now.toLocaleDateString('vi-VN')}`;
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        dateEl.textContent = dateStr;
        timeEl.textContent = timeStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // --- 5. LOGIC Modal Cài đặt (Như cũ) ---
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
    // Nút Bật thông báo (Hiện tại chỉ là giao diện, logic cũ đã bị xóa)
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


    // --- 6. LOGIC MỚI: Vẽ Lịch Tháng ---
    function renderCalendar(date) {
        calendarBody.innerHTML = ''; // Xóa lịch cũ
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11

        // Cập nhật tiêu đề (ví dụ: "Tháng 10 2025")
        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;

        // Tìm ngày đầu tiên của tháng
        const firstDayOfMonth = new Date(year, month, 1);
        // Tìm ngày cuối cùng của tháng
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Lấy thứ của ngày đầu tiên (0=CN, 1=T2, ..., 6=T7)
        // Chúng ta muốn tuần bắt đầu từ T2 (index 1)
        let firstDayOfWeek = firstDayOfMonth.getDay(); // 0-6
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; // Chuyển Chủ Nhật (0) thành 7

        // Tìm ngày bắt đầu vẽ trên lịch (có thể là T2 của tuần trước)
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1)); // Lùi lại (firstDayOfWeek - 1) ngày

        const todayStr = new Date().toISOString().split('T')[0];

        // Vẽ 42 ô (6 tuần x 7 ngày)
        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';

            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const day = currentDate.getDate();
            const dateStr = currentDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
            
            dayCell.textContent = day;
            dayCell.dataset.date = dateStr; // Lưu YYYY-MM-DD vào ô

            // Kiểm tra xem có phải ngày của tháng khác không
            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month');
            } else {
                // Chỉ thêm sự kiện cho ngày trong tháng
                const dayData = scheduleData[dateStr];
                if (dayData) {
                    if (dayData.note) {
                        const noteEl = document.createElement('span');
                        noteEl.className = 'day-note';
                        noteEl.textContent = dayData.note;
                        dayCell.appendChild(noteEl);
                    }
                    if (dayData.type === 'giãn ca') {
                        dayCell.classList.add('type-gian-ca');
                    }
                }
                
                // Đánh dấu ngày hôm nay
                if (dateStr === todayStr) {
                    dayCell.classList.add('today');
                }

                // Thêm sự kiện click
                dayCell.addEventListener('click', () => {
                    openNoteModal(dateStr);
                });
            }
            
            calendarBody.appendChild(dayCell);
        }
    }

    // --- 7. LOGIC MỚI: Điều khiển Lịch ---
    prevMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() - 1);
        renderCalendar(currentViewDate);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() + 1);
        renderCalendar(currentViewDate);
    });

    // --- 8. LOGIC MỚI: Xử lý Modal Ghi Chú ---
    function openNoteModal(dateStr) {
        const date = new Date(dateStr + 'T00:00:00'); // Đảm bảo đúng múi giờ
        noteModal.style.display = 'flex';
        // Đặt tiêu đề (ví dụ: "Ghi chú (30/10/2025)")
        noteModalTitle.textContent = `Ghi chú (${date.toLocaleDateString('vi-VN')})`;
        
        // Lưu ngày đang sửa vào form
        noteForm.dataset.date = dateStr;
        
        // Tải ghi chú cũ (nếu có)
        const dayData = scheduleData[dateStr];
        if (dayData) {
            noteInput.value = dayData.note || '';
        } else {
            noteInput.value = '';
        }
    }

    // Đóng modal
    closeNoteModalBtn.addEventListener('click', () => {
        noteModal.style.display = 'none';
    });
    noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) {
            noteModal.style.display = 'none';
        }
    });

    // Xử lý khi Lưu form ghi chú
    noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateStr = noteForm.dataset.date;
        const noteText = noteInput.value.trim();

        if (noteText) {
            // Kiểm tra xem có từ khóa đặc biệt không
            if (noteText === 'giãn ca') {
                scheduleData[dateStr] = { type: 'giãn ca' };
            } else {
                scheduleData[dateStr] = { note: noteText };
            }
        } else {
            // Nếu input rỗng, coi như xóa
            delete scheduleData[dateStr];
        }

        saveScheduleData();
        renderCalendar(currentViewDate); // Vẽ lại lịch
        noteModal.style.display = 'none'; // Đóng modal
    });

    // Xử lý nút Xóa
    deleteNoteBtn.addEventListener('click', () => {
        const dateStr = noteForm.dataset.date;
        delete scheduleData[dateStr];
        saveScheduleData();
        renderCalendar(currentViewDate);
        noteModal.style.display = 'none';
    });
    
    // Xử lý các nút nhanh (Đêm, Ngày, Giãn Ca)
    noteModal.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            noteInput.value = e.target.dataset.value;
            // Tự động submit form
            noteForm.dispatchEvent(new Event('submit'));
        });
    });


    // --- 9. Xử lý Form AI (CẬP NHẬT) ---
    aiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = aiInput.value;
        if (!text) return;

        aiInput.disabled = true;
        aiForm.querySelector('button').disabled = true;
        aiForm.querySelector('button').textContent = "Đang xử lý...";

        try {
            const response = await fetch('/api/ai-parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });
            
            const updates = await response.json(); // Mong đợi một MẢNG

            if (Array.isArray(updates)) {
                // Lặp qua mảng kết quả AI trả về
                updates.forEach(update => {
                    if (update.date) {
                        if (update.clear) {
                            delete scheduleData[update.date];
                        } else if (update.type) {
                            scheduleData[update.date] = { type: update.type };
                        } else if (update.note) {
                            scheduleData[update.date] = { note: update.note };
                        }
                    }
                });
                
                saveScheduleData(); // Lưu 1 lần sau khi cập nhật hết
                renderCalendar(currentViewDate); // Vẽ lại lịch
                aiInput.value = ''; // Xóa input
            } else {
                throw new Error("AI không trả về định dạng mảng.");
            }

        } catch (err) {
            console.error('Lỗi gọi AI API:', err);
            alert('Không thể phân tích. Vui lòng kiểm tra lại prompt và API key.');
        }

        aiInput.disabled = false;
        aiForm.querySelector('button').disabled = false;
        aiForm.querySelector('button').textContent = "Phân tích";
    });
    
    // --- 10. LOGIC CŨ (ĐÃ XÓA) ---
    // (Xóa hàm checkNotifications và setInterval của nó)
    // (Xóa hàm renderSchedule (bảng) và các listener của nó)

    // Khởi động
    renderCalendar(currentViewDate); // Vẽ lịch tháng hiện tại
    updateClock(); // Khởi động đồng hồ
});