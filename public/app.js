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
    const modalShiftInfo = document.getElementById('modal-shift-info'); // Dòng hiển thị Ca

    // --- 3. Dữ liệu (CẤU TRÚC MỚI) ---
    // Dữ liệu TKB giờ CHỈ LÀ GHI CHÚ
    // { "YYYY-MM-DD": "ghi chú..." }
    let noteData = JSON.parse(localStorage.getItem('myScheduleNotes')) || {};
    let currentViewDate = new Date();

    // --- CÀI ĐẶT CHU KỲ (PATTERN) TỰ ĐỘNG ---
    // Dựa theo ảnh của bạn: 26/10 là "ngày", 27/10 là "đêm", 28/10 là "giãn ca"
    // Đây là chu kỳ 3 ngày.
    
    // 1. Chọn ngày gốc (Epoch). Chúng ta chọn 26/10/2025 làm mốc 0.
    const EPOCH_DATE = new Date('2025-10-26T00:00:00+07:00'); // Ngày 26/10/2025
    // 2. Định nghĩa chu kỳ
    const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];

    // --- Hàm Lưu TKB (MỚI) ---
    function saveNoteData() {
        localStorage.setItem('myScheduleNotes', JSON.stringify(noteData));
    }
    
    // --- HÀM MỚI: Tính Ca (Shift) Tự động ---
    function getShiftForDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00+07:00');
        
        // Tính số mili-giây chênh lệch
        const diffTime = date.getTime() - EPOCH_DATE.getTime();
        
        // Chuyển sang ngày (làm tròn)
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        // Tính toán index trong chu kỳ
        // (diffDays % 3 + 3) % 3 đảm bảo kết quả luôn dương (0, 1, 2)
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
                
                // --- LOGIC MỚI ---
                // 1. Tính toán Ca (Shift) tự động
                const shift = getShiftForDate(dateStr);
                
                // 2. Lấy Ghi chú (Note) do người dùng nhập
                const note = noteData[dateStr] || "";

                // 3. Hiển thị Ca (Shift)
                if (shift === 'giãn ca') {
                    dayCell.classList.add('shift-gian-ca'); // Tô vàng
                } else if (shift === 'off') {
                    dayCell.classList.add('shift-off'); // Tô xám
                } else {
                    // "ngày", "đêm" -> hiển thị chữ
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift';
                    shiftEl.textContent = shift;
                    dayCell.appendChild(shiftEl);
                }
                
                // 4. Hiển thị Ghi chú (Note)
                if (note) {
                    const noteEl = document.createElement('span');
                    noteEl.className = 'day-note';
                    noteEl.textContent = note;
                    dayCell.appendChild(noteEl);
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
        
        // Hiển thị Ca (Shift) tự động (KHÔNG cho sửa)
        const shift = getShiftForDate(dateStr);
        modalShiftInfo.innerHTML = `Ca tự động: <strong>${shift.toUpperCase()}</strong>`;
        
        // Tải Ghi chú (Note) cũ (nếu có)
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
        
        // Lấy Ghi chú (Note)
        const noteText = noteInput.value.trim();

        if (noteText) {
            noteData[dateStr] = noteText;
        } else {
            // Nếu input rỗng, coi như xóa Ghi chú
            delete noteData[dateStr];
        }

        saveNoteData();
        renderCalendar(currentViewDate); // Vẽ lại lịch
        noteModal.style.display = 'none'; // Đóng modal
    });

    // Xử lý nút Xóa Ghi Chú
    deleteNoteBtn.addEventListener('click', () => {
        const dateStr = noteForm.dataset.date;
        delete noteData[dateStr]; // Chỉ xóa Ghi chú
        saveNoteData();
        renderCalendar(currentViewDate);
        noteModal.style.display = 'none';
    });

    // --- 9. Xử lý Form AI (CẬP NHẬT - CHỈ LƯU NOTE) ---
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
            
            const updates = await response.json(); // Mong đợi một MẢNG (chỉ chứa 'note')

            if (Array.isArray(updates)) {
                // Lặp qua mảng kết quả AI trả về
                updates.forEach(update => {
                    if (update.date && update.note) {
                        // Ghi đè Ghi chú (Note)
                        noteData[update.date] = update.note;
                    }
                });
                
                saveNoteData(); // Lưu 1 lần sau khi cập nhật hết
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