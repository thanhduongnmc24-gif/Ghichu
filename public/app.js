/* =================================================================== */
/* FILE: public/app.js                                                 */
/* MỤC ĐÍCH: Logic JavaScript chính cho toàn bộ ứng dụng Ghichu App.     */
/* =================================================================== */

// Import các hàm tiện ích từ utils.js
import {
    convertSolarToLunar,
    getLocalDateString,
    dateToDays,
    getShiftForDate,
    urlBase64ToUint8Array
} from './utils.js';


// ===================================================================
// PHẦN CHÍNH: KHỞI ĐỘNG ỨNG DỤNG
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {

    let swRegistration = null; 
    let vapidPublicKey = null; 

    // --- ĐĂNG KÝ SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(async reg => {
                console.log('Main Service Worker Registered!', reg);
                swRegistration = reg; 
                
                await getVapidPublicKey();
                
                checkNotificationStatus();
            })
            .catch(err => console.error('Main Service Worker registration failed:', err));
    }

    // ===================================================================
    // KHAI BÁO BIẾN (DOM ELEMENTS)
    // ===================================================================
    
    // --- Tin Tức ---
    const newsMain = document.getElementById('news-main');
    const newsGrid = document.getElementById('news-grid');
    const loadingSpinner = document.getElementById('loading-spinner');
    const summaryModal = document.getElementById('summary-modal');
    const closeSummaryModalButton = document.getElementById('close-summary-modal');
    const summaryTitleElement = document.getElementById('summary-title');
    const summaryTextElement = document.getElementById('summary-text');
    const feedNav = document.getElementById('feed-nav');
    
    const rssMenuBtn = document.getElementById('rss-menu-btn'); 
    const rssMobileMenu = document.getElementById('rss-mobile-menu'); 
    const summaryToast = document.getElementById('summary-toast');
    const toastTitle = document.getElementById('toast-title');
    const toastCloseButton = document.getElementById('toast-close-button');
    const toastIcon = document.getElementById('toast-icon');
    const toastMainMessage = document.getElementById('toast-main-message');
    const toastCta = document.getElementById('toast-cta');

    // --- Lịch & Cài đặt ---
    const calendarMain = document.getElementById('calendar-main');
    const settingsMain = document.getElementById('settings-main');
    const cal_aiForm = document.getElementById('ai-form');
    const cal_aiInput = document.getElementById('ai-input');
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const notifyButton = document.getElementById('notify-button');
    const notifyTimeNgay = document.getElementById('notify-time-ngay');
    const notifyTimeDem = document.getElementById('notify-time-dem');
    const notifyTimeOff = document.getElementById('notify-time-off');
    const noteModal = document.getElementById('note-modal');
    const closeNoteModalBtn = document.getElementById('close-note-modal');
    const noteModalTitle = document.getElementById('note-modal-title');
    const modalShiftInfo = document.getElementById('modal-shift-info'); 
    const noteList = document.getElementById('note-list');
    const addNoteForm = document.getElementById('add-note-form');
    const newNoteInput = document.getElementById('new-note-input');
    const toggleSummaryViewBtn = document.getElementById('toggle-summary-view-btn');

    // --- Lưu Trữ Link ---
    const linksMain = document.getElementById('links-main');
    const newLinkForm = document.getElementById('new-link-form');
    const newLinkUrl = document.getElementById('new-link-url');
    const newLinkNote = document.getElementById('new-link-note');
    const linkListContainer = document.getElementById('link-list-container');
    const linkStatusMsg = document.getElementById('link-status-msg');

    // --- Lịch / Nhắc nhở (Sub-tab) ---
    const calendarSubtabHeader = document.getElementById('calendar-subtab-header');
    const calSubtabWork = document.getElementById('cal-subtab-work');
    const calSubtabReminders = document.getElementById('cal-subtab-reminders');
    const calendarWorkContent = document.getElementById('calendar-work-content');
    const calendarRemindersContent = document.getElementById('calendar-reminders-content');

    // --- Nhắc nhở Form ---
    const newReminderForm = document.getElementById('new-reminder-form');
    const newReminderTitle = document.getElementById('new-reminder-title'); 
    const newReminderContent = document.getElementById('new-reminder-content');
    const newReminderStatus = document.getElementById('new-reminder-status');
    const reminderListContainer = document.getElementById('reminder-list-container');
    const reminderListLoading = document.getElementById('reminder-list-loading');
    const reminderWarning = document.getElementById('reminder-warning'); 
    const settingsPushWarning = document.getElementById('settings-push-warning'); 
    
    // --- Modal Edit Nhắc nhở ---
    const reminderEditModal = document.getElementById('reminder-edit-modal');
    const closeReminderEditModalBtn = document.getElementById('close-reminder-edit-modal');
    const editReminderForm = document.getElementById('edit-reminder-form');
    const editReminderId = document.getElementById('edit-reminder-id');
    const editReminderTitle = document.getElementById('edit-reminder-title');
    const editReminderContent = document.getElementById('edit-reminder-content');
    const editReminderDatetime = document.getElementById('edit-reminder-datetime');
    const editReminderActive = document.getElementById('edit-reminder-active');
    const saveReminderBtn = document.getElementById('save-reminder-btn');
    
    // --- Điều khiển Tab ---
    const newsTabBtn = document.getElementById('news-tab-btn');
    const calendarTabBtn = document.getElementById('calendar-tab-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const mobileHeaderTitle = document.getElementById('mobile-header-title');
    
    const refreshFeedButton = document.getElementById('refresh-feed-button');
    const refreshFeedButtonMobile = document.getElementById('refresh-feed-button-mobile'); 
    const bottomTabNews = document.getElementById('bottom-tab-news');
    const bottomTabCalendar = document.getElementById('bottom-tab-calendar');
    const bottomTabLinks = document.getElementById('bottom-tab-links');
    const bottomTabSettings = document.getElementById('bottom-tab-settings');
    const bottomNav = document.getElementById('bottom-nav'); 

    // --- Đồng bộ Online ---
    const syncUsernameInput = document.getElementById('sync-username');
    const syncPasswordInput = document.getElementById('sync-password');
    const syncUpBtn = document.getElementById('sync-up-btn');
    const syncDownBtn = document.getElementById('sync-down-btn');
    const syncStatusMsg = document.getElementById('sync-status-msg');

    // --- Admin ---
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const adminPanel = document.getElementById('admin-panel');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const adminUserListWrapper = document.getElementById('admin-user-list-wrapper');
    const adminUserLoading = document.getElementById('admin-user-loading');
    const adminUserList = document.getElementById('admin-user-list');
    const adminUserListBody = document.getElementById('admin-user-list-body');
    const adminNoteViewerModal = document.getElementById('admin-note-viewer-modal');
    const adminCloseNoteViewer = document.getElementById('admin-close-note-viewer');
    const adminNoteViewerTitle = document.getElementById('admin-note-viewer-title');
    const adminNoteViewerContent = document.getElementById('admin-note-viewer-content');
    
    // --- Biến Trạng thái (State) ---
    let currentCalendarSubTab = 'work'; 
    let summaryViewMode = 'byDate'; 
    let currentAdminCreds = null; 
    let currentEditingDateStr = null; 
    let currentViewDate = new Date(); 
    let summaryEventSource = null; 
    let completedSummary = { title: '', text: '' }; 
    let toastTimeoutId = null; 
    const clientRssCache = new Map(); 
    
    // --- Xử lý dữ liệu LocalStorage ---
    function normalizeAppData(data) {
        if (!data) {
            return { calendar: {}, links: [] };
        }
        if (data.calendar || data.links) {
            return {
                calendar: data.calendar || {},
                links: data.links || []
            };
        }
        return {
            calendar: data, 
            links: []       
        };
    }

    const rawData = JSON.parse(localStorage.getItem('myAppData')) || {}; 
    let appData = normalizeAppData(rawData); 
    
    let appSettings = JSON.parse(localStorage.getItem('myScheduleSettings')) || {
        notifyTimeNgay: "06:00",
        notifyTimeDem: "20:00",
        notifyTimeOff: "08:00"
    };

    // ===================================================================
    // PHẦN 1: LOGIC TIN TỨC
    // ===================================================================
    
    const iconSpinner = `<div class="spinner border-t-white" style="width: 24px; height: 24px;"></div>`;
    const iconCheck = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    const iconError = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    function callGeminiAPIStreaming(prompt, title) {
        if (summaryEventSource) {
            summaryEventSource.close(); 
        }
        let currentSummaryText = '';
        const encodedPrompt = encodeURIComponent(prompt);
        const streamUrl = `/summarize-stream?prompt=${encodedPrompt}`;
        
        summaryEventSource = new EventSource(streamUrl);
        
        summaryEventSource.onopen = () => console.log("Kết nối stream tóm tắt thành công!");
        
        summaryEventSource.onerror = (error) => {
            console.error("Lỗi kết nối EventSource:", error);
            showToast("Lỗi tóm tắt", "Không thể kết nối server.", 'error', null, 5000); 
            if (summaryEventSource) summaryEventSource.close();
            summaryEventSource = null;
        };
        
        summaryEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.text) {
                    currentSummaryText += data.text;
                } else if (data.error) {
                    console.error("Lỗi từ stream:", data.error);
                    currentSummaryText += `\n\n[Lỗi: ${data.error}]`;
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    showToast("Lỗi tóm tắt", data.error, 'error', null, 5000);
                } else if (data.done) {
                    console.log("Stream tóm tắt hoàn thành.");
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    completedSummary = { title: title, text: currentSummaryText };
                    showSummaryReadyNotification(title);
                }
            } catch (e) {
                console.error("Lỗi phân tích dữ liệu stream:", e, event.data);
                if (summaryEventSource) summaryEventSource.close();
                summaryEventSource = null;
                showToast("Lỗi tóm tắt", "Dữ liệu trả về không hợp lệ.", 'error', null, 5000);
            }
        };
    }

    /**
     * Tải RSS với Timestamp để tránh Cache
     */
    async function fetchRSS(rssUrl, sourceName, { display = true, force = false } = {}) {
        if (display) {
            loadingSpinner.classList.remove('hidden');
            newsGrid.innerHTML = '';
        }
        
        if (force) {
            clientRssCache.delete(rssUrl);
            console.log(`[CACHE] Đã xóa ${rssUrl} do yêu cầu Tải lại.`);
        }
        
        if (clientRssCache.has(rssUrl)) {
            if (display) {
                displayArticles(clientRssCache.get(rssUrl), sourceName);
                loadingSpinner.classList.add('hidden');
            }
            return;
        }
        
        try {
            // THÊM TIMESTAMP ĐỂ TRÁNH CACHE
            const timestamp = new Date().getTime();
            const response = await fetch(`/get-rss?url=${encodeURIComponent(rssUrl)}&t=${timestamp}`);
            
            if (!response.ok) throw new Error('Lỗi server (RSS)');
            
            const str = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(str, "text/xml");
            
            if (xmlDoc.getElementsByTagName("parsererror").length) throw new Error("Lỗi phân tích XML");
            
            let items;
            const itemNodes = xmlDoc.querySelectorAll("item");
            if (itemNodes.length === 0) {
                const entryNodes = xmlDoc.querySelectorAll("entry");
                if (entryNodes.length > 0) items = Array.from(entryNodes);
                else throw new Error("Không tìm thấy bài viết");
            } else {
                 items = Array.from(itemNodes);
            }
            
            clientRssCache.set(rssUrl, items);
            
            if (display) displayArticles(items, sourceName);
        } catch (error) {
            console.error(`Lỗi tải RSS ${sourceName}:`, error);
            if (display) newsGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">${error.message}</p>`;
        } finally {
            // LUÔN TẮT SPINNER
            if (display) loadingSpinner.classList.add('hidden');
        }
    }

    function displayArticles(items, sourceName) {
        newsGrid.innerHTML = '';
        items.forEach(item => {
            const title = item.querySelector("title")?.textContent || "Không có tiêu đề";
            let description = item.querySelector("description")?.textContent || item.querySelector("summary")?.textContent || item.querySelector("content")?.textContent || "";
            let link = item.querySelector("link")?.textContent || "#";
            if (link === "#" && item.querySelector("link")?.hasAttribute("href")) {
                link = item.querySelector("link")?.getAttribute("href") || "#"; 
            }
            const pubDate = item.querySelector("pubDate")?.textContent || item.querySelector("updated")?.textContent || "";
            
            const descParser = new DOMParser();
            const descDoc = descParser.parseFromString(`<!doctype html><body>${description}`, 'text/html');
            const img = descDoc.querySelector("img");
            const imgSrc = img ? img.src : "https://placehold.co/600x400/374151/9CA3AF?text=Tin+Tuc";
            let descriptionText = descDoc.body.textContent.trim() || "Không có mô tả.";
            
            if (descriptionText.startsWith(title)) {
                descriptionText = descriptionText.substring(title.length).trim();
            }
            
            const card = document.createElement('a');
            card.href = link;
            card.className = "bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 transform hover:scale-[1.03] hover:shadow-blue-500/20 block";
            
            const imgEl = document.createElement('img');
            imgEl.src = imgSrc;
            imgEl.alt = title; 
            imgEl.className = "w-full h-48 object-cover";
            imgEl.onerror = function() { this.src='https://placehold.co/600x400/374151/9CA3AF?text=Error'; };
            card.appendChild(imgEl);

            const contentDiv = document.createElement('div');
            contentDiv.className = "p-5";

            const sourceSpan = document.createElement('span');
            sourceSpan.className = "text-xs font-semibold text-blue-400";
            sourceSpan.textContent = sourceName; 
            contentDiv.appendChild(sourceSpan);

            const titleH3 = document.createElement('h3');
            titleH3.className = "text-lg font-bold text-white mt-2 mb-1 leading-tight line-clamp-2";
            titleH3.textContent = title; 
            contentDiv.appendChild(titleH3);

            const descP = document.createElement('p');
            descP.className = "text-sm text-gray-400 mt-2 mb-3 line-clamp-3";
            descP.textContent = descriptionText; 
            contentDiv.appendChild(descP);

            const footerDiv = document.createElement('div');
            footerDiv.className = "flex justify-between items-center mt-4";
            
            const dateP = document.createElement('p');
            dateP.className = "text-sm text-gray-400";
            dateP.textContent = pubDate ? new Date(pubDate).toLocaleString('vi-VN') : '';
            footerDiv.appendChild(dateP);

            const summaryButton = document.createElement('button');
            summaryButton.className = "summary-btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-3 rounded-full transition-all duration-200 z-10 relative";
            summaryButton.textContent = "Tóm tắt";
            footerDiv.appendChild(summaryButton);
            
            contentDiv.appendChild(footerDiv);
            card.appendChild(contentDiv);

             card.addEventListener('click', (e) => {
                 if (e.target.closest('.summary-btn')) {
                     return; 
                 }
             });
            
            summaryButton.addEventListener('click', (e) => {
                e.preventDefault(); 
                e.stopPropagation(); 
                handleSummaryClick(title, descriptionText);
            });
            
            newsGrid.appendChild(card);
        });
    }

    function handleFeedButtonClick(e) {
         const clickedButton = e.target.closest('.feed-button');
         if (!clickedButton || clickedButton.classList.contains('active')) return;
         
         const rssUrl = clickedButton.dataset.rss;
         const sourceName = clickedButton.dataset.source;
         
         document.querySelectorAll('#feed-nav .feed-button, #rss-mobile-menu .feed-button').forEach(btn => btn.classList.remove('active'));
         document.querySelectorAll(`.feed-button[data-rss="${rssUrl}"]`).forEach(btn => btn.classList.add('active'));
         
         window.scrollTo({ top: 0, behavior: 'smooth' });
         fetchRSS(rssUrl, sourceName);
         
         rssMobileMenu.classList.add('hidden'); 
    }

    function handleSummaryClick(title, description) {
        if (!description || description === "Không có mô tả.") {
             showToast("Không thể tóm tắt", "Bài viết không có đủ nội dung.", 'error', null, 4000);
            return;
        }
        
        const prompt = `Tóm tắt nội dung sau đây trong khoảng 200 từ:
        Tiêu đề: ${title}
        Nội dung: ${description}`;
        
        callGeminiAPIStreaming(prompt, title);
        
        showToast("Đang tóm tắt...", title.substring(0, 50) + "...", 'loading', null, 5000);
    }

     function showToast(mainMessage, detailMessage, state = 'ready', onClickAction, autoHideDelay = null) {
         if (toastTimeoutId) clearTimeout(toastTimeoutId); 
         
         toastMainMessage.textContent = mainMessage;
         toastTitle.textContent = detailMessage;
         
         summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
         summaryToast.onclick = null; 
         
         if (state === 'loading') {
             toastIcon.innerHTML = iconSpinner;
             summaryToast.classList.add('toast-loading'); 
             summaryToast.style.cursor = 'default';
             toastCta.style.display = 'none'; 
         } else if (state === 'ready') {
             toastIcon.innerHTML = iconCheck;
             summaryToast.classList.add('bg-blue-600'); 
             summaryToast.style.cursor = 'pointer';
             toastCta.style.display = 'block'; 
             summaryToast.onclick = onClickAction; 
         } else if (state === 'error') {
             toastIcon.innerHTML = iconError;
             summaryToast.classList.add('bg-red-600'); 
             summaryToast.style.cursor = 'default';
             toastCta.style.display = 'none';
         }
         
         summaryToast.classList.remove('hidden');
         setTimeout(() => summaryToast.classList.add('show'), 50); 
         
         if (autoHideDelay) {
             toastTimeoutId = setTimeout(hideToast, autoHideDelay);
         }
     }

     function hideToast() {
          if (toastTimeoutId) clearTimeout(toastTimeoutId);
          toastTimeoutId = null;
          
          summaryToast.classList.remove('show');
          setTimeout(() => {
              summaryToast.classList.add('hidden');
              summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
          }, 300); 
          summaryToast.onclick = null;
     }

     function showSummaryReadyNotification(title) {
          showToast(
              "Tóm tắt đã sẵn sàng!",
              title.substring(0, 50) + "...",
              'ready', 
              () => { 
                  summaryTitleElement.textContent = completedSummary.title;
                  summaryTextElement.textContent = completedSummary.text;
                  summaryModal.classList.remove('hidden');
                  hideToast(); 
              },
              null 
          );
     }

    function prewarmCache() {
        console.log("[Cache-Warmer] Bắt đầu tải nền các feed khác...");
        const feedsToPrewarm = Array.from(feedNav.querySelectorAll('.feed-button:not(.active)'));
        feedsToPrewarm.forEach(feed => {
            fetchRSS(feed.dataset.rss, feed.dataset.source, { display: false }); 
        });
    }
    
    
    // ===================================================================
    // PHẦN 2: LOGIC LỊCH
    // ===================================================================

    function showSyncStatus(message, isError = false) {
        if (!syncStatusMsg) return;
        syncStatusMsg.textContent = message;
        syncStatusMsg.className = isError 
            ? 'text-sm text-red-400 mt-3 text-center' 
            : 'text-sm text-green-400 mt-3 text-center';
        syncStatusMsg.classList.remove('hidden');

        setTimeout(() => {
            if (syncStatusMsg.textContent === message) { 
                syncStatusMsg.classList.add('hidden');
            }
        }, 5000);
    }

    function saveAppData() { 
        const cleanData = {};
        for (const date in appData.calendar) { 
            if (Array.isArray(appData.calendar[date]) && appData.calendar[date].length > 0) {
                cleanData[date] = appData.calendar[date];
            }
        }
        appData.calendar = cleanData; 
        
        if (!Array.isArray(appData.links)) {
            appData.links = [];
        }

        localStorage.setItem('myAppData', JSON.stringify(appData)); 
        
        syncAppDataToServer().catch(err => console.error('Lỗi đồng bộ ghi chú:', err)); 
    }

    function saveSettings() {
        localStorage.setItem('myScheduleSettings', JSON.stringify(appSettings));
        updateSubscriptionSettings(); 
    }

    function loadSettings() {
        notifyTimeNgay.value = appSettings.notifyTimeNgay;
        notifyTimeDem.value = appSettings.notifyTimeDem;
        notifyTimeOff.value = appSettings.notifyTimeOff;
    }

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
            dayCell.className = "bg-white rounded-lg p-1 sm:p-2 min-h-[80px] sm:min-h-[100px] flex flex-col justify-start relative cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200";
            
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateStr = getLocalDateString(currentDate); 
            const day = currentDate.getDate();
            
            const dayWrapper = document.createElement('div');
            dayWrapper.className = "flex justify-between items-baseline flex-nowrap gap-1"; 
            
            const dayNumberEl = document.createElement('span'); 
            dayNumberEl.className = 'day-number font-semibold text-sm sm:text-lg text-gray-800'; 
            dayNumberEl.textContent = day;
            dayWrapper.appendChild(dayNumberEl); 

            const lunarDate = convertSolarToLunar(day, currentDate.getMonth() + 1, currentDate.getFullYear());
            const lunarDayEl = document.createElement('span'); 
            lunarDayEl.className = "day-lunar-date text-gray-500 flex-shrink-0";
            
            let lunarText;
            if (lunarDate.day === 1) { 
                lunarText = `${lunarDate.day}/${lunarDate.month}`; 
                lunarDayEl.classList.add("font-bold", "text-red-600"); 
            } else {
                lunarText = lunarDate.day;
            }
            if (lunarDate.isLeap) {
                lunarText += "N"; 
            }
            lunarDayEl.textContent = lunarText;
            dayWrapper.appendChild(lunarDayEl); 
            dayCell.appendChild(dayWrapper); 
            
            dayCell.dataset.date = dateStr; 

            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month', 'bg-gray-50', 'opacity-70', 'cursor-default'); 
                dayCell.classList.remove('hover:bg-gray-50', 'cursor-pointer');
                dayNumberEl.classList.add('text-gray-400'); 
                dayNumberEl.classList.remove('text-gray-800');
                lunarDayEl.className = "day-lunar-date text-gray-400 flex-shrink-0";
            } else {
                const shift = getShiftForDate(dateStr);
                const notes = appData.calendar[dateStr] || []; 

                if (shift === 'giãn ca') {
                    dayCell.classList.add('bg-yellow-100'); 
                    dayCell.classList.remove('bg-white');
                } else if (shift === 'off') { 
                    dayCell.classList.add('bg-gray-100'); 
                    dayCell.classList.remove('bg-white');
                } else {
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift text-xs font-bold text-blue-700 bg-blue-100 px-1 sm:px-2 py-0.5 rounded-full self-start mt-1';
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
                    dayCell.classList.remove('bg-white', 'bg-yellow-100', 'bg-gray-100');
                    dayCell.classList.add('today', 'bg-blue-100', 'border-2', 'border-blue-500'); 
                    dayNumberEl.classList.add('text-blue-700', 'font-bold'); 
                    dayNumberEl.classList.remove('text-gray-800'); 
                } else if (lunarDate.day === 1) {
                    lunarDayEl.classList.add("text-red-500");
                    lunarDayEl.classList.remove("text-red-600");
                }

                dayCell.addEventListener('click', () => {
                    openNoteModal(dateStr);
                });
            }
            calendarBody.appendChild(dayCell);
        }
        
        renderMonthlyNoteSummary(date); 
    }

    function renderMonthlyNoteSummary(date) {
        if (summaryViewMode === 'byNote') {
            renderSummaryByNote(date);
        } else {
            renderSummaryByDate(date);
        }
    }

    function renderSummaryByDate(date) {
        const monthlyNoteList = document.getElementById('monthly-note-list');
        if (!monthlyNoteList) return; 

        monthlyNoteList.innerHTML = ''; 
        
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        
        const daysWithNotes = []; 
        
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dateStr = getLocalDateString(currentDate); 
            const notes = appData.calendar[dateStr] || []; 

            if (notes.length > 0) {
                const dayName = daysOfWeek[currentDate.getDay()]; 
                const dateDisplay = `${currentDate.getDate()}/${currentDate.getMonth() + 1}`; 
                const shift = getShiftForDate(dateStr); 
                let shiftDisplay = shift; 
                if (shift === 'ngày' || shift === 'đêm') {
                    shiftDisplay = `ca ${shift}`; 
                }
                const datePrefix = `${dayName} ngày ${dateDisplay} (${shiftDisplay}): `;
                daysWithNotes.push({ 
                    datePrefix: datePrefix, 
                    notes: notes 
                });
            }
        }

        if (daysWithNotes.length === 0) {
            monthlyNoteList.style.display = 'block';
            monthlyNoteList.className = ''; 
            monthlyNoteList.style.gridTemplateColumns = '';
            monthlyNoteList.innerHTML = `<p class="text-gray-400 italic">Không có ghi chú nào cho tháng này.</p>`;
        } else {
            monthlyNoteList.style.display = 'grid'; 
            monthlyNoteList.className = 'grid gap-2'; 
            monthlyNoteList.style.gridTemplateColumns = 'auto 1fr'; 

            daysWithNotes.forEach(dayData => {
                const prefixWrapper = document.createElement('div');
                prefixWrapper.className = 'bg-slate-700 rounded-md text-gray-200 text-sm p-2 whitespace-nowrap';
                prefixWrapper.textContent = dayData.datePrefix;
                
                const contentWrapper = document.createElement('div');
               contentWrapper.className = 'bg-slate-700 rounded-md text-sm text-gray-200 divide-y divide-slate-600';
                
                dayData.notes.forEach(noteText => {
                    const noteEl = document.createElement('p');
                    noteEl.className = 'p-2'; 
                    noteEl.textContent = noteText;
                    contentWrapper.appendChild(noteEl);
                });

                monthlyNoteList.appendChild(prefixWrapper);
                monthlyNoteList.appendChild(contentWrapper);
            });
        }
    }

    function renderSummaryByNote(date) {
        const monthlyNoteList = document.getElementById('monthly-note-list');
        if (!monthlyNoteList) return; 

        monthlyNoteList.innerHTML = ''; 
        
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const noteAggregation = new Map();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = getLocalDateString(new Date(year, month, day)); 
            const notes = appData.calendar[dateStr] || []; 

            notes.forEach(noteText => {
                const normalizedNote = noteText.trim();
                
                if (!noteAggregation.has(normalizedNote)) {
                    noteAggregation.set(normalizedNote, []); 
                }
                noteAggregation.get(normalizedNote).push(day);
            });
        }

        const sortedEntries = Array.from(noteAggregation.entries()).sort((a, b) => 
            a[0].localeCompare(b[0], 'vi', { sensitivity: 'base' })
        );

        if (sortedEntries.length === 0) {
            monthlyNoteList.style.display = 'block';
            monthlyNoteList.className = ''; 
            monthlyNoteList.style.gridTemplateColumns = '';
            monthlyNoteList.innerHTML = `<p class="text-gray-400 italic">Không có ghi chú nào cho tháng này.</p>`;
        } else {
            monthlyNoteList.style.display = 'grid'; 
            monthlyNoteList.className = 'grid gap-2'; 
            monthlyNoteList.style.gridTemplateColumns = 'auto 1fr'; 

            sortedEntries.forEach(([noteText, dayList]) => {
                const prefixWrapper = document.createElement('div');
                prefixWrapper.className = 'bg-slate-700 rounded-md text-gray-200 text-sm p-2 whitespace-nowrap';
                prefixWrapper.textContent = `${noteText}:`; 
                
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'bg-slate-700 rounded-md text-sm text-gray-200 p-2';
                contentWrapper.textContent = dayList.join(', ');

                monthlyNoteList.appendChild(prefixWrapper);
                monthlyNoteList.appendChild(contentWrapper);
            });
        }
    }

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
        const notes = appData.calendar[dateStr] || []; 
        
        if (notes.length === 0) {
            noteList.innerHTML = `<li class="text-gray-400 text-sm italic">Không có ghi chú.</li>`;
            return;
        }
        
        notes.forEach((noteText, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-gray-700 p-2 rounded';
            
            const span = document.createElement('span');
            span.className = 'text-gray-100';
            span.textContent = noteText; 
            li.appendChild(span);

            const divButtons = document.createElement('div');
            divButtons.className = 'flex-shrink-0 ml-2';
            divButtons.innerHTML = `
                <button data-index="${index}" class="edit-note text-blue-400 hover:text-blue-300 text-xs font-medium mr-2">Sửa</button>
                <button data-index="${index}" class="delete-note text-red-400 hover:text-red-300 text-xs font-medium">Xóa</button>
            `;
            li.appendChild(divButtons);
            
            noteList.appendChild(li);
        });
    }

    async function getVapidPublicKey() {
        try {
            const response = await fetch('/vapid-public-key');
            vapidPublicKey = await response.text();
            console.log("Đã lấy VAPID Public Key.");
        } catch (err) {
            console.error("Lỗi khi lấy VAPID Public Key:", err);
        }
    }

    async function getEndpoint() {
        if (!swRegistration || !swRegistration.pushManager) {
            console.warn("getEndpoint: PushManager không sẵn sàng.");
            return null;
        }
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            return subscription ? subscription.endpoint : null;
        } catch (err) {
            console.error("Lỗi khi lấy endpoint:", err);
            return null;
        }
    }
    
    async function checkNotificationStatus() {
        if (!swRegistration || !swRegistration.pushManager) {
            console.warn("PushManager không được hỗ trợ hoặc chưa sẵn sàng.");
            return; 
        }
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            console.log("Người dùng đã đăng ký.");
            notifyButton.textContent = "Tắt Thông Báo";
            notifyButton.classList.add('subscribed'); 
            
            if (reminderWarning) reminderWarning.classList.add('hidden');
            if (settingsPushWarning) settingsPushWarning.classList.add('hidden');
            
        } else {
            console.log("Người dùng chưa đăng ký.");
            notifyButton.textContent = "Bật Thông Báo";
            notifyButton.classList.remove('subscribed'); 
            
            if (reminderWarning) reminderWarning.classList.remove('hidden');
            if (settingsPushWarning) settingsPushWarning.classList.remove('hidden');
        }
    }

    async function handleSubscribeClick() {
        if (!swRegistration || !swRegistration.pushManager || !vapidPublicKey) {
            alert("Service Worker, PushManager, hoặc VAPID Key chưa sẵn sàng. Vui lòng thử lại.");
            return;
        }
        
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        notifyButton.disabled = true; 

        if (existingSubscription) {
            console.log("Đang hủy đăng ký...");
            try {
                const unsubscribed = await existingSubscription.unsubscribe();
                if (unsubscribed) {
                    await fetch('/unsubscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: existingSubscription.endpoint })
                    });
                    console.log("Đã hủy đăng ký thành công.");
                    alert("Đã tắt thông báo.");
                }
            } catch (err) {
                console.error("Lỗi khi hủy đăng ký:", err);
                alert("Lỗi khi tắt thông báo.");
            }
        } else {
            console.log("Đang đăng ký mới...");
            
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert("Đại ca đã từ chối quyền thông báo. Vui lòng bật thủ công trong cài đặt trình duyệt.");
                notifyButton.disabled = false;
                return;
            }

            try {
                const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
                const subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                
                const settings = {
                    notifyTimeNgay: notifyTimeNgay.value,
                    notifyTimeDem: notifyTimeDem.value,
                    notifyTimeOff: notifyTimeOff.value
                };
                
                const noteData = appData; 
                
                await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        subscription: subscription, 
                        settings: settings,
                        noteData: noteData 
                    })
                });
                
                console.log("Đã đăng ký và gửi (cả ghi chú và links) lên server.");
                alert("Đã bật thông báo thành công!");

            } catch (err) {
                console.error("Lỗi khi đăng ký push:", err);
                alert("Lỗi khi bật thông báo. Key hoặc Service Worker có vấn đề.");
            }
        }
        
        notifyButton.disabled = false; 
        checkNotificationStatus(); 
    }

    async function updateSubscriptionSettings() {
        if (!swRegistration || !swRegistration.pushManager) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (!subscription) {
            console.log("Chưa đăng ký, không cần cập nhật settings.");
            return;
        }
        
        console.log("Đang cập nhật settings (giờ) lên server...");
        try {
            const settings = {
                notifyTimeNgay: notifyTimeNgay.value,
                notifyTimeDem: notifyTimeDem.value,
                notifyTimeOff: notifyTimeOff.value
            };

            const noteData = appData; 
            
            await fetch('/subscribe', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscription: subscription, 
                    settings: settings,
                    noteData: noteData 
                })
            });
            console.log("Đã cập nhật settings (và appData) trên server.");
        } catch (err) {
            console.error("Lỗi khi cập nhật settings:", err);
        }
    }

    async function syncAppDataToServer() { 
        if (!swRegistration || !swRegistration.pushManager) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (!subscription) {
            return; 
        }
        
        console.log("Đang đồng bộ appData (vì có thay đổi) lên server...");
        try {
            const noteData = appData; 
            
            await fetch('/update-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    endpoint: subscription.endpoint, 
                    noteData: noteData 
                })
            });
            console.log("Đồng bộ appData (cho Push) thành công.");
        } catch (err) {
            console.error("Lỗi khi đồng bộ appData (cho Push):", err);
        }
    }


    // ===================================================================
    // PHẦN 2.5: LOGIC NHẮC NHỞ
    // ===================================================================

    function formatISODateForInput(isoString) {
        if (!isoString) return "";
        
        const date = new Date(isoString); 
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    async function fetchReminders() {
        if (!reminderListContainer) return;
        
        reminderListLoading.textContent = "Đang tải...";
        reminderListLoading.classList.remove('hidden');
        reminderListContainer.innerHTML = ''; 

        try {
            if (!swRegistration || !swRegistration.pushManager) { 
                throw new Error("Service Worker hoặc PushManager chưa sẵn sàng.");
            }
            const subscription = await swRegistration.pushManager.getSubscription();
            
            if (!subscription) {
                reminderListLoading.classList.add('hidden');
                if (newReminderForm) newReminderForm.querySelector('button[type="submit"]').disabled = true;
                return; 
            }
            
            if (newReminderForm) newReminderForm.querySelector('button[type="submit"]').disabled = false;
            
            const response = await fetch('/api/get-reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            const reminders = await response.json();
            if (!response.ok) throw new Error(reminders.error || "Lỗi tải danh sách");

            const grouped = groupRemindersByMonth(reminders);
            
            renderReminderList(grouped);

        } catch (err) {
            reminderListLoading.textContent = `Lỗi: ${err.message}`;
            reminderListLoading.classList.remove('hidden'); 
        }
    }

    function groupRemindersByMonth(reminders) {
        const groups = {
            "null": [] 
        }; 

        reminders.forEach(item => {
            if (item.remind_at) {
                const date = new Date(item.remind_at); 
                
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                
                if (!groups[monthKey]) {
                    groups[monthKey] = [];
                }
                groups[monthKey].push(item);
            } else {
                groups["null"].push(item);
            }
        });
        
        return groups;
    }

    function renderReminderList(groupedReminders) {
        if (!reminderListContainer) return;
        
        reminderListContainer.innerHTML = ''; 

        const monthKeys = Object.keys(groupedReminders);
        
        const sortedMonthKeys = monthKeys.sort((a, b) => {
            if (a === "null") return 1; 
            if (b === "null") return -1; 
            return a.localeCompare(b); 
        });
        
        if (sortedMonthKeys.length === 0 || (sortedMonthKeys.length === 1 && sortedMonthKeys[0] === "null" && groupedReminders["null"].length === 0)) {
            reminderListLoading.textContent = "Không có nhắc nhở nào. Hãy thêm một cái mới!";
            reminderListLoading.classList.remove('hidden');
            return;
        }
        
        reminderListLoading.classList.add('hidden'); 

        sortedMonthKeys.forEach(monthKey => { 
            const items = groupedReminders[monthKey];
            
            if (items.length === 0) return;

            items.sort((a, b) => {
                if (!a.remind_at) return 1; 
                if (!b.remind_at) return -1; 
                return new Date(a.remind_at) - new Date(b.remind_at);
            });
            
            const monthGroup = document.createElement('div');
            monthGroup.className = 'reminder-month-group bg-gray-800 rounded-lg shadow-lg';
            
            let headerTitle = "";
            if (monthKey === "null") {
                headerTitle = "Chưa sắp xếp";
            } else {
                const [year, month] = monthKey.split('-');
                headerTitle = `Tháng ${month}, ${year}`;
            }
            
            const headerDiv = document.createElement('div');
            headerDiv.className = "flex justify-between items-center p-4 border-b border-gray-700";
            const h3 = document.createElement('h3');
            h3.className = "text-lg font-semibold text-white";
            h3.textContent = headerTitle;
            headerDiv.appendChild(h3);
            monthGroup.appendChild(headerDiv);
            
            const listElement = document.createElement('ul');
            listElement.className = "reminder-list p-4 space-y-3";
            monthGroup.appendChild(listElement);
            
            items.forEach(item => {
                const li = document.createElement('li');
                
                li.className = "reminder-item flex flex-col space-y-2";
                
                li.dataset.id = item.id;
                li.dataset.title = item.title;
                li.dataset.content = item.content || ''; 
                const dateTimeValue = formatISODateForInput(item.remind_at);
                li.dataset.datetime = dateTimeValue;
                li.dataset.active = item.is_active;

                const textClass = item.is_active ? "text-white" : "text-gray-400";
                
                let contentPreview = item.content || '';
                if (contentPreview.length > 50) {
                    contentPreview = contentPreview.substring(0, 50) + '...';
                }

                const divContent = document.createElement('div');
                divContent.className = "reminder-content-clickable bg-gray-700 p-3 rounded-lg cursor-pointer flex-grow overflow-hidden min-w-0";
                
                const spanTitle = document.createElement('span');
                spanTitle.className = `reminder-title ${textClass} font-semibold block truncate`;
                spanTitle.textContent = item.title; 
                divContent.appendChild(spanTitle);
                
                const spanPreview = document.createElement('span');
                spanPreview.className = "reminder-preview text-gray-400 text-sm block truncate";
                spanPreview.textContent = contentPreview || '(Không có nội dung)'; 
                divContent.appendChild(spanPreview);
                
                li.appendChild(divContent);

                const divControls = document.createElement('div');
                divControls.className = "reminder-controls flex items-center justify-between space-x-2 bg-gray-700 p-2 rounded-lg";
                
                divControls.innerHTML = `
                    <input type="datetime-local" 
                           class="reminder-datetime-input flex-grow" 
                           value="${dateTimeValue}" 
                           style="max-width: none;"> <label class="ios-toggle flex-shrink-0">
                        <input type="checkbox" class="reminder-toggle-check" ${item.is_active ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>

                    <button class="reminder-delete-btn text-gray-400 hover:text-red-400 p-1 flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                `;
                li.appendChild(divControls);
                
                listElement.appendChild(li);
            });
            
            reminderListContainer.appendChild(monthGroup);
        });
    }


    function showReminderStatus(message, isError = false) {
        if (!newReminderStatus) return;
        newReminderStatus.textContent = message;
        newReminderStatus.className = isError 
            ? 'text-sm text-red-400 mt-3 text-center' 
            : 'text-sm text-green-400 mt-3 text-center';
        newReminderStatus.classList.remove('hidden');

        setTimeout(() => {
            if (newReminderStatus.textContent === message) {
                newReminderStatus.classList.add('hidden');
            }
        }, 4000);
    }
    
    async function updateReminder(id, data) {
        if (!swRegistration || !swRegistration.pushManager) {
            alert("Lỗi PushManager. Không thể cập nhật.");
            return false; 
        }
        const subscription = await swRegistration.pushManager.getSubscription();
        if (!subscription) {
            alert("Không thể xác thực. Vui lòng Bật Thông Báo.");
            return false; 
        }

        const payload = {
            id: id,
            endpoint: subscription.endpoint,
        };

        if (data.datetimeLocalString !== undefined) {
            payload.datetime = (data.datetimeLocalString && data.datetimeLocalString !== "") 
                ? new Date(data.datetimeLocalString).toISOString() 
                : null;
        }
        if (data.isActive !== undefined) {
            payload.isActive = data.isActive;
        }
        if (data.title !== undefined) {
            payload.title = data.title;
        }
        if (data.content !== undefined) {
            payload.content = data.content;
        }

        try {
            const response = await fetch('/api/update-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            console.log("Đã cập nhật nhắc nhở:", id);
            return true; 
            
        } catch (err) {
            alert(`Lỗi khi cập nhật: ${err.message}`);
            return false; 
        }
    }


    // ===================================================================
    // PHẦN 2.6: LOGIC LƯU TRỮ LINKS
    // ===================================================================

    function showLinkStatus(message, isError = false) {
        if (!linkStatusMsg) return;
        linkStatusMsg.textContent = message;
        linkStatusMsg.className = isError 
            ? 'text-sm text-red-400 mt-3 text-center' 
            : 'text-sm text-green-400 mt-3 text-center';
        linkStatusMsg.classList.remove('hidden');

        setTimeout(() => {
            if (linkStatusMsg.textContent === message) {
                linkStatusMsg.classList.add('hidden');
            }
        }, 4000);
    }
    
    function renderLinkList() {
        if (!linkListContainer) return;
        
        const links = appData.links || [];
        
        if (links.length === 0) {
            linkListContainer.innerHTML = `<p class="text-gray-400 italic text-center p-4 bg-gray-800 rounded-lg shadow-lg">Chưa có link nào được lưu.</p>`;
            return;
        }
        
        linkListContainer.innerHTML = ''; 
        
        [...links].reverse().forEach((link, index) => {
            const originalIndex = links.length - 1 - index; 
            
            const li = document.createElement('div');
            li.className = "bg-gray-800 rounded-lg shadow-lg p-4 flex items-center justify-between space-x-3";
            
            const divContent = document.createElement('div');
            divContent.className = "flex-grow min-w-0";
            
            const aLink = document.createElement('a');
            
            let safeUrl = link.url;
            if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://') && !safeUrl.startsWith('mailto:') && !safeUrl.startsWith('tel:')) {
                safeUrl = `https://${safeUrl}`; 
            }
            if (safeUrl.toLowerCase().startsWith('javascript:')) { 
                safeUrl = '#'; 
            }
            
            aLink.href = safeUrl;
            aLink.target = "_blank";
            aLink.rel = "noopener noreferrer";
            aLink.className = "block text-blue-400 font-semibold truncate hover:underline";
            aLink.textContent = link.url; 
            divContent.appendChild(aLink);
            
            const pNote = document.createElement('p');
            pNote.className = "text-gray-300 text-sm mt-1 truncate";
            pNote.textContent = link.note || '(Không có ghi chú)'; 
            divContent.appendChild(pNote);
            
            li.appendChild(divContent);

            const divButton = document.createElement('div');
            divButton.className = "flex-shrink-0";
            divButton.innerHTML = `
                <button data-index="${originalIndex}" class="delete-link text-gray-400 hover:text-red-400 p-1">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            li.appendChild(divButton);
            
            linkListContainer.appendChild(li);
        });
    }


    // ===================================================================
    // PHẦN 3: LOGIC ADMIN
    // ===================================================================
    
    async function loadAdminPanel() {
        if (!currentAdminCreds) return;
        
        document.querySelector('#settings-main fieldset:nth-of-type(1)').classList.add('hidden'); 
        document.querySelector('#settings-main fieldset:nth-of-type(2)').classList.add('hidden'); 
        
        adminPanel.classList.remove('hidden');
        adminUserList.classList.add('hidden');
        adminUserLoading.classList.remove('hidden');
        
        try {
            const response = await fetch('/api/admin/get-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentAdminCreds) 
            });
            
            const users = await response.json();
            if (!response.ok) throw new Error(users.error || 'Lỗi không xác định');

            adminUserListBody.innerHTML = '';
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = user.is_admin ? 'bg-gray-800' : ''; 
                tr.innerHTML = `
                    <td class="px-3 py-2 whitespace-nowrap text-sm">
                        <span class="text-white">${user.username}</span>
                        ${user.is_admin ? '<span class="ml-2 text-xs text-red-400 font-bold">[ADMIN]</span>' : ''}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm space-x-2">
                        <button data-user="${user.username}" class="text-blue-400 hover:text-blue-300 text-xs font-medium admin-view-notes">Xem</button>
                        <button data-user="${user.username}" class="text-red-400 hover:text-red-300 text-xs font-medium admin-delete-user">Xóa</button>
                    </td>
                `;
                adminUserListBody.appendChild(tr);
            });

            adminUserLoading.classList.add('hidden');
            adminUserList.classList.remove('hidden');

        } catch (err) {
            showSyncStatus(`Lỗi Admin: ${err.message}`, true);
            adminLogout(); 
        }
    }
    
    function adminLogout() {
        currentAdminCreds = null;
        adminPanel.classList.add('hidden');
        document.querySelector('#settings-main fieldset:nth-of-type(1)').classList.remove('hidden'); 
        document.querySelector('#settings-main fieldset:nth-of-type(2)').classList.remove('hidden'); 
        syncPasswordInput.value = '';
    }

    async function adminViewNotes(targetUser) {
        if (!currentAdminCreds) return;
        
        adminNoteViewerTitle.textContent = `Ghi chú của: ${targetUser}`;
        adminNoteViewerContent.innerHTML = `<p class="text-gray-400">Đang tải ghi chú...</p>`;
        adminNoteViewerModal.classList.remove('hidden');
        
        try {
            const payload = {
                ...currentAdminCreds, 
                targetUser: targetUser
            };
            
            const response = await fetch('/api/admin/get-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const notes = await response.json();
            if (!response.ok) throw new Error(notes.error || 'Lỗi không xác định');

            const formattedNotes = JSON.stringify(notes, null, 2); 
            adminNoteViewerContent.innerHTML = `<pre class="whitespace-pre-wrap text-white text-sm">${formattedNotes}</pre>`;

        } catch (err) {
             adminNoteViewerContent.innerHTML = `<p class="text-red-400">Lỗi: ${err.message}</p>`;
        }
    }
    
    async function adminDeleteUser(targetUser) {
        if (!currentAdminCreds) return;

        if (!confirm(`ĐẠI CA ADMIN!\n\nĐại ca có chắc chắn muốn XÓA VĨNH VIỄN người dùng "${targetUser}" không?\n\nHành động này không thể hoàn tác.`)) {
            return;
        }

        try {
            const payload = {
                ...currentAdminCreds, 
                targetUser: targetUser
            };
            
            const response = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Lỗi không xác định');
            
            alert(result.message); 
            loadAdminPanel(); 
            
        } catch (err) {
            alert(`Lỗi khi xóa: ${err.message}`);
        }
    }

    // ===================================================================
    // PHẦN 4: LOGIC ĐIỀU HƯỚNG
    // ===================================================================
    
    let currentTab = 'news'; 
    
    async function showCalendarSubTab(subTabName) {
        if (subTabName === currentCalendarSubTab) return; 
        currentCalendarSubTab = subTabName;
        
        if (subTabName === 'reminders') {
            calendarWorkContent.classList.add('hidden');
            calendarRemindersContent.classList.remove('hidden');
            calSubtabWork.classList.remove('active');
            calSubtabReminders.classList.add('active');
            
            await checkNotificationStatus(); 
            await fetchReminders(); 

        } else {
            calendarWorkContent.classList.remove('hidden');
            calendarRemindersContent.classList.add('hidden');
            calSubtabWork.classList.add('active');
            calSubtabReminders.classList.remove('active');
            
            renderCalendar(currentViewDate);
        }
    }

    async function showTab(tabName) { 
        if (tabName === currentTab) return; 
        
        if (currentTab === 'settings' && currentAdminCreds) {
            adminLogout(); 
        }
        
        currentTab = tabName;
        
        document.body.style.paddingBottom = '80px';

        newsMain.classList.add('hidden');
        calendarMain.classList.add('hidden');
        linksMain.classList.add('hidden'); 
        settingsMain.classList.add('hidden');
        
        if (newsTabBtn) newsTabBtn.classList.remove('active');
        if (calendarTabBtn) calendarTabBtn.classList.remove('active');
        if (settingsBtn) settingsBtn.classList.remove('active');
        bottomTabNews.classList.remove('active');
        bottomTabCalendar.classList.remove('active');
        bottomTabLinks.classList.remove('active'); 
        bottomTabSettings.classList.remove('active');
        
        if (rssMenuBtn) rssMenuBtn.classList.add('hidden');
        if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.add('hidden');
        if (mobileHeaderTitle) mobileHeaderTitle.classList.add('hidden');
        if (calendarSubtabHeader) calendarSubtabHeader.classList.add('hidden');
        
        switch (tabName) {
            case 'news':
                newsMain.classList.remove('hidden');
                if (newsTabBtn) newsTabBtn.classList.add('active');
                bottomTabNews.classList.add('active');
                
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Tin Tức";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                if (rssMenuBtn) rssMenuBtn.classList.remove('hidden');
                if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.remove('hidden');
                break;
                
            case 'calendar':
                calendarMain.classList.remove('hidden');
                if (calendarTabBtn) calendarTabBtn.classList.add('active');
                bottomTabCalendar.classList.add('active');
                
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Lịch & Nhắc Nhở";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                
                showCalendarSubTab('work'); 
                break;
            
            case 'links':
                linksMain.classList.remove('hidden');
                bottomTabLinks.classList.add('active');
                
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Lưu Trữ";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                renderLinkList(); 
                break;
                
            case 'settings':
                settingsMain.classList.remove('hidden');
                await checkNotificationStatus(); 
                await syncAppDataToServer(); 
                
                if (settingsBtn) settingsBtn.classList.add('active');
                bottomTabSettings.classList.add('active');
                
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Cài đặt";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                break;
        }
        
        rssMobileMenu.classList.add('hidden');
    }


    // ===================================================================
    // PHẦN 5: GẮN SỰ KIỆN (EVENT LISTENERS)
    // ===================================================================
    
    if (newsTabBtn) newsTabBtn.addEventListener('click', () => showTab('news'));
    if (calendarTabBtn) calendarTabBtn.addEventListener('click', () => showTab('calendar'));
    if (settingsBtn) settingsBtn.addEventListener('click', () => showTab('settings'));
    
    bottomTabNews.addEventListener('click', () => showTab('news'));
    bottomTabCalendar.addEventListener('click', () => showTab('calendar'));
    bottomTabLinks.addEventListener('click', () => showTab('links')); 
    bottomTabSettings.addEventListener('click', () => showTab('settings'));
    
    if (rssMenuBtn) rssMenuBtn.addEventListener('click', () => rssMobileMenu.classList.toggle('hidden'));

    function handleRefreshClick() {
        console.log("Đang yêu cầu tải lại...");
        const activeButton = feedNav.querySelector('.feed-button.active');
        if (activeButton) {
            const rssUrl = activeButton.dataset.rss;
            const sourceName = activeButton.dataset.source;
            fetchRSS(rssUrl, sourceName, { display: true, force: true }); 
        }
        rssMobileMenu.classList.add('hidden'); 
    }
    
    (async () => {
        feedNav.addEventListener('click', handleFeedButtonClick);
        rssMobileMenu.addEventListener('click', handleFeedButtonClick); 
        
        refreshFeedButton.addEventListener('click', handleRefreshClick);
        refreshFeedButtonMobile.addEventListener('click', handleRefreshClick); 

        const defaultFeed = feedNav.querySelector('.feed-button.active');
        if (defaultFeed) {
            await fetchRSS(defaultFeed.dataset.rss, defaultFeed.dataset.source);
        }
        setTimeout(prewarmCache, 0);

        closeSummaryModalButton.addEventListener('click', () => {
             summaryModal.classList.add('hidden');
             if (summaryEventSource) { 
                 summaryEventSource.close();
                 summaryEventSource = null;
             }
        });
         summaryModal.addEventListener('click', (e) => {
             if (e.target === summaryModal) {
                  summaryModal.classList.add('hidden');
                  if (summaryEventSource) {
                      summaryEventSource.close();
                      summaryEventSource = null;
                  }
             }
         });
         
         toastCloseButton.addEventListener('click', (e) => {
             e.stopPropagation(); 
             hideToast();
         });
        
    })();
    
    (async () => {
        renderCalendar(currentViewDate);
        loadSettings();
        
        if (syncUsernameInput) {
            syncUsernameInput.value = localStorage.getItem('syncUsername') || '';
        }
        if (syncPasswordInput) {
            syncPasswordInput.value = localStorage.getItem('syncPassword') || '';
        }

        if (syncUsernameInput) {
            syncUsernameInput.addEventListener('change', (e) => {
                localStorage.setItem('syncUsername', e.target.value.trim());
            });
        }
        if (syncPasswordInput) {
            syncPasswordInput.addEventListener('change', (e) => {
                localStorage.setItem('syncPassword', e.target.value.trim());
            });
        }
        
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
        notifyButton.addEventListener('click', handleSubscribeClick);

        calSubtabWork.addEventListener('click', () => showCalendarSubTab('work'));
        calSubtabReminders.addEventListener('click', () => showCalendarSubTab('reminders'));

        prevMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            renderCalendar(currentViewDate);
        });
        nextMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            renderCalendar(currentViewDate);
        });
        toggleSummaryViewBtn.addEventListener('click', () => {
           if (summaryViewMode === 'byDate') {
                summaryViewMode = 'byNote';
                toggleSummaryViewBtn.textContent = 'Xem theo: Ngày';
           } else {
                summaryViewMode = 'byDate';
                toggleSummaryViewBtn.textContent = 'Xem theo: Ghi chú';
            }
            renderMonthlyNoteSummary(currentViewDate);
         });
         
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
            
            if (!Array.isArray(appData.calendar[currentEditingDateStr])) { 
                appData.calendar[currentEditingDateStr] = []; 
            }
            appData.calendar[currentEditingDateStr].push(noteText); 
            
            saveAppData(); 
            renderNoteList(currentEditingDateStr); 
            renderCalendar(currentViewDate); 
            newNoteInput.value = ''; 
        });
        
        noteList.addEventListener('click', (e) => {
            const target = e.target;
            const index = target.dataset.index;
            if (!currentEditingDateStr || index === undefined) return;
            
            const notes = appData.calendar[currentEditingDateStr] || []; 
            
            if (target.classList.contains('edit-note')) {
                const oldText = notes[index];
                const newText = prompt("Sửa ghi chú:", oldText); 
                if (newText !== null && newText.trim() !== "") {
                    appData.calendar[currentEditingDateStr][index] = newText.trim(); 
                    saveAppData(); 
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
            if (target.classList.contains('delete-note')) {
                if (confirm(`Bạn có chắc muốn xóa ghi chú: "${notes[index]}"?`)) {
                    appData.calendar[currentEditingDateStr].splice(index, 1); 
                    saveAppData(); 
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
        });
        
        cal_aiForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const text = cal_aiInput.value.trim();
            if (!text) return;
            
            cal_aiInput.disabled = true;
            cal_aiForm.querySelector('button').disabled = true;
            cal_aiForm.querySelector('button').textContent = "Đang xử lý...";
            
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
                            if (!Array.isArray(appData.calendar[dateStr])) { 
                                appData.calendar[dateStr] = []; 
                            }
                            appData.calendar[dateStr].push(noteText); 
                        }
                    });
                    saveAppData(); 
                    renderCalendar(currentViewDate); 
                    cal_aiInput.value = ''; 
                } else {
                    throw new Error("AI không trả về định dạng mảng.");
                }
            } catch (err) {
                console.error('Lỗi gọi AI API (Lịch):', err);
                alert('Không thể phân tích. Vui lòng kiểm tra lại prompt và API key.');
            }
            
            cal_aiInput.disabled = false;
            cal_aiForm.querySelector('button').disabled = false;
            cal_aiForm.querySelector('button').textContent = "Phân tích";
        });

        if (syncUpBtn) {
            syncUpBtn.addEventListener('click', async () => {
                const username = syncUsernameInput.value.trim();
                const password = syncPasswordInput.value.trim();
                if (!username || !password) {
                    showSyncStatus('Vui lòng nhập Tên và Mật khẩu.', true);
                    return;
                }
                
                const endpoint = await getEndpoint();
                
                showSyncStatus('Đang tải lên...', false);
                syncUpBtn.disabled = true;
                syncDownBtn.disabled = true;
                if(adminLoginBtn) adminLoginBtn.disabled = true;

                try {
                    const response = await fetch('/api/sync/up', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            username: username, 
                            password: password, 
                            noteData: appData, 
                            endpoint: endpoint 
                        })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Lỗi không xác định');
                    
                    showSyncStatus(result.message, false);

                } catch (err) {
                    showSyncStatus(err.message, true);
                } finally {
                    syncUpBtn.disabled = false;
                    syncDownBtn.disabled = false;
                    if(adminLoginBtn) adminLoginBtn.disabled = false;
                }
            });
        }
        
        if (syncDownBtn) {
            syncDownBtn.addEventListener('click', async () => {
                const username = syncUsernameInput.value.trim();
                const password = syncPasswordInput.value.trim();
                if (!username || !password) {
                    showSyncStatus('Vui lòng nhập Tên và Mật khẩu.', true);
                    return;
                }
                
                const endpoint = await getEndpoint();

                if (!confirm('HÀNH ĐỘNG NGUY HIỂM!\n\nViệc này sẽ GHI ĐÈ toàn bộ dữ liệu (Lịch + Links) hiện tại trên máy này.\n\n(Nhắc nhở sẽ chỉ được đồng bộ nếu Đại ca đã Bật Thông Báo)\n\nĐại ca có chắc chắn muốn tải về?')) {
                    return;
                }

                showSyncStatus('Đang tải về...', false);
                syncUpBtn.disabled = true;
                syncDownBtn.disabled = true;
                if(adminLoginBtn) adminLoginBtn.disabled = true;

                try {
                    const response = await fetch('/api/sync/down', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            username: username, 
                            password: password,
                            endpoint: endpoint 
                        })
                    });
                    
                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.error || 'Lỗi không xác định');
                    }

                    const downloadedData = await response.json();
                    
                    appData = normalizeAppData(downloadedData); 
                    
                    saveAppData(); 
                    renderCalendar(currentViewDate); 
                    
                    if (currentTab === 'calendar') {
                        const subTabToReload = currentCalendarSubTab;
                        currentCalendarSubTab = null; 
                        showCalendarSubTab(subTabToReload);
                    } else if (currentTab === 'links') {
                        renderLinkList(); 
                    }
                    
                    showSyncStatus('Tải về (Lịch + Links) thành công!', false);
                    
                } catch (err) {
                    showSyncStatus(err.message, true);
                } finally {
                    syncUpBtn.disabled = false;
                    syncDownBtn.disabled = false;
                    if(adminLoginBtn) adminLoginBtn.disabled = false;
                }
            });
        }
        
        if (adminLoginBtn) {
            adminLoginBtn.addEventListener('click', async () => {
                const username = syncUsernameInput.value.trim();
                const password = syncPasswordInput.value.trim();
                if (!username || !password) {
                    showSyncStatus('Vui lòng nhập Tên và Mật khẩu Admin.', true);
                    return;
                }
                
                showSyncStatus('Đang đăng nhập Admin...', false);
                adminLoginBtn.disabled = true;
                syncUpBtn.disabled = true;
                syncDownBtn.disabled = true;

                const creds = { adminUser: username, adminPass: password };

                try {
                    const response = await fetch('/api/admin/get-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(creds)
                    });
                    
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Lỗi không xác định');
                    
                    showSyncStatus('Đăng nhập Admin thành công!', false);
                    currentAdminCreds = creds; 
                    loadAdminPanel(); 

                } catch (err) {
                    showSyncStatus(err.message, true);
                    currentAdminCreds = null;
                } finally {
                    adminLoginBtn.disabled = false;
                    syncUpBtn.disabled = false;
                    syncDownBtn.disabled = false;
                }
            });
        }
        if (adminLogoutBtn) {
            adminLogoutBtn.addEventListener('click', adminLogout);
        }
        if (adminUserListBody) {
            adminUserListBody.addEventListener('click', (e) => {
                const target = e.target;
                const username = target.dataset.user;
                if (!username) return;

                if (target.classList.contains('admin-view-notes')) {
                    adminViewNotes(username);
                } else if (target.classList.contains('admin-delete-user')) {
                    adminDeleteUser(username);
                }
            });
        }
        if (adminCloseNoteViewer) {
            adminCloseNoteViewer.addEventListener('click', () => {
                adminNoteViewerModal.classList.add('hidden');
            });
        }
        if (adminNoteViewerModal) {
             adminNoteViewerModal.addEventListener('click', (e) => {
                 if (e.target === adminNoteViewerModal) {
                    adminNoteViewerModal.classList.add('hidden');
                 }
             });
        }

        if (newReminderForm) {
            newReminderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = newReminderTitle.value.trim();
                const content = newReminderContent.value.trim();
                
                if (!title) { 
                    showReminderStatus('Vui lòng nhập tiêu đề nhắc nhở.', true);
                    return;
                }

                if (!swRegistration || !swRegistration.pushManager) {
                    showReminderStatus('Lỗi PushManager. Vui lòng tải lại.', true);
                    return;
                }
                const subscription = await swRegistration.pushManager.getSubscription();
                if (!subscription) {
                    showReminderStatus('Vui lòng Bật Thông Báo trong Cài đặt.', true);
                    return;
                }
                
                showReminderStatus('Đang thêm...', false);
                
                try {
                    const response = await fetch('/api/add-reminder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            endpoint: subscription.endpoint,
                            title: title,
                            content: content
                        })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);

                    showReminderStatus('Thêm thành công!', false);
                    newReminderTitle.value = ''; 
                    newReminderContent.value = ''; 
                    
                    await fetchReminders();

                } catch (err) {
                    showReminderStatus(`Lỗi: ${err.message}`, true);
                }
            });
        }
        
        if (reminderListContainer) {
            reminderListContainer.addEventListener('click', async (e) => {
                const item = e.target.closest('.reminder-item');
                if (!item) return;

                const deleteBtn = e.target.closest('.reminder-delete-btn');
                if (deleteBtn) {
                    e.stopPropagation(); 
                    
                    if (!swRegistration || !swRegistration.pushManager) {
                        alert("Lỗi PushManager. Không thể xóa.");
                        return;
                    }
                    const subscription = await swRegistration.pushManager.getSubscription();
                    if (!subscription) {
                        alert("Không thể xác thực. Vui lòng Bật Thông Báo.");
                        return;
                    }
                    const endpoint = subscription.endpoint;
                    
                    const id = item.dataset.id;
                    if (!confirm("Đại ca có chắc muốn xóa nhắc nhở này?")) return;
                    
                    item.style.opacity = '0.5'; 
                    try {
                        const response = await fetch('/api/delete-reminder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: id, endpoint: endpoint })
                        });
                        const result = await response.json();
                            if (!response.ok) throw new Error(result.error);
                            const list = item.closest('.reminder-list'); 
                            item.remove(); 
                            if (list && list.children.length === 0) { 
                            list.closest('.reminder-month-group').remove();
                        }
                        
                    } catch (err) {
                        alert(`Lỗi khi xóa: ${err.message}`);
                        item.style.opacity = '1'; 
                    }
                    return; 
                }
                
                const contentBoxClick = e.target.closest('.reminder-content-clickable');
                
                if (contentBoxClick) { 
                    const id = item.dataset.id;
                    const title = item.dataset.title;
                    const content = item.dataset.content;
                    const dtValue = item.dataset.datetime;
                    const isActive = item.dataset.active === 'true'; 

                    editReminderId.value = id;
                    editReminderTitle.value = title;
                    editReminderContent.value = content;
                    editReminderDatetime.value = dtValue;
                    editReminderActive.checked = isActive;
                    
                    reminderEditModal.classList.remove('hidden');
                }
            });
            
            reminderListContainer.addEventListener('change', async (e) => {
                const target = e.target;
                
                if (target.classList.contains('reminder-toggle-check')) {
                    const item = target.closest('.reminder-item');
                    if (!item) return;

                    const id = item.dataset.id;
                    const timeInput = item.querySelector('.reminder-datetime-input');
                    const textSpan = item.querySelector('.reminder-title'); 
                    const isActive = target.checked;

                    if (isActive && !timeInput.value) {
                        alert("Đại ca phải chọn ngày giờ trước khi bật!");
                        target.checked = false; 
                        return; 
                    }
                    
                    textSpan.classList.toggle('text-white', isActive);
                    textSpan.classList.toggle('text-gray-400', !isActive);

                    const success = await updateReminder(id, {
                        datetimeLocalString: timeInput.value,
                        isActive: isActive
                    });
                    
                    if (!success) {
                        await fetchReminders();
                    } else {
                        item.dataset.active = isActive.toString();
                        item.dataset.datetime = timeInput.value;
                    }
                }
            });
            
            reminderListContainer.addEventListener('blur', async (e) => {
                const target = e.target;

                if (target.classList.contains('reminder-datetime-input')) {
                    const item = target.closest('.reminder-item');
                    if (!item) return;

                    const id = item.dataset.id;
                    const timeInput = target; 
                    const toggle = item.querySelector('.reminder-toggle-check');
                    const textSpan = item.querySelector('.reminder-title');

                    if (!timeInput.value) {
                        return;
                    }
                    
                    if (!toggle.checked) {
                        toggle.checked = true;
                    }
                    if (!textSpan.classList.contains('text-white')) {
                        textSpan.classList.add('text-white');
                        textSpan.classList.remove('text-gray-400');
                    }
                    
                    const success = await updateReminder(id, {
                        datetimeLocalString: timeInput.value,
                        isActive: true
                    });

                    if (!success) {
                        await fetchReminders();
                    } else {
                        item.dataset.active = 'true';
                        item.dataset.datetime = timeInput.value;
                        await fetchReminders();
                    }
                }
            }, true); 
        }

        if (closeReminderEditModalBtn) {
            closeReminderEditModalBtn.addEventListener('click', () => {
                reminderEditModal.classList.add('hidden');
            });
        }
        if (reminderEditModal) {
             reminderEditModal.addEventListener('click', (e) => {
                 if (e.target === reminderEditModal) {
                    reminderEditModal.classList.add('hidden');
                 }
             });
        }
        if (editReminderForm) {
            editReminderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                saveReminderBtn.disabled = true;
                saveReminderBtn.textContent = "Đang lưu...";

                const id = editReminderId.value;
                const title = editReminderTitle.value.trim();
                const content = editReminderContent.value.trim();
                const datetime = editReminderDatetime.value;
                const isActive = editReminderActive.checked;

                if (!title) {
                    alert("Tiêu đề không được để trống!");
                    saveReminderBtn.disabled = false;
                    saveReminderBtn.textContent = "Lưu thay đổi";
                    return;
                }
                
                const success = await updateReminder(id, {
                    datetimeLocalString: datetime,
                    isActive: isActive,
                    title: title,
                    content: content
                });
                
                saveReminderBtn.disabled = false;
                saveReminderBtn.textContent = "Lưu thay đổi";

                if (success) {
                    reminderEditModal.classList.add('hidden');
                    await fetchReminders(); 
                } else {
                    alert("Lưu thất bại! Vui lòng thử lại.");
                }
            });
        }
        
        if (newLinkForm) {
            newLinkForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const url = newLinkUrl.value.trim();
                const note = newLinkNote.value.trim();
                
                if (!url) {
                    showLinkStatus('Vui lòng nhập đường dẫn URL.', true);
                    return;
                }
                
                appData.links.push({ url, note });
                
                saveAppData(); 
                renderLinkList(); 
                
                newLinkUrl.value = '';
                newLinkNote.value = '';
                showLinkStatus('Đã lưu link thành công!', false);
            });
        }
        
        if (linkListContainer) {
            linkListContainer.addEventListener('click', (e) => {
                const deleteButton = e.target.closest('.delete-link');
                if (deleteButton) {
                    const index = parseInt(deleteButton.dataset.index, 10);
                    if (isNaN(index)) return;
                    
                    const link = appData.links[index];
                    if (confirm(`Đại ca có chắc muốn xóa link này?\n\n${link.url}`)) {
                        appData.links.splice(index, 1); 
                        saveAppData(); 
                        renderLinkList(); 
                    }
                }
            });
        }

    })();
    
    if (window.location.hash === '#calendar') {
        showTab('calendar');
    } else {
        showTab('news'); 
    }

});
