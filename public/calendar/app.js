document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Đăng ký Service Worker ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/calendar/service-worker.js')
            .then(reg => console.log('Service Worker (Lịch) đã đăng ký!', reg))
            .catch(err => console.log('Đăng ký Service Worker (Lịch) lỗi:', err));
    }
    
    // --- HÀM MỚI: SỬA LỖI MÚI GIỜ (Lấy YYYY-MM-DD theo giờ địa phương) ---
    function getLocalDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // --- HÀM MỚI: Tính toán số ngày (An toàn, không bị lỗi DST/timezone) ---
    function dateToDays(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
    }

    // --- 2. Lấy các phần tử DOM (Như cũ) ---
    const dateEl = document.getElementById('date');
    const timeEl = document.getElementById('time');
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    
    // DOM Cài đặt (Như cũ)
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const notifyButton = document.getElementById('notify-button');
    const notifyTimeNgay = document.getElementById('notify-time-ngay');
    const notifyTimeDem = document.getElementById('notify-time-dem');
    const notifyTimeOff = document.getElementById('notify-time-off');
    
    // DOM Modal Ghi Chú (Như cũ)
    const noteModal = document.getElementById('note-modal');
    const closeNoteModalBtn = document.getElementById('close-note-modal');
    const noteModalTitle = document.getElementById('note-modal-title');
    const modalShiftInfo = document.getElementById('modal-shift-info'); 
    const noteList = document.getElementById('note-list'); // <ul>
    const addNoteForm = document.getElementById('add-note-form'); // <form>
    const newNoteInput = document.getElementById('new-note-input'); // <input>

    let currentEditingDateStr = null;

    // --- 3. Dữ liệu (Như cũ) ---
    let noteData = JSON.parse(localStorage.getItem('myScheduleNotes')) || {};
    let appSettings = JSON.parse(localStorage.getItem('myScheduleSettings')) || {
        notifyTimeNgay: "06:00",
        notifyTimeDem: "20:00",
        notifyTimeOff: "08:00"
    };
    
    let currentViewDate = new Date(); 
    let lastNotificationSentDate = null; 

    // --- CÀI ĐẶT CHU KỲ (Như cũ) ---
    const EPOCH_DAYS = dateToDays('2025-10-26');
    const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];

    // --- Hàm Lưu TKB (Như cũ) ---
    function saveNoteData() {
        const cleanData = {};
        for (const date in noteData) {
            if (Array.isArray(noteData[date]) && noteData[date].length > 0) {
                cleanData[date] = noteData[date];
            }
        }
        localStorage.setItem('myScheduleNotes', JSON.stringify(cleanData));
    }
    
    // --- HÀM MỚI: Lưu Cài đặt (Như cũ) ---
    function saveSettings() {
        localStorage.setItem('myScheduleSettings', JSON.stringify(appSettings));
    }
    
    // --- HÀM TÍNH CA (Như cũ) ---
    function getShiftForDate(dateStr) {
        const currentDays = dateToDays(dateStr);
        const diffDays = currentDays - EPOCH_DAYS;
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
    
    function loadSettings() {
        notifyTimeNgay.value = appSettings.notifyTimeNgay;
        notifyTimeDem.value = appSettings.notifyTimeDem;
        notifyTimeOff.value = appSettings.notifyTimeOff;
    }

    settingsBtn.addEventListener('click', () => {
        loadSettings(); 
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
    
    notifyTimeNgay.addEventListener('change', (e) => {
        appSettings.notifyTimeNgay = e.target.value;
        saveSettings();
    });
    notifyTimeDem.addEventListener('change', (e) => {
        appSettings.notifyTimeDem = e.target.value;
        saveSettings();
    });
    notifyTimeOff.addEventListener('change', (e) => {
        appSettings.notifyTimeOff = e.target.value;
        saveSettings();
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


    // --- 6. LOGIC Vẽ Lịch Tháng (Nền SÁNG - Như cũ) ---
    function renderCalendar(date) {
        calendarBody.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth(); 

        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        
        let firstDayOfWeek = firstDayOfMonth.getDay();
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; 

        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1));

        const todayStr = getLocalDateString(new Date());

        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = "bg-white rounded-lg p-2 min-h-[100px] flex flex-col justify-start relative cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200";

            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const dateStr = getLocalDateString(currentDate);
            const day = currentDate.getDate();
            
            const dayNumberEl = document.createElement('span');
            dayNumberEl.className = 'day-number font-semibold text-lg text-gray-800'; 
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);
            
            dayCell.dataset.date = dateStr; 

            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month', 'bg-gray-50', 'opacity-70', 'cursor-default'); 
                dayCell.classList.remove('hover:bg-gray-50', 'cursor-pointer');
                dayNumberEl.classList.add('text-gray-400'); 
                dayNumberEl.classList.remove('text-gray-800');
            } else {
                
                const shift = getShiftForDate(dateStr);
                const notes = noteData[dateStr] || []; 

                if (shift === 'giãn ca') {
                    dayCell.classList.add('bg-yellow-100'); 
                    dayCell.classList.remove('bg-white');
                } else if (shift === 'off') {
                    dayCell.classList.add('bg-gray-100'); 
                    dayCell.classList.remove('bg-white');
                } else {
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full self-start mt-1';
                    shiftEl.textContent = shift;
                    dayCell.appendChild(shiftEl);
                }
                
                if (notes.length > 0) {
                    const noteListEl = document.createElement('ul');
                    noteListEl.className = 'day-note-list';
                    notes.forEach(noteText => {
                        const noteEl = document.createElement('li');
                        noteEl.className = 'day-note'; 
                        noteEl.textContent = noteText;
                        noteListEl.appendChild(noteEl);
                    });
                    dayCell.appendChild(noteListEl);
                }
                
                if (dateStr === todayStr) {
                    dayCell.classList.add('today', 'border-2', 'border-blue-500'); 
                    dayNumberEl.classList.add('text-blue-600'); 
                    dayNumberEl.classList.remove('text-gray-800');
                }

                dayCell.addEventListener('click', () => {
                    openNoteModal(dateStr);
                });
            }
            
            calendarBody.appendChild(dayCell);
        }
    }

    // --- 7. LOGIC Điều khiển Lịch (Như cũ) ---
    prevMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() - 1);
        renderCalendar(currentViewDate);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentViewDate.setMonth(currentViewDate.getMonth() + 1);
        renderCalendar(currentViewDate);
    });

    // --- 8. LOGIC Xử lý Modal Ghi Chú (Như cũ) ---
    
    function openNoteModal(dateStr) {
        const date = new Date(dateStr + 'T12:00:00'); 
        
        noteModal.style.display = 'flex';
        noteModalTitle.textContent = `Cập nhật (${date.toLocaleDateString('vi-VN')})`;
        
        currentEditingDateStr = dateStr; 
        
        const shift = getShiftForDate(dateStr);
        modalShiftInfo.innerHTML = `Ca tự động: <strong>${shift.toUpperCase()}</strong>`;
        
        renderNoteList(dateStr);
        newNoteInput.value = ''; 
        newNoteInput.focus();
    }
    
    function renderNoteList(dateStr) {
        noteList.innerHTML = ''; 
        const notes = noteData[dateStr] || [];

        if (notes.length === 0) {
            noteList.innerHTML = `<li class="text-gray-400 text-sm italic">Không có ghi chú.</li>`;
            return;
        }

        notes.forEach((noteText, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-gray-700 p-2 rounded';
            li.innerHTML = `
                <span class="text-gray-100">${noteText}</span>
                <div class="flex-shrink-0 ml-2">
                    <button data-index="${index}" class="edit-note text-blue-400 hover:text-blue-300 text-xs font-medium mr-2">Sửa</button>
                    <button data-index="${index}" class="delete-note text-red-400 hover:text-red-300 text-xs font-medium">Xóa</button>
                </div>
            `;
            noteList.appendChild(li);
        });
    }

    closeNoteModalBtn.addEventListener('click', () => {
        noteModal.style.display = 'none';
        currentEditingDateStr = null; 
    });
    noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) {
            noteModal.style.display = 'none';
            currentEditingDateStr = null;
        }
    });

    addNoteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const noteText = newNoteInput.value.trim();
        if (!noteText || !currentEditingDateStr) return;

        if (!Array.isArray(noteData[currentEditingDateStr])) {
            noteData[currentEditingDateStr] = [];
        }
        
        noteData[currentEditingDateStr].push(noteText);
        
        saveNoteData();
        renderNoteList(currentEditingDateStr); 
        renderCalendar(currentViewDate); 
        newNoteInput.value = ''; 
    });

    noteList.addEventListener('click', (e) => {
        const target = e.target;
        const index = target.dataset.index;
        
        if (!currentEditingDateStr || index === undefined) return;

        const notes = noteData[currentEditingDateStr] || [];

        if (target.classList.contains('edit-note')) {
            const oldText = notes[index];
            const newText = prompt("Sửa ghi chú:", oldText);
            
            if (newText !== null && newText.trim() !== "") {
                noteData[currentEditingDateStr][index] = newText.trim();
                saveNoteData();
                renderNoteList(currentEditingDateStr);
                renderCalendar(currentViewDate);
            }
        }
        
        if (target.classList.contains('delete-note')) {
            if (confirm(`Bạn có chắc muốn xóa ghi chú: "${notes[index]}"?`)) {
                noteData[currentEditingDateStr].splice(index, 1);
                saveNoteData();
                renderNoteList(currentEditingDateStr);
                renderCalendar(currentViewDate);
            }
        }
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
            const response = await fetch('/api/calendar-ai-parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });
            
            const updates = await response.json(); 

            if (Array.isArray(updates)) {
                updates.forEach(update => {
                    const dateStr = update.date;
                    const noteText = update.note;

                    if (dateStr && noteText) {
                        if (!Array.isArray(noteData[dateStr])) {
                            noteData[dateStr] = []; 
                        }
                        noteData[dateStr].push(noteText); 
                    }
                });
                
                saveNoteData(); 
                renderCalendar(currentViewDate); 
                aiInput.value = ''; 
            } else {
                throw new Error("AI không trả về định dạng mảng.");
            }

        } catch (err) {
            console.error('Lỗi gọi AI API (Lịch):', err);
            alert('Không thể phân tích. Vui lòng kiểm tra lại prompt và API key.');
        }

        aiInput.disabled = false;
        aiForm.querySelector('button').disabled = false;
        aiForm.querySelector('button').textContent = "Phân tích";
    });
    
    // --- 10. LOGIC MỚI: Kiểm tra Thông báo Ca Hàng Ngày (CẬP NHẬT) ---
    function checkDailyShiftNotification() {
        if (Notification.permission !== "granted") return; // Chưa cho phép

        const now = new Date();
        const todayStr = getLocalDateString(now);
        
        // Chống spam: Nếu đã gửi thông báo hôm nay rồi thì thôi
        if (lastNotificationSentDate === todayStr) return;

        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const todayShift = getShiftForDate(todayStr);
        let shiftDisplayName = ""; // Tên ca hiển thị
        let timeToAlert = ""; // Giờ báo thức

        // 1. Xác định Ca và Giờ báo thức
        if (todayShift === 'ngày') {
            shiftDisplayName = "Ca Ngày";
            timeToAlert = appSettings.notifyTimeNgay;
        } else if (todayShift === 'đêm') {
            shiftDisplayName = "Ca Đêm";
            timeToAlert = appSettings.notifyTimeDem;
        } else if (todayShift === 'giãn ca') {
            shiftDisplayName = "Giãn Ca";
            timeToAlert = appSettings.notifyTimeOff;
        } else if (todayShift === 'off') {
            shiftDisplayName = "Ngày Nghỉ";
            timeToAlert = appSettings.notifyTimeOff;
        }

        // 2. Kiểm tra xem đã đến giờ báo thức chưa
        if (timeToAlert && currentTimeStr === timeToAlert) {
            
            // 3. Lấy ghi chú của ngày hôm nay
            const notes = noteData[todayStr] || [];
            let notesString = "";
            if (notes.length > 0) {
                // Nối các ghi chú lại: " - Ghi chú 1, Ghi chú 2"
                notesString = " - " + notes.join(', ');
            }

            // 4. Tạo Tiêu đề và Nội dung mới
            const newTitle = "Lịch Luân Phiên";
            const newBody = `${shiftDisplayName}${notesString}`; // Ví dụ: "Ca Ngày - Họp, Quang" hoặc "Ca Đêm"

            // 5. Gửi thông báo
            new Notification(newTitle, {
                body: newBody,
                icon: "/calendar/icons/icon-192x192.png" 
            });
            
            // 6. Đánh dấu là đã gửi hôm nay
            lastNotificationSentDate = todayStr;
        }
    }

    // Khởi động
    renderCalendar(currentViewDate);
    updateClock();
    loadSettings(); 
    
    // Chạy kiểm tra thông báo mỗi 60 giây (1 phút)
    setInterval(checkDailyShiftNotification, 60000);
});