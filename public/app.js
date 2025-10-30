document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker (Như cũ) ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker đã đăng ký!', reg))
            .catch(err => console.log('Đăng ký Service Worker lỗi:', err));
    }
    
    // --- HÀM MỚI: SỬA LỖI MÚI GIỜ (Lấy YYYY-MM-DD theo giờ địa phương) ---
    function getLocalDateString(date) {
        const year = date.getFullYear();
        // getMonth() trả về 0-11, nên +1
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // --- HÀM MỚI: Tính toán số ngày (An toàn, không bị lỗi DST/timezone) ---
    function dateToDays(dateStr) {
        // Tách chuỗi YYYY-MM-DD
        const [year, month, day] = dateStr.split('-').map(Number);
        // JS Date(year, month-1, day) coi là ngày địa phương
        const date = new Date(year, month - 1, day);
        // Chia cho số mili-giây trong 1 ngày
        return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
    }


    // --- 2. Lấy các phần tử DOM (Như cũ) ---
    const dateEl = document.getElementById('date');
    const timeEl = document.getElementById('time');
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const notifyButton = document.getElementById('notify-button');
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const noteModal = document.getElementById('note-modal');
    const closeNoteModalBtn = document.getElementById('close-note-modal');
    const noteModalTitle = document.getElementById('note-modal-title');
    const noteForm = document.getElementById('note-form');
    const noteInput = document.getElementById('note-input');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const modalShiftInfo = document.getElementById('modal-shift-info');

    // --- 3. Dữ liệu (Như cũ) ---
    let noteData = JSON.parse(localStorage.getItem('myScheduleNotes')) || {};
    let currentViewDate = new Date();

    // --- CÀI ĐẶT CHU KỲ (CẬP NHẬT) ---
    // 1. Ngày gốc (Epoch). Chúng ta chọn 26/10/2025 làm mốc 0.
    const EPOCH_DAYS = dateToDays('2025-10-26');
    // 2. Định nghĩa chu kỳ
    const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca']; // 3 ngày

    // --- Hàm Lưu TKB (Như cũ) ---
    function saveNoteData() {
        localStorage.setItem('myScheduleNotes', JSON.stringify(noteData));
    }
    
    // --- HÀM TÍNH CA (CẬP NHẬT - An toàn hơn) ---
    function getShiftForDate(dateStr) {
        // Chuyển ngày cần tính sang "số ngày"
        const currentDays = dateToDays(dateStr);
        
        // Tính số ngày chênh lệch
        const diffDays = currentDays - EPOCH_DAYS;
        
        // Tính toán index trong chu kỳ
        const patternIndex = (diffDays % SHIFT_PATTERN.length + SHIFT_PATTERN.length) % SHIFT_PATTERN.length;
        
        return SHIFT_PATTERN[patternIndex];
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


    // --- 6. LOGIC MỚI: Vẽ Lịch Tháng (CẬP NHẬT - Sửa lỗi ngày hiện tại) ---
    function renderCalendar(date) {
        calendarBody.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth(); 

        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        
        let firstDayOfWeek = firstDayOfMonth.getDay();
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; // CN = 7

        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1));

        // CẬP NHẬT: Dùng hàm mới để lấy ngày hôm nay (YYYY-MM-DD) theo giờ địa phương
        const todayStr = getLocalDateString(new Date());

        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';

            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            // CẬP NHẬT: Dùng hàm mới để lấy YYYY-MM-DD
            const dateStr = getLocalDateString(currentDate);
            
            const day = currentDate.getDate();
            
            const dayNumberEl = document.createElement('span');
            dayNumberEl.className = 'day-number';
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);
            
            dayCell.dataset.date = dateStr; 

            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month');
            } else {
                
                // --- LOGIC (Như cũ) ---
                const shift = getShiftForDate(dateStr);
                const note = noteData[dateStr] || "";

                if (shift === 'giãn ca') {
                    dayCell.classList.add('shift-gian-ca');
                } else if (shift === 'off') {
                    dayCell.classList.add('shift-off');
                } else {
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift';
                    shiftEl.textContent = shift;
                    dayCell.appendChild(shiftEl);
                }
                
                if (note) {
                    const noteEl = document.createElement('span');
                    noteEl.className = 'day-note';
                    noteEl.textContent = note;
                    dayCell.appendChild(noteEl);
                }
                
                // So sánh với todayStr đã được sửa lỗi
                if (dateStr === todayStr) {
                    dayCell.classList.add('today');
                }

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

    // --- 8. LOGIC MỚI: Xử lý Modal Ghi Chú (Như cũ) ---
    function openNoteModal(dateStr) {
        // CẬP NHẬT: Sửa lỗi T00:00:00 (chỉ cần YYYY-MM-DD)
        const dateParts = dateStr.split('-').map(Number);
        const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        
        noteModal.style.display = 'flex';
        noteModalTitle.textContent = `Cập nhật (${date.toLocaleDateString('vi-VN')})`;
        
        noteForm.dataset.date = dateStr;
        
        const shift = getShiftForDate(dateStr);
        modalShiftInfo.innerHTML = `Ca tự động: <strong>${shift.toUpperCase()}</strong>`;
        
        const savedNote = noteData[dateStr] || "";
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

    // Xử lý khi Lưu form ghi chú (CHỈ LƯU NOTE)
    noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateStr = noteForm.dataset.date;
        const noteText = noteInput.value.trim();

        if (noteText) {
            noteData[dateStr] = noteText;
        } else {
            delete noteData[dateStr];
        }

        saveNoteData();
        renderCalendar(currentViewDate);
        noteModal.style.display = 'none';
    });

    // Xử lý nút Xóa Ghi Chú
    deleteNoteBtn.addEventListener('click', () => {
        const dateStr = noteForm.dataset.date;
        delete noteData[dateStr];
        saveNoteData();
        renderCalendar(currentViewDate);
        noteModal.style.display = 'none';
    });

    // --- 9. Xử lý Form AI (Như cũ) ---
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
            
            const updates = await response.json(); 

            if (Array.isArray(updates)) {
                updates.forEach(update => {
                    if (update.date && update.note) {
                        noteData[update.date] = update.note;
                    }
                });
                
                saveNoteData(); 
                renderCalendar(currentViewDate); 
                aiInput.value = ''; 
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
    renderCalendar(currentViewDate);
    updateClock();
});