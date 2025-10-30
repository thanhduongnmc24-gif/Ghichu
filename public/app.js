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

    // DOM Lịch Mới (Như cũ)
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');

    // DOM Modal Ghi Chú MỚI (Cập nhật)
    const noteModal = document.getElementById('note-modal');
    const closeNoteModalBtn = document.getElementById('close-note-modal');
    const noteModalTitle = document.getElementById('note-modal-title');
    const noteForm = document.getElementById('note-form');
    const noteInput = document.getElementById('note-input');
    const deleteNoteBtn = document.getElementById('delete-note-btn');

    // --- 3. Dữ liệu (CẤU TRÚC MỚI) ---
    // Dữ liệu TKB giờ là: { "YYYY-MM-DD": { "shift": "...", "note": "..." } }
    let scheduleData = JSON.parse(localStorage.getItem('myScheduleData')) || {};
    let currentViewDate = new Date();

    // --- Hàm Lưu TKB (Như cũ) ---
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
    // Nút Bật thông báo (Như cũ)
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


    // --- 6. LOGIC MỚI: Vẽ Lịch Tháng (CẬP NHẬT) ---
    function renderCalendar(date) {
        calendarBody.innerHTML = ''; // Xóa lịch cũ
        const year = date.getFullYear();
        const month = date.getMonth(); 

        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        let firstDayOfWeek = firstDayOfMonth.getDay();
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; // CN = 7

        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1));

        const todayStr = new Date().toISOString().split('T')[0];

        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';

            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const day = currentDate.getDate();
            const dateStr = currentDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
            
            // Thêm số ngày
            const dayNumberEl = document.createElement('span');
            dayNumberEl.className = 'day-number';
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);
            
            dayCell.dataset.date = dateStr; 

            // Kiểm tra xem có phải ngày của tháng khác không
            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month');
            } else {
                // Chỉ thêm sự kiện cho ngày trong tháng
                const dayData = scheduleData[dateStr];
                
                if (dayData) {
                    // Xử lý Ca (Shift)
                    if (dayData.shift) {
                        // Logic đặc biệt: "giãn ca" chỉ tô màu, không ghi chữ
                        if (dayData.shift === 'giãn ca') {
                            dayCell.classList.add('shift-gian-ca'); // Tô vàng
                        } else if (dayData.shift === 'off') {
                            dayCell.classList.add('shift-off'); // Tô xám
                        } else {
                            // "ngày", "đêm" -> hiển thị chữ
                            const shiftEl = document.createElement('span');
                            shiftEl.className = 'day-shift';
                            shiftEl.textContent = dayData.shift;
                            dayCell.appendChild(shiftEl);
                        }
                    }
                    
                    // Xử lý Ghi chú (Note)
                    if (dayData.note) {
                        const noteEl = document.createElement('span');
                        noteEl.className = 'day-note';
                        noteEl.textContent = dayData.note;
                        dayCell.appendChild(noteEl);
                    }
                }
                
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

    // --- 7. LOGIC MỚI: Điều khiển Lịch (Như cũ) ---
    prevMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() - 1);
        renderCalendar(currentViewDate);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() + 1);
        renderCalendar(currentViewDate);
    });

    // --- 8. LOGIC MỚI: Xử lý Modal Ghi Chú (CẬP NHẬT) ---
    function openNoteModal(dateStr) {
        const date = new Date(dateStr + 'T00:00:00'); 
        noteModal.style.display = 'flex';
        noteModalTitle.textContent = `Cập nhật (${date.toLocaleDateString('vi-VN')})`;
        
        noteForm.dataset.date = dateStr;
        
        // Tải dữ liệu cũ (nếu có)
        const dayData = scheduleData[dateStr] || {};
        const savedShift = dayData.shift || ""; // Mặc định là "" (Trống)
        const savedNote = dayData.note || "";

        // Check radio button tương ứng
        const radio = noteForm.querySelector(`input[name="shift"][value="${savedShift}"]`);
        if (radio) {
            radio.checked = true;
        } else {
            // Nếu lưu shift lạ (ví dụ "ABC" từ AI), check vào "Trống"
            noteForm.querySelector(`input[name="shift"][value=""]`).checked = true;
        }

        // Điền ghi chú
        noteInput.value = savedNote;
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
        
        // Lấy Ca (Shift) đã chọn
        const selectedShift = noteForm.querySelector('input[name="shift"]:checked').value;
        
        // Lấy Ghi chú (Note)
        const noteText = noteInput.value.trim();

        // Nếu cả Ca và Ghi chú đều rỗng -> Xóa ngày này
        if (!selectedShift && !noteText) {
            delete scheduleData[dateStr];
        } else {
            // Nếu có ít nhất 1 cái, lưu lại
            scheduleData[dateStr] = {
                shift: selectedShift,
                note: noteText
            };
        }

        saveScheduleData();
        renderCalendar(currentViewDate); // Vẽ lại lịch
        noteModal.style.display = 'none'; // Đóng modal
    });

    // Xử lý nút Xóa Hết
    deleteNoteBtn.addEventListener('click', () => {
        const dateStr = noteForm.dataset.date;
        delete scheduleData[dateStr]; // Xóa dữ liệu ngày này
        saveScheduleData();
        renderCalendar(currentViewDate);
        noteModal.style.display = 'none';
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
                        // Lấy dữ liệu hiện có (nếu có)
                        const existingData = scheduleData[update.date] || {};

                        // Ghi đè Ca (Shift) (nếu AI có)
                        const newShift = update.shift || existingData.shift;
                        // Ghi đè Ghi chú (Note) (nếu AI có)
                        const newNote = update.note || existingData.note;

                        if (newShift || newNote) {
                            scheduleData[update.date] = {
                                shift: newShift,
                                note: newNote
                            };
                        } else {
                            delete scheduleData[update.date]; // Nếu AI bảo xóa
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
    
    // Khởi động
    renderCalendar(currentViewDate); // Vẽ lịch tháng hiện tại
    updateClock(); // Khởi động đồng hồ
});