/* =================================================================== */
/* FILE: public/app.js                                                 */
/* MỤC ĐÍCH: Logic JavaScript chính cho toàn bộ ứng dụng Ghichu App.     */
/* PHIÊN BẢN: Đã tách logic tính toán sang utils.js                     */
/* CẬP NHẬT: Vá lỗi bảo mật XSS (Sử dụng .textContent)                   */
/* =================================================================== */

// ===================================================================
// PHẦN 0: IMPORT CÁC HÀM TIỆN ÍCH
// ===================================================================

// Import tất cả các hàm tiện ích từ file utils.js
// Giúp file app.js này gọn gàng và chỉ tập trung vào logic DOM.
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

/**
 * Hàm khởi chạy chính, được gọi khi DOM đã tải xong.
 */
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
    // (CẬP NHẬT) PHẦN 0: KHAI BÁO BIẾN (DOM ELEMENTS)
    // ===================================================================
    
    // --- Biến Phần 1 (Tin Tức) ---
    const newsMain = document.getElementById('news-main');
    const newsGrid = document.getElementById('news-grid');
    const loadingSpinner = document.getElementById('loading-spinner');
    const summaryModal = document.getElementById('summary-modal');
    const closeSummaryModalButton = document.getElementById('close-summary-modal');
    const summaryTitleElement = document.getElementById('summary-title');
    const summaryTextElement = document.getElementById('summary-text');
    const feedNav = document.getElementById('feed-nav');
    const chatFab = document.getElementById('chat-fab');
    const chatModal = document.getElementById('chat-modal'); // (Lưu ý: Biến này có thể không còn dùng)
    const closeChatModal = document.getElementById('close-chat-modal'); // (Lưu ý: Biến này có thể không còn dùng)
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatDisplay = document.getElementById('chat-display');
    const rssMenuBtn = document.getElementById('rss-menu-btn'); 
    const rssMobileMenu = document.getElementById('rss-mobile-menu'); 
    const summaryToast = document.getElementById('summary-toast');
    const toastTitle = document.getElementById('toast-title');
    const toastCloseButton = document.getElementById('toast-close-button');
    const toastIcon = document.getElementById('toast-icon');
    const toastMainMessage = document.getElementById('toast-main-message');
    const toastCta = document.getElementById('toast-cta');

    // --- Biến Phần 2 (Lịch & Cài đặt) ---
    const calendarMain = document.getElementById('calendar-main');
    const settingsMain = document.getElementById('settings-main');
    const cal_aiForm = document.getElementById('ai-form');
    const cal_aiInput = document.getElementById('ai-input');
    const calendarBody = document.getElementById('calendar-body');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const settingsModal = document.getElementById('settings-modal'); // (Lưu ý: Biến này có thể không còn dùng)
    const closeModalBtn = document.getElementById('close-modal'); // (Lưu ý: Biến này có thể không còn dùng)
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

    // --- Biến Phần 3 (Trò chuyện) ---
    const chatMain = document.getElementById('chat-main');
    
    // (MỚI) --- Biến Phần 3.2 (Lưu Trữ Link) ---
    const linksMain = document.getElementById('links-main');
    const newLinkForm = document.getElementById('new-link-form');
    const newLinkUrl = document.getElementById('new-link-url');
    const newLinkNote = document.getElementById('new-link-note');
    const linkListContainer = document.getElementById('link-list-container');
    const linkStatusMsg = document.getElementById('link-status-msg');


    // --- (CẬP NHẬT) Biến Phần 3.5 (Lịch / Nhắc nhở) ---
    
    // (MỚI) Biến cho Sub-tab (trong Header)
    const calendarSubtabHeader = document.getElementById('calendar-subtab-header');
    const calSubtabWork = document.getElementById('cal-subtab-work');
    const calSubtabReminders = document.getElementById('cal-subtab-reminders');
    
    // (MỚI) Biến cho nội dung Sub-tab (trong Main)
    const calendarWorkContent = document.getElementById('calendar-work-content');
    const calendarRemindersContent = document.getElementById('calendar-reminders-content');

    // (MỚI) Biến cho Nhắc nhở (vẫn giữ nguyên, vì DOM ID không đổi)
    const newReminderForm = document.getElementById('new-reminder-form');
    const newReminderTitle = document.getElementById('new-reminder-title'); 
    const newReminderContent = document.getElementById('new-reminder-content');
    const newReminderStatus = document.getElementById('new-reminder-status');
    const reminderListContainer = document.getElementById('reminder-list-container');
    const reminderListLoading = document.getElementById('reminder-list-loading');
    const reminderWarning = document.getElementById('reminder-warning'); 
    const settingsPushWarning = document.getElementById('settings-push-warning'); 
    
    // (MỚI) Biến cho Modal Edit (vẫn giữ nguyên)
    const reminderEditModal = document.getElementById('reminder-edit-modal');
    const closeReminderEditModalBtn = document.getElementById('close-reminder-edit-modal');
    const editReminderForm = document.getElementById('edit-reminder-form');
    const editReminderId = document.getElementById('edit-reminder-id');
    const editReminderTitle = document.getElementById('edit-reminder-title');
    const editReminderContent = document.getElementById('edit-reminder-content');
    const editReminderDatetime = document.getElementById('edit-reminder-datetime');
    const editReminderActive = document.getElementById('edit-reminder-active');
    const saveReminderBtn = document.getElementById('save-reminder-btn');
    
    // --- Biến Phần 4 (Điều khiển Tab) ---
    const newsTabBtn = document.getElementById('news-tab-btn');
    const calendarTabBtn = document.getElementById('calendar-tab-btn'); // (Lưu ý: Biến này có thể không có trong HTML)
    const settingsBtn = document.getElementById('settings-btn'); // (Lưu ý: Biến này có thể không có trong HTML)
    
    // (CẬP NHẬT) Biến Header Mobile
    const mobileHeaderTitle = document.getElementById('mobile-header-title');
    // const mobileHeaderLeft = document.getElementById('mobile-header-left'); // (ĐÃ XÓA)
    
    const refreshFeedButton = document.getElementById('refresh-feed-button');
    const refreshFeedButtonMobile = document.getElementById('refresh-feed-button-mobile'); 
    const bottomTabNews = document.getElementById('bottom-tab-news');
    const bottomTabCalendar = document.getElementById('bottom-tab-calendar');
    const bottomTabChat = document.getElementById('bottom-tab-chat');
    const bottomTabLinks = document.getElementById('bottom-tab-links'); // (MỚI)
    const bottomTabSettings = document.getElementById('bottom-tab-settings');
    const bottomNav = document.getElementById('bottom-nav'); 

    // --- Biến Phần 5 (Đồng bộ Online) ---
    const syncUsernameInput = document.getElementById('sync-username');
    const syncPasswordInput = document.getElementById('sync-password');
    const syncUpBtn = document.getElementById('sync-up-btn');
    const syncDownBtn = document.getElementById('sync-down-btn');
    const syncStatusMsg = document.getElementById('sync-status-msg');

    // --- Biến Phần 6 (Admin) ---
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
    let currentCalendarSubTab = 'work'; // (MỚI) 'work' hoặc 'reminders'
    let summaryViewMode = 'byDate'; // 'byDate' hoặc 'byNote'
    let currentAdminCreds = null; // Lưu trữ thông tin đăng nhập Admin
    let currentEditingDateStr = null; // Ngày đang sửa trong modal
    let currentViewDate = new Date(); // Tháng đang xem trên lịch
    let chatHistory = []; // Lịch sử chat
    let summaryEventSource = null; // Đối tượng stream tóm tắt
    let completedSummary = { title: '', text: '' }; // Tóm tắt đã hoàn thành
    let toastTimeoutId = null; // ID của setTimeout cho toast
    const clientRssCache = new Map(); // Cache RSS phía client
    
    // (CẬP NHẬT) Đọc dữ liệu từ LocalStorage khi khởi động
    
    /**
     * (MỚI) Chuẩn hóa dữ liệu ứng dụng.
     * Xử lý cả dữ liệu cũ (chỉ noteData) và dữ liệu mới (appData).
     * @param {object} data - Dữ liệu tải từ localStorage hoặc server.
     * @returns {{calendar: object, links: Array}}
     */
    function normalizeAppData(data) {
        if (!data) {
            return { calendar: {}, links: [] };
        }
        // Nếu data có 'calendar' và 'links' -> đây là cấu trúc mới
        if (data.calendar || data.links) {
            return {
                calendar: data.calendar || {},
                links: data.links || []
            };
        }
        // Nếu không -> đây là cấu trúc cũ (chỉ có noteData)
        // Ta giả định toàn bộ đối tượng là `noteData` cũ
        return {
            calendar: data, // Dữ liệu cũ chính là 'calendar'
            links: []       // Tạo mảng 'links' rỗng
        };
    }

    const rawData = JSON.parse(localStorage.getItem('myAppData')) || {}; // (SỬA) Đổi tên key
    let appData = normalizeAppData(rawData); // (SỬA)
    
    let appSettings = JSON.parse(localStorage.getItem('myScheduleSettings')) || {
        notifyTimeNgay: "06:00",
        notifyTimeDem: "20:00",
        notifyTimeOff: "08:00"
    };

    // ===================================================================
    // PHẦN 1: LOGIC TIN TỨC (RSS, TÓM TẮT, CHAT)
    // ===================================================================
    
    // --- Các hằng số cho icon toast ---
    const iconSpinner = `<div class="spinner border-t-white" style="width: 24px; height: 24px;"></div>`;
    const iconCheck = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    const iconError = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    /**
     * Gọi API Gemini (streaming) để tóm tắt văn bản.
     * Sử dụng EventSource (Server-Sent Events) để nhận dữ liệu từng phần.
     * @param {string} prompt - Câu lệnh (prompt) gửi cho AI.
     * @param {string} title - Tiêu đề bài báo (dùng để hiển thị).
     */
    function callGeminiAPIStreaming(prompt, title) {
        if (summaryEventSource) {
            summaryEventSource.close(); // Đóng stream cũ nếu có
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
                    // Nhận được 1 phần tóm tắt
                    currentSummaryText += data.text;
                } else if (data.error) {
                    // Nhận được thông báo lỗi từ stream
                    console.error("Lỗi từ stream:", data.error);
                    currentSummaryText += `\n\n[Lỗi: ${data.error}]`;
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    showToast("Lỗi tóm tắt", data.error, 'error', null, 5000);
                } else if (data.done) {
                    // Stream kết thúc
                    console.log("Stream tóm tắt hoàn thành.");
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    completedSummary = { title: title, text: currentSummaryText };
                    showSummaryReadyNotification(title); // Hiển thị toast "Sẵn sàng"
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
     * Gọi API Chat (không streaming) để trò chuyện.
     * Gửi toàn bộ lịch sử chat VÀ endpoint (danh tính) lên server.
     */
    async function callChatAPI() {
        // Hiển thị bubble "đang tải"
        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'model-bubble';
        loadingBubble.innerHTML = `<div class"spinner border-t-white" style="width: 20px; height: 20px;"></div>`;
        chatDisplay.appendChild(loadingBubble);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
        
        let endpoint = null;
        if (swRegistration && swRegistration.pushManager) { // (SỬA) Kiểm tra cả pushManager
            try {
                const subscription = await swRegistration.pushManager.getSubscription();
                if (subscription) {
                    endpoint = subscription.endpoint;
                }
            } catch (err) {
                console.warn("Không thể lấy subscription endpoint:", err);
            }
        }

        try {
            // Gửi request lên server
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    history: chatHistory, 
                    endpoint: endpoint
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lỗi server: ${errorText}`);
            }
            
            const result = await response.json();
            const answer = result.answer;
            
            chatHistory.push({ role: "model", parts: [{ text: answer }] });
            
            chatDisplay.removeChild(loadingBubble);
            renderChatHistory();
            
        } catch (error) {
            console.error("Lỗi khi gọi API chat:", error);
            chatDisplay.removeChild(loadingBubble);
            const errorBubble = document.createElement('div');
            errorBubble.className = 'model-bubble';
            errorBubble.style.backgroundColor = '#991B1B';
            errorBubble.textContent = `Lỗi: ${error.message}`;
            chatDisplay.appendChild(errorBubble);
        } finally {
            chatDisplay.scrollTop = chatDisplay.scrollHeight;
        }
    }

    /**
     * Tải và phân tích RSS feed từ server.
     * Sử dụng cache phía client (clientRssCache) để tăng tốc độ.
     * @param {string} rssUrl - URL của RSS feed.
     * @param {string} sourceName - Tên nguồn (VnExpress, Tuổi Trẻ...).
     * @param {object} [options] - Tùy chọn.
     * @param {boolean} [options.display=true] - Có hiển thị kết quả ra DOM không.
     * @param {boolean} [options.force=false] - Có buộc tải lại (xóa cache) không.
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
        
        // Kiểm tra cache
        if (clientRssCache.has(rssUrl)) {
            if (display) {
                displayArticles(clientRssCache.get(rssUrl), sourceName);
                loadingSpinner.classList.add('hidden');
            }
            return;
        }
        
        // Nếu không có cache, gọi API
        try {
            // (MỚI) Thêm timestamp để tránh cache trình duyệt/server
            const timestamp = new Date().getTime(); 
            const response = await fetch(`/get-rss?url=${encodeURIComponent(rssUrl)}&t=${timestamp}`);
            
            if (!response.ok) throw new Error('Lỗi server (RSS)');
            
            const response = await fetch(`/get-rss?url=${encodeURIComponent(rssUrl)}`);
            if (!response.ok) throw new Error('Lỗi server (RSS)');
            
            const str = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(str, "text/xml");
            
            if (xmlDoc.getElementsByTagName("parsererror").length) throw new Error("Lỗi phân tích XML");
            
            let items;
            const itemNodes = xmlDoc.querySelectorAll("item"); // Chuẩn RSS
            if (itemNodes.length === 0) {
                const entryNodes = xmlDoc.querySelectorAll("entry"); // Chuẩn Atom (VTV)
                if (entryNodes.length > 0) items = Array.from(entryNodes);
                else throw new Error("Không tìm thấy bài viết");
            } else {
                 items = Array.from(itemNodes);
            }
            
            // Lưu vào cache
            clientRssCache.set(rssUrl, items);
            
            if (display) displayArticles(items, sourceName);
        } catch (error) {
            console.error(`Lỗi tải RSS ${sourceName}:`, error);
            if (display) newsGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">${error.message}</p>`;
        } finally {
            if (display) loadingSpinner.classList.add('hidden');
        }
    }

    /**
     * (CẬP NHẬT - VÁ LỖI XSS)
     * Hiển thị các bài báo (từ RSS) lên giao diện (DOM).
     * @param {Element[]} items - Mảng các phần tử <item> hoặc <entry> từ XML.
     * @param {string} sourceName - Tên nguồn báo.
     */
    function displayArticles(items, sourceName) {
        newsGrid.innerHTML = '';
        items.forEach(item => {
            // Trích xuất dữ liệu, hỗ trợ cả RSS (item) và Atom (entry)
            const title = item.querySelector("title")?.textContent || "Không có tiêu đề";
            let description = item.querySelector("description")?.textContent || item.querySelector("summary")?.textContent || item.querySelector("content")?.textContent || "";
            let link = item.querySelector("link")?.textContent || "#";
            if (link === "#" && item.querySelector("link")?.hasAttribute("href")) {
                link = item.querySelector("link")?.getAttribute("href") || "#"; // Dành cho Atom
            }
            const pubDate = item.querySelector("pubDate")?.textContent || item.querySelector("updated")?.textContent || "";
            
            // Làm sạch description (loại bỏ HTML, lấy ảnh)
            const descParser = new DOMParser();
            const descDoc = descParser.parseFromString(`<!doctype html><body>${description}`, 'text/html');
            const img = descDoc.querySelector("img");
            const imgSrc = img ? img.src : "https://placehold.co/600x400/374151/9CA3AF?text=Tin+Tuc";
            let descriptionText = descDoc.body.textContent.trim() || "Không có mô tả.";
            
            // (Lỗi phổ biến) Loại bỏ tiêu đề bị lặp lại trong mô tả
            if (descriptionText.startsWith(title)) {
                descriptionText = descriptionText.substring(title.length).trim();
            }
            
            // (SỬA LỖI XSS) Tạo thẻ Card bằng DOM an toàn
            const card = document.createElement('a');
            card.href = link;
            card.className = "bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 transform hover:scale-[1.03] hover:shadow-blue-500/20 block";
            
            const imgEl = document.createElement('img');
            imgEl.src = imgSrc;
            imgEl.alt = title; // Alt text an toàn
            imgEl.className = "w-full h-48 object-cover";
            imgEl.onerror = function() { this.src='https://placehold.co/600x400/374151/9CA3AF?text=Error'; };
            card.appendChild(imgEl);

            const contentDiv = document.createElement('div');
            contentDiv.className = "p-5";

            const sourceSpan = document.createElement('span');
            sourceSpan.className = "text-xs font-semibold text-blue-400";
            sourceSpan.textContent = sourceName; // An toàn
            contentDiv.appendChild(sourceSpan);

            const titleH3 = document.createElement('h3');
            titleH3.className = "text-lg font-bold text-white mt-2 mb-1 leading-tight line-clamp-2";
            titleH3.textContent = title; // AN TOÀN (dùng .textContent)
            contentDiv.appendChild(titleH3);

            const descP = document.createElement('p');
            descP.className = "text-sm text-gray-400 mt-2 mb-3 line-clamp-3";
            descP.textContent = descriptionText; // AN TOÀN (dùng .textContent)
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

            // Ngăn thẻ <a> điều hướng khi bấm nút "Tóm tắt"
             card.addEventListener('click', (e) => {
                 if (e.target.closest('.summary-btn')) {
                     return; // Không làm gì cả
                 }
                 // Nếu không phải nút tóm tắt, thẻ <a> sẽ hoạt động bình thường
             });
            
            // Gắn sự kiện cho nút "Tóm tắt"
            summaryButton.addEventListener('click', (e) => {
                e.preventDefault(); // Ngăn thẻ <a>
                e.stopPropagation(); // Ngăn sự kiện nổi bọt
                handleSummaryClick(title, descriptionText);
            });
            
            newsGrid.appendChild(card);
        });
    }

    /**
     * Xử lý sự kiện khi nhấn nút chọn Feed RSS (Desktop và Mobile).
     * @param {Event} e - Sự kiện click.
     */
    function handleFeedButtonClick(e) {
         const clickedButton = e.target.closest('.feed-button');
         if (!clickedButton || clickedButton.classList.contains('active')) return;
         
         const rssUrl = clickedButton.dataset.rss;
         const sourceName = clickedButton.dataset.source;
         
         // Tắt active ở tất cả các nút
         document.querySelectorAll('#feed-nav .feed-button, #rss-mobile-menu .feed-button').forEach(btn => btn.classList.remove('active'));
         // Bật active ở các nút tương ứng (cả mobile và desktop)
         document.querySelectorAll(`.feed-button[data-rss="${rssUrl}"]`).forEach(btn => btn.classList.add('active'));
         
         window.scrollTo({ top: 0, behavior: 'smooth' });
         fetchRSS(rssUrl, sourceName);
         
         // Tự động đóng menu mobile
         rssMobileMenu.classList.add('hidden'); 
    }

    /**
     * Xử lý sự kiện khi nhấn nút "Tóm tắt".
     * @param {string} title - Tiêu đề bài báo.
     * @param {string} description - Nội dung mô tả (đã lọc HTML).
     */
    function handleSummaryClick(title, description) {
        if (!description || description === "Không có mô tả.") {
             showToast("Không thể tóm tắt", "Bài viết không có đủ nội dung.", 'error', null, 4000);
            return;
        }
        
        // Tạo prompt cho AI
        const prompt = `Tóm tắt nội dung sau đây trong khoảng 200 từ:
        Tiêu đề: ${title}
        Nội dung: ${description}`;
        
        callGeminiAPIStreaming(prompt, title);
        
        // Hiển thị toast "Đang tải"
        showToast("Đang tóm tắt...", title.substring(0, 50) + "...", 'loading', null, 5000);
    }

    /**
     * Hiển thị một thông báo toast (cửa sổ nhỏ góc dưới).
     * @param {string} mainMessage - Dòng thông báo chính (in đậm).
     * @param {string} detailMessage - Dòng tiêu đề (phụ).
     * @param {'ready' | 'loading' | 'error'} state - Trạng thái của toast (quyết định icon và màu sắc).
     * @param {function | null} onClickAction - Hàm sẽ gọi khi nhấn vào toast (chỉ hoạt động khi state='ready').
     * @param {number | null} autoHideDelay - Tự động ẩn sau (ms).
     */
     function showToast(mainMessage, detailMessage, state = 'ready', onClickAction, autoHideDelay = null) {
         if (toastTimeoutId) clearTimeout(toastTimeoutId); // Xóa hẹn giờ ẩn cũ (nếu có)
         
         toastMainMessage.textContent = mainMessage;
         toastTitle.textContent = detailMessage;
         
         summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
         summaryToast.onclick = null; // Xóa sự kiện click cũ
         
         if (state === 'loading') {
             toastIcon.innerHTML = iconSpinner;
             summaryToast.classList.add('toast-loading'); 
             summaryToast.style.cursor = 'default';
             toastCta.style.display = 'none'; // Ẩn "Nhấn để xem"
         } else if (state === 'ready') {
             toastIcon.innerHTML = iconCheck;
             summaryToast.classList.add('bg-blue-600'); 
             summaryToast.style.cursor = 'pointer';
             toastCta.style.display = 'block'; // Hiện "Nhấn để xem"
             summaryToast.onclick = onClickAction; // Gán hành động click
         } else if (state === 'error') {
             toastIcon.innerHTML = iconError;
             summaryToast.classList.add('bg-red-600'); 
             summaryToast.style.cursor = 'default';
             toastCta.style.display = 'none';
         }
         
         // Hiển thị toast
         summaryToast.classList.remove('hidden');
         setTimeout(() => summaryToast.classList.add('show'), 50); // Delay 50ms để CSS transition hoạt động
         
         // Hẹn giờ tự động ẩn
         if (autoHideDelay) {
             toastTimeoutId = setTimeout(hideToast, autoHideDelay);
         }
     }

     /**
      * Ẩn toast tóm tắt.
      */
     function hideToast() {
          if (toastTimeoutId) clearTimeout(toastTimeoutId);
          toastTimeoutId = null;
          
          summaryToast.classList.remove('show');
          setTimeout(() => {
              summaryToast.classList.add('hidden');
              summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
          }, 300); // Chờ 300ms cho CSS transition
          summaryToast.onclick = null;
     }

     /**
      * Hiển thị toast thông báo "Tóm tắt đã sẵn sàng".
      * Gán sự kiện click để mở modal tóm tắt.
      * @param {string} title - Tiêu đề bài báo.
      */
     function showSummaryReadyNotification(title) {
          showToast(
              "Tóm tắt đã sẵn sàng!",
              title.substring(0, 50) + "...",
              'ready', 
              () => { 
                  // Hành động khi click: Mở Modal
                  summaryTitleElement.textContent = completedSummary.title;
                  summaryTextElement.textContent = completedSummary.text;
                  summaryModal.classList.remove('hidden');
                  hideToast(); // Ẩn toast đi
              },
              null // Không tự động ẩn
          );
     }

    /**
     * Vẽ lại toàn bộ lịch sử chat trong khung chat.
     */
    function renderChatHistory() {
        chatDisplay.innerHTML = '';
        if (chatHistory.length === 0) {
             // Hiển thị tin nhắn chào mừng
             chatDisplay.innerHTML = `<div class="model-bubble">Chào đại ca, Tèo xin trả lời bất kỳ câu hỏi nào của đại ca?</div>`;
             return;
        }
        
        chatHistory.forEach(message => {
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble';
            if (message.role === 'user') {
                bubble.classList.add('user-bubble');
            } else {
                bubble.classList.add('model-bubble');
            }
            bubble.style.whiteSpace = "pre-wrap"; // Giữ các dấu xuống dòng
            bubble.textContent = message.parts[0].text;
            chatDisplay.appendChild(bubble);
        });
        
        chatDisplay.scrollTop = chatDisplay.scrollHeight; // Tự cuộn xuống dưới
    }

    /**
     * Xử lý sự kiện gửi tin nhắn chat.
     * @param {Event} e - Sự kiện submit form.
     */
    async function handleSendChat(e) {
        e.preventDefault();
        const prompt = chatInput.value.trim();
        if (!prompt) return;
        
        // Thêm tin nhắn của user vào lịch sử và vẽ lại
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        renderChatHistory();
        chatInput.value = '';
        
        // Gọi API
        await callChatAPI();
    }

    /**
     * Xóa lịch sử chat và vẽ lại (hiển thị tin nhắn chào mừng).
     */
    function resetChat() {
        chatHistory = [];
        renderChatHistory();
    }

    /**
     * Tải ngầm (pre-warm) các RSS feed khác vào cache.
     * Được gọi sau khi feed đầu tiên đã tải xong.
     */
    function prewarmCache() {
        console.log("[Cache-Warmer] Bắt đầu tải nền các feed khác...");
        // Lấy tất cả các nút feed CHƯA active
        const feedsToPrewarm = Array.from(feedNav.querySelectorAll('.feed-button:not(.active)'));
        feedsToPrewarm.forEach(feed => {
            fetchRSS(feed.dataset.rss, feed.dataset.source, { display: false }); // Tải nhưng không hiển thị
        });
    }
    
    
    // ===================================================================
    // PHẦN 2: LOGIC LỊCH (CALENDAR, NOTES, SETTINGS, PUSH, SYNC)
    // ===================================================================

    /**
     * Hiển thị thông báo trạng thái đồng bộ (Sync).
     * @param {string} message - Nội dung thông báo.
     * @param {boolean} [isError=false] - Là lỗi (true) hay thành công (false).
     */
    function showSyncStatus(message, isError = false) {
        if (!syncStatusMsg) return;
        syncStatusMsg.textContent = message;
        syncStatusMsg.className = isError 
            ? 'text-sm text-red-400 mt-3 text-center' 
            : 'text-sm text-green-400 mt-3 text-center';
        syncStatusMsg.classList.remove('hidden');

        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            if (syncStatusMsg.textContent === message) { // Chỉ ẩn nếu thông báo còn đó
                syncStatusMsg.classList.add('hidden');
            }
        }, 5000);
    }

    /**
     * (CẬP NHẬT) Lưu dữ liệu (appData) vào LocalStorage.
     * Đồng thời, lọc bỏ các ngày không có ghi chú (dọn rác).
     * Cũng gọi hàm syncAppDataToServer() để đồng bộ với máy chủ thông báo.
     */
    function saveAppData() { // (SỬA) Đổi tên
        const cleanData = {};
        // Lọc bỏ các ngày rỗng
        for (const date in appData.calendar) { // (SỬA) Dùng appData.calendar
            if (Array.isArray(appData.calendar[date]) && appData.calendar[date].length > 0) {
                cleanData[date] = appData.calendar[date];
            }
        }
        appData.calendar = cleanData; // (SỬA) Gán lại
        
        // (SỬA) Đảm bảo links là một mảng
        if (!Array.isArray(appData.links)) {
            appData.links = [];
        }

        localStorage.setItem('myAppData', JSON.stringify(appData)); // (SỬA) Đổi tên key và data
        
        // Đồng bộ lên server (nếu đã đăng ký push)
        syncAppDataToServer().catch(err => console.error('Lỗi đồng bộ ghi chú:', err)); // (SỬA)
    }

    /**
     * Lưu cài đặt (appSettings) vào LocalStorage.
     * Đồng thời, gọi hàm updateSubscriptionSettings() để cập nhật server.
     */
    function saveSettings() {
        localStorage.setItem('myScheduleSettings', JSON.stringify(appSettings));
        updateSubscriptionSettings(); // Cập nhật giờ thông báo lên server
    }

    /**
     * Tải cài đặt từ biến appSettings lên giao diện (DOM).
     */
    function loadSettings() {
        notifyTimeNgay.value = appSettings.notifyTimeNgay;
        notifyTimeDem.value = appSettings.notifyTimeDem;
        notifyTimeOff.value = appSettings.notifyTimeOff;
    }

    /**
     * Vẽ toàn bộ lịch (các ô ngày) cho tháng được chọn.
     * @param {Date} date - Một ngày bất kỳ trong tháng cần vẽ.
     */
    function renderCalendar(date) {
        calendarBody.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11

        // Cập nhật tiêu đề (ví dụ: "Tháng 11 2025")
        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;
        
        // Tìm ngày bắt đầu vẽ (có thể thuộc tháng trước)
        const firstDayOfMonth = new Date(year, month, 1);
        let firstDayOfWeek = firstDayOfMonth.getDay(); // 0=CN, 1=T2, ...
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; // Chuyển 0(CN) -> 7

        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1)); // Lùi về T2

        const todayStr = getLocalDateString(new Date());

        // Vẽ 42 ô (6 tuần)
        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = "bg-white rounded-lg p-1 sm:p-2 min-h-[80px] sm:min-h-[100px] flex flex-col justify-start relative cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200";
            
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateStr = getLocalDateString(currentDate); // "YYYY-MM-DD"
            const day = currentDate.getDate();
            
            // --- Hiển thị Ngày Dương & Âm ---
            const dayWrapper = document.createElement('div');
            dayWrapper.className = "flex justify-between items-baseline flex-nowrap gap-1"; 
            
            const dayNumberEl = document.createElement('span'); // Ngày Dương
            dayNumberEl.className = 'day-number font-semibold text-sm sm:text-lg text-gray-800'; 
            dayNumberEl.textContent = day;
            dayWrapper.appendChild(dayNumberEl); 

            // (ĐÃ CẬP NHẬT) Sử dụng hàm import
            const lunarDate = convertSolarToLunar(day, currentDate.getMonth() + 1, currentDate.getFullYear());
            const lunarDayEl = document.createElement('span'); // Ngày Âm
            lunarDayEl.className = "day-lunar-date text-gray-500 flex-shrink-0";
            
            let lunarText;
            if (lunarDate.day === 1) { // Mùng 1
                lunarText = `${lunarDate.day}/${lunarDate.month}`; // Hiển thị cả tháng
                lunarDayEl.classList.add("font-bold", "text-red-600"); 
            } else {
                lunarText = lunarDate.day;
            }
            if (lunarDate.isLeap) {
                lunarText += "N"; // Thêm "N" (Nhuận)
            }
            lunarDayEl.textContent = lunarText;
            dayWrapper.appendChild(lunarDayEl); 
            dayCell.appendChild(dayWrapper); 
            
            dayCell.dataset.date = dateStr; 

            // --- Xử lý logic cho ô ---
            if (currentDate.getMonth() !== month) {
                // Ô thuộc tháng khác (làm mờ đi)
                dayCell.classList.add('other-month', 'bg-gray-50', 'opacity-70', 'cursor-default'); 
                dayCell.classList.remove('hover:bg-gray-50', 'cursor-pointer');
                dayNumberEl.classList.add('text-gray-400'); 
                dayNumberEl.classList.remove('text-gray-800');
                lunarDayEl.className = "day-lunar-date text-gray-400 flex-shrink-0";
            } else {
                // Ô thuộc tháng hiện tại
                // (ĐÃ CẬP NHẬT) Sử dụng hàm import
                const shift = getShiftForDate(dateStr);
                const notes = appData.calendar[dateStr] || []; // (SỬA) Dùng appData.calendar

                // Hiển thị ca
                if (shift === 'giãn ca') {
                    dayCell.classList.add('bg-yellow-100'); 
                    dayCell.classList.remove('bg-white');
                } else if (shift === 'off') { // "off" là ca nghỉ (logic cũ, không nằm trong pattern)
                    dayCell.classList.add('bg-gray-100'); 
                    dayCell.classList.remove('bg-white');
                } else {
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift text-xs font-bold text-blue-700 bg-blue-100 px-1 sm:px-2 py-0.5 rounded-full self-start mt-1';
                    shiftEl.textContent = shift;
                    dayCell.appendChild(shiftEl);
                }
                
                // Hiển thị ghi chú (nếu có)
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
                
                // Đánh dấu ngày hôm nay
                if (dateStr === todayStr) {
    // Bước 1: Xóa tất cả các màu nền cũ (quan trọng, để ghi đè lên màu 'giãn ca')
    dayCell.classList.remove('bg-white', 'bg-yellow-100', 'bg-gray-100');
    
    // Bước 2: Thêm màu nền và viền cho "hôm nay"
    dayCell.classList.add('today', 'bg-blue-100', 'border-2', 'border-blue-500'); // <-- NỀN XANH NHẠT
    
    // Bước 3: Đổi màu chữ cho dễ đọc
    dayNumberEl.classList.add('text-blue-700', 'font-bold'); // <-- CHỮ XANH ĐẬM
    dayNumberEl.classList.remove('text-gray-800'); // Xóa màu chữ xám
} else if (lunarDate.day === 1) {
                    // Đánh dấu mùng 1 (nếu không phải hôm nay)
                    lunarDayEl.classList.add("text-red-500");
                    lunarDayEl.classList.remove("text-red-600");
                }

                // Gắn sự kiện click để mở modal
                dayCell.addEventListener('click', () => {
                    openNoteModal(dateStr);
                });
            }
            calendarBody.appendChild(dayCell);
        }
        
        // Sau khi vẽ xong lịch, cập nhật bảng tổng kết
        renderMonthlyNoteSummary(date); 
    }

    /**
     * Vẽ bảng "Tổng kết Ghi chú Tháng" ở cuối trang Lịch.
     * @param {Date} date - Một ngày bất kỳ trong tháng cần tổng kết.
     */
    /**
     * (MỚI - Hàm điều khiển)
     * Quyết định vẽ bảng tổng kết theo Ngày hay theo Ghi chú.
     */
    function renderMonthlyNoteSummary(date) {
        if (summaryViewMode === 'byNote') {
            renderSummaryByNote(date);
        } else {
            // Mặc định là 'byDate'
            renderSummaryByDate(date);
        }
    }

    /**
     * (MỚI - Tách ra từ hàm cũ)
     * Vẽ bảng tổng kết GHI CHÚ THEO NGÀY.
     */
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
            const notes = appData.calendar[dateStr] || []; // (SỬA) Dùng appData.calendar

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

    /**
     * (MỚI)
     * Vẽ bảng tổng kết GHI CHÚ THEO NỘI DUNG.
     */
    function renderSummaryByNote(date) {
        const monthlyNoteList = document.getElementById('monthly-note-list');
        if (!monthlyNoteList) return; 

        monthlyNoteList.innerHTML = ''; 
        
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // 1. Tổng hợp dữ liệu: Map<"Nội dung ghi chú", [mảng các ngày]>
        // Ví dụ: "Quang" -> [3, 10, 25]
        const noteAggregation = new Map();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = getLocalDateString(new Date(year, month, day)); 
            const notes = appData.calendar[dateStr] || []; // (SỬA) Dùng appData.calendar

            notes.forEach(noteText => {
                // Chuẩn hóa tên (viết hoa, viết thường như nhau)
                const normalizedNote = noteText.trim();
                
                if (!noteAggregation.has(normalizedNote)) {
                    noteAggregation.set(normalizedNote, []); // Tạo mảng mới
                }
                // Thêm ngày (chỉ số ngày) vào mảng
                noteAggregation.get(normalizedNote).push(day);
            });
        }

        // 2. Sắp xếp theo vần (A-Z)
        const sortedEntries = Array.from(noteAggregation.entries()).sort((a, b) => 
            a[0].localeCompare(b[0], 'vi', { sensitivity: 'base' })
        );

        // 3. Hiển thị
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
                // Cột 1: Tên ghi chú
                const prefixWrapper = document.createElement('div');
                prefixWrapper.className = 'bg-slate-700 rounded-md text-gray-200 text-sm p-2 whitespace-nowrap';
                prefixWrapper.textContent = `${noteText}:`; // "Quang:"
                
                // Cột 2: Danh sách ngày (chỉ số ngày)
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'bg-slate-700 rounded-md text-sm text-gray-200 p-2';
                // Nối các ngày lại: [3, 10, 25] -> "3, 10, 25"
                contentWrapper.textContent = dayList.join(', ');

                monthlyNoteList.appendChild(prefixWrapper);
                monthlyNoteList.appendChild(contentWrapper);
            });
        }
    }

    /**
     * Mở Modal (cửa sổ) để thêm/sửa/xóa ghi chú cho một ngày.
     * @param {string} dateStr - Chuỗi "YYYY-MM-DD" của ngày được chọn.
     */
    function openNoteModal(dateStr) {
        const date = new Date(dateStr + 'T12:00:00'); // Thêm giờ để tránh lỗi timezone
        noteModal.style.display = 'flex'; // Hiển thị modal
        noteModalTitle.textContent = `Cập nhật (${date.toLocaleDateString('vi-VN')})`;
        currentEditingDateStr = dateStr; // Lưu ngày đang sửa
        
        // Hiển thị ca
        // (ĐÃ CẬP NHẬT) Sử dụng hàm import
        const shift = getShiftForDate(dateStr);
        modalShiftInfo.innerHTML = `Ca tự động: <strong>${shift.toUpperCase()}</strong>`;
        
        renderNoteList(dateStr); // Vẽ danh sách ghi chú hiện có
        newNoteInput.value = ''; 
        newNoteInput.focus(); // Tự động focus vào ô nhập
    }

    /**
     * (CẬP NHẬT - VÁ LỖI XSS)
     * Vẽ danh sách ghi chú bên trong Modal.
     * @param {string} dateStr - Chuỗi "YYYY-MM-DD" của ngày đang sửa.
     */
    function renderNoteList(dateStr) {
        noteList.innerHTML = ''; 
        const notes = appData.calendar[dateStr] || []; // (SỬA) Dùng appData.calendar
        
        if (notes.length === 0) {
            noteList.innerHTML = `<li class="text-gray-400 text-sm italic">Không có ghi chú.</li>`;
            return;
        }
        
        notes.forEach((noteText, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-gray-700 p-2 rounded';
            
            // (SỬA LỖI XSS) Dùng .textContent
            const span = document.createElement('span');
            span.className = 'text-gray-100';
            span.textContent = noteText; // AN TOÀN
            li.appendChild(span);

            // (SỬA LỖI XSS) HTML tĩnh (an toàn vì index là số)
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

    /**
     * Lấy VAPID public key từ server.
     * Cần cho việc đăng ký Push.
     */
    async function getVapidPublicKey() {
        try {
            const response = await fetch('/vapid-public-key');
            vapidPublicKey = await response.text();
            console.log("Đã lấy VAPID Public Key.");
        } catch (err) {
            console.error("Lỗi khi lấy VAPID Public Key:", err);
        }
    }

    /**
     * (MỚI) Helper: Lấy endpoint hiện tại (nếu có)
     */
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
    
    /**
     * Kiểm tra trạng thái đăng ký Push (đã bật hay tắt) và cập nhật nút.
     */
    async function checkNotificationStatus() {
        // (SỬA) Thêm kiểm tra pushManager
        if (!swRegistration || !swRegistration.pushManager) {
            console.warn("PushManager không được hỗ trợ hoặc chưa sẵn sàng.");
            return; 
        }
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            console.log("Người dùng đã đăng ký.");
            notifyButton.textContent = "Tắt Thông Báo";
            notifyButton.classList.add('subscribed'); 
            
            // (MỚI) Ẩn cảnh báo
            if (reminderWarning) reminderWarning.classList.add('hidden');
            if (settingsPushWarning) settingsPushWarning.classList.add('hidden');
            
        } else {
            console.log("Người dùng chưa đăng ký.");
            notifyButton.textContent = "Bật Thông Báo";
            notifyButton.classList.remove('subscribed'); 
            
            // (MỚI) Hiển thị cảnh báo
            if (reminderWarning) reminderWarning.classList.remove('hidden');
            if (settingsPushWarning) settingsPushWarning.classList.remove('hidden');
        }
    }

    /**
     * Xử lý sự kiện khi nhấn nút "Bật/Tắt Thông Báo".
     * Bao gồm logic Đăng ký (Subscribe) và Hủy đăng ký (Unsubscribe).
     */
    async function handleSubscribeClick() {
        // (SỬA) Thêm kiểm tra pushManager
        if (!swRegistration || !swRegistration.pushManager || !vapidPublicKey) {
            alert("Service Worker, PushManager, hoặc VAPID Key chưa sẵn sàng. Vui lòng thử lại.");
            return;
        }
        
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        notifyButton.disabled = true; // Vô hiệu hóa nút

        if (existingSubscription) {
            // --- HỦY ĐĂNG KÝ ---
            console.log("Đang hủy đăng ký...");
            try {
                const unsubscribed = await existingSubscription.unsubscribe();
                if (unsubscribed) {
                    // Gửi yêu cầu xóa subscription khỏi DB
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
            // --- ĐĂNG KÝ MỚI ---
            console.log("Đang đăng ký mới...");
            
            // Xin quyền
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert("Đại ca đã từ chối quyền thông báo. Vui lòng bật thủ công trong cài đặt trình duyệt.");
                notifyButton.disabled = false;
                return;
            }

            try {
                // Đăng ký với Push Manager
                // (ĐÃ CẬP NHẬT) Sử dụng hàm import
                const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
                const subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                
                // Lấy cài đặt giờ hiện tại
                const settings = {
                    notifyTimeNgay: notifyTimeNgay.value,
                    notifyTimeDem: notifyTimeDem.value,
                    notifyTimeOff: notifyTimeOff.value
                };
                
                // (SỬA) Lấy dữ liệu (bao gồm cả links)
                const noteData = appData; // (SỬA)
                
                // Gửi subscription, settings, và notes lên server
                await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        subscription: subscription, 
                        settings: settings,
                        noteData: noteData // (SỬA) Gửi toàn bộ appData
                    })
                });
                
                console.log("Đã đăng ký và gửi (cả ghi chú và links) lên server.");
                alert("Đã bật thông báo thành công!");

            } catch (err) {
                console.error("Lỗi khi đăng ký push:", err);
                alert("Lỗi khi bật thông báo. Key hoặc Service Worker có vấn đề.");
            }
        }
        
        notifyButton.disabled = false; // Mở lại nút
        checkNotificationStatus(); // Cập nhật lại trạng thái nút
    }

    /**
     * Cập nhật Cài đặt (giờ, ghi chú) lên server BẤT CỨ KHI NÀO CÓ THAY ĐỔI.
     * Chỉ hoạt động nếu người dùng đã đăng ký push.
     */
    async function updateSubscriptionSettings() {
        // (SỬA) Thêm kiểm tra pushManager
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

            const noteData = appData; // (SỬA) Gửi toàn bộ appData
            
            // Gửi lại yêu cầu 'subscribe' (API server sẽ tự xử lý ON CONFLICT)
            await fetch('/subscribe', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscription: subscription, 
                    settings: settings,
                    noteData: noteData // (SỬA)
                })
            });
            console.log("Đã cập nhật settings (và appData) trên server.");
        } catch (err) {
            console.error("Lỗi khi cập nhật settings:", err);
        }
    }

    /**
     * (CẬP NHẬT) Đồng bộ DỮ LIỆU (AppData) lên server (cho máy chủ Push Notification).
     * Được gọi khi lưu ghi chú, hoặc khi mở tab Cài đặt.
     * Chỉ hoạt động nếu đã đăng ký push.
     */
    async function syncAppDataToServer() { // (SỬA) Đổi tên
        // (SỬA) Thêm kiểm tra pushManager
        if (!swRegistration || !swRegistration.pushManager) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (!subscription) {
            return; // Nếu chưa đăng ký thông báo thì không làm gì
        }
        
        console.log("Đang đồng bộ appData (vì có thay đổi) lên server...");
        try {
            const noteData = appData; // (SỬA) Gửi toàn bộ appData
            
            // Chỉ gửi ghi chú (nhanh hơn)
            await fetch('/update-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    endpoint: subscription.endpoint, 
                    noteData: noteData // (SỬA)
                })
            });
            console.log("Đồng bộ appData (cho Push) thành công.");
        } catch (err) {
            console.error("Lỗi khi đồng bộ appData (cho Push):", err);
        }
    }


    // ===================================================================
    // (CẬP NHẬT) PHẦN 2.5: LOGIC NHẮC NHỞ (REMINDERS)
    // ===================================================================

    /**
     * (CẬP NHẬT) Helper: Chuyển đổi chuỗi ISO (hoặc Date object) thành định dạng cho input datetime-local.
     * @param {string | Date} isoString - Chuỗi ISO 8601 (UTC) hoặc Date object.
     * @returns {string} - Chuỗi "YYYY-MM-DDTHH:mm".
     */
    function formatISODateForInput(isoString) {
        if (!isoString) return "";
        
        const date = new Date(isoString); // Tạo Date object (đã ở múi giờ local của trình duyệt)
        
        // (SỬA LỖI TIMEZONE) Lấy các giá trị local, KHÔNG PHẢI UTC
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        // Trả về chuỗi "YYYY-MM-DDTHH:mm"
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /**
     * (CẬP NHẬT) Helper: Lấy thời gian hiện tại cho input datetime-local
     * @returns {string} - Chuỗi "YYYY-MM-DDTHH:mm".
     */
    function getCurrentDateTimeLocal() {
        // (SỬA LỖI TIMEZONE)
        return formatISODateForInput(new Date());
    }


    /**
     * (CẬP NHẬT) Lấy danh sách nhắc nhở từ server và vẽ bảng
     */
    async function fetchReminders() {
        if (!reminderListContainer) return;
        
        reminderListLoading.textContent = "Đang tải...";
        reminderListLoading.classList.remove('hidden');
        reminderListContainer.innerHTML = ''; // Xóa sạch

        try {
            // 1. Lấy endpoint
            if (!swRegistration || !swRegistration.pushManager) { // (SỬA) Kiểm tra cả pushManager
                throw new Error("Service Worker hoặc PushManager chưa sẵn sàng.");
            }
            const subscription = await swRegistration.pushManager.getSubscription();
            
            // ==========================================================
            // ===== (BẮT ĐẦU SỬA) BỎ LỖI, CHỈ DỪNG LẠI ================
            // ==========================================================
            if (!subscription) {
                // (SỬA) Không ném lỗi, chỉ hiển thị cảnh báo (đã được checkNotificationStatus xử lý)
                // và ẩn spinner
                reminderListLoading.classList.add('hidden');
                // (MỚI) Vô hiệu hóa form thêm
                if (newReminderForm) newReminderForm.querySelector('button[type="submit"]').disabled = true;
                return; // Dừng hàm
            }
            
            // (MỚI) Nếu subscription OK, bật lại form
            if (newReminderForm) newReminderForm.querySelector('button[type="submit"]').disabled = false;
            // ==========================================================
            // ===== (KẾT THÚC SỬA) =====================================
            // ==========================================================
            
            // 2. Gọi API
            const response = await fetch('/api/get-reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            const reminders = await response.json();
            if (!response.ok) throw new Error(reminders.error || "Lỗi tải danh sách");

            // 3. Phân nhóm
            const grouped = groupRemindersByMonth(reminders);
            
            // 4. Vẽ
            renderReminderList(grouped);

        } catch (err) {
            reminderListLoading.textContent = `Lỗi: ${err.message}`;
            reminderListLoading.classList.remove('hidden'); 
        }
    }

    /**
     * (CẬP NHẬT) Phân nhóm nhắc nhở theo tháng (YYYY-MM) CỦA NGÀY HẸN (remind_at)
     */
    function groupRemindersByMonth(reminders) {
        const groups = {
            "null": [] // Nhóm mặc định cho các mục chưa có ngày hẹn
        }; 

        reminders.forEach(item => {
            if (item.remind_at) {
                const date = new Date(item.remind_at); // Giờ UTC từ server
                
                // (SỬA LỖI TIMEZONE) Hiển thị tháng dựa trên giờ Local
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                
                if (!groups[monthKey]) {
                    groups[monthKey] = [];
                }
                groups[monthKey].push(item);
            } else {
                // Nếu remind_at là null, cho vào nhóm "null"
                groups["null"].push(item);
            }
        });
        
        return groups;
    }

    /**
     * (CẬP NHẬT - VÁ LỖI XSS)
     * Vẽ toàn bộ danh sách nhắc nhở (đã phân nhóm)
     */
    function renderReminderList(groupedReminders) {
        if (!reminderListContainer) return;
        
        reminderListContainer.innerHTML = ''; // Xóa sạch

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
            
            // Dùng .textContent cho tiêu đề an toàn
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
            
            // (SỬA BỐ CỤC) Vẽ từng item
            items.forEach(item => {
                const li = document.createElement('li');
                
                // (SỬA) <li> bây giờ là flex-col (2 dòng)
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

                // (SỬA LỖI XSS) Tạo 2 hàng bằng DOM
                
                // --- Hàng 1: Nội dung (Click để Sửa) ---
                const divContent = document.createElement('div');
                divContent.className = "reminder-content-clickable bg-gray-700 p-3 rounded-lg cursor-pointer flex-grow overflow-hidden min-w-0";
                
                const spanTitle = document.createElement('span');
                spanTitle.className = `reminder-title ${textClass} font-semibold block truncate`;
                spanTitle.textContent = item.title; // AN TOÀN
                divContent.appendChild(spanTitle);
                
                const spanPreview = document.createElement('span');
                spanPreview.className = "reminder-preview text-gray-400 text-sm block truncate";
                spanPreview.textContent = contentPreview || '(Không có nội dung)'; // AN TOÀN
                divContent.appendChild(spanPreview);
                
                li.appendChild(divContent);

                // --- Hàng 2: Hàng điều khiển (Thời gian, Bật/tắt, Xóa) ---
                const divControls = document.createElement('div');
                divControls.className = "reminder-controls flex items-center justify-between space-x-2 bg-gray-700 p-2 rounded-lg";
                
                // HTML cho Hàng 2 (an toàn vì value và checked là attributes)
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


    /**
     * (MỚI) Hiển thị thông báo trạng thái cho form thêm nhắc nhở
     */
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
    
    /**
     * (CẬP NHẬT) Gọi API cập nhật nhắc nhở (chung cho Bật/Tắt, Đổi ngày/giờ, VÀ NỘI DUNG)
     * @param {string} id - ID của nhắc nhở
     * @param {object} data - Dữ liệu cần cập nhật
     * @param {string} [data.datetimeLocalString] - (Tùy chọn) Giờ local
     * @param {boolean} [data.isActive] - (Tùy chọn) Trạng thái
     * @param {string} [data.title] - (Tùy chọn) Tiêu đề
     * @param {string} [data.content] - (Tùy chọn) Nội dung
     */
    async function updateReminder(id, data) {
        if (!swRegistration || !swRegistration.pushManager) {
            alert("Lỗi PushManager. Không thể cập nhật.");
            return false; // (MỚI) Trả về false nếu lỗi
        }
        const subscription = await swRegistration.pushManager.getSubscription();
        if (!subscription) {
            alert("Không thể xác thực. Vui lòng Bật Thông Báo.");
            return false; // (MỚI) Trả về false nếu lỗi
        }

        // (MỚI) Xây dựng payload
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
            return true; // (MỚI) Trả về true nếu thành công
            
        } catch (err) {
            alert(`Lỗi khi cập nhật: ${err.message}`);
            return false; // (MỚI) Trả về false nếu lỗi
        }
    }


    // ===================================================================
    // (MỚI) PHẦN 2.6: LOGIC LƯU TRỮ LINKS
    // ===================================================================

    /**
     * (MỚI) Hiển thị thông báo trạng thái cho form thêm link
     */
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
    
    /**
     * (MỚI - VÁ LỖI XSS) Vẽ danh sách các link đã lưu
     */
    function renderLinkList() {
        if (!linkListContainer) return;
        
        const links = appData.links || [];
        
        if (links.length === 0) {
            linkListContainer.innerHTML = `<p class="text-gray-400 italic text-center p-4 bg-gray-800 rounded-lg shadow-lg">Chưa có link nào được lưu.</p>`;
            return;
        }
        
        linkListContainer.innerHTML = ''; // Xóa
        
        // Sắp xếp link mới nhất lên đầu
        [...links].reverse().forEach((link, index) => {
            const originalIndex = links.length - 1 - index; // Tìm index gốc
            
            const li = document.createElement('div');
            li.className = "bg-gray-800 rounded-lg shadow-lg p-4 flex items-center justify-between space-x-3";
            
            // (SỬA LỖI XSS) Tạo DOM an toàn
            const divContent = document.createElement('div');
            divContent.className = "flex-grow min-w-0";
            
            const aLink = document.createElement('a');
            
            // (SỬA LỖI XSS) Chặn 'javascript:' URLs
            let safeUrl = link.url;
            // Tự động thêm https:// nếu thiếu
            if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://') && !safeUrl.startsWith('mailto:') && !safeUrl.startsWith('tel:')) {
                safeUrl = `https://${safeUrl}`; 
            }
            // Kiểm tra lại lần nữa, nếu người dùng cố tình gõ 'javascript:...'
            if (safeUrl.toLowerCase().startsWith('javascript:')) { 
                safeUrl = '#'; // Vô hiệu hóa nếu là javascript:
            }
            
            aLink.href = safeUrl;
            aLink.target = "_blank";
            aLink.rel = "noopener noreferrer";
            aLink.className = "block text-blue-400 font-semibold truncate hover:underline";
            aLink.textContent = link.url; // AN TOÀN
            divContent.appendChild(aLink);
            
            const pNote = document.createElement('p');
            pNote.className = "text-gray-300 text-sm mt-1 truncate";
            pNote.textContent = link.note || '(Không có ghi chú)'; // AN TOÀN
            divContent.appendChild(pNote);
            
            li.appendChild(divContent);

            // Nút Xóa (an toàn vì index là số)
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
    // PHẦN 3: LOGIC ADMIN (ĐĂNG NHẬP, XEM, XÓA)
    // ===================================================================
    
    // ... (Toàn bộ PHẦN 3 giữ nguyên, không thay đổi) ...

    /**
     * Tải bảng điều khiển Admin (lấy danh sách user) sau khi đăng nhập thành công.
     */
    async function loadAdminPanel() {
        if (!currentAdminCreds) return;
        
        // Ẩn các fieldset cũ
        document.querySelector('#settings-main fieldset:nth-of-type(1)').classList.add('hidden'); // Push
        document.querySelector('#settings-main fieldset:nth-of-type(2)').classList.add('hidden'); // Sync
        
        // Hiện panel admin
        adminPanel.classList.remove('hidden');
        adminUserList.classList.add('hidden');
        adminUserLoading.classList.remove('hidden');
        
        try {
            // Gọi API lấy danh sách user
            const response = await fetch('/api/admin/get-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentAdminCreds) // Gửi { adminUser, adminPass }
            });
            
            const users = await response.json();
            if (!response.ok) throw new Error(users.error || 'Lỗi không xác định');

            // Hiển thị danh sách
            adminUserListBody.innerHTML = '';
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = user.is_admin ? 'bg-gray-800' : ''; // Tô đậm Admin khác
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
            adminLogout(); // Đăng xuất nếu có lỗi
        }
    }
    
    /**
     * Đăng xuất khỏi chế độ Admin.
     */
    function adminLogout() {
        currentAdminCreds = null;
        // Ẩn panel admin
        adminPanel.classList.add('hidden');
        // Hiện lại các fieldset cũ
        document.querySelector('#settings-main fieldset:nth-of-type(1)').classList.remove('hidden'); // Push
        document.querySelector('#settings-main fieldset:nth-of-type(2)').classList.remove('hidden'); // Sync
        // Xóa mật khẩu
        syncPasswordInput.value = '';
    }

    /**
     * (Admin) Xem ghi chú của một người dùng cụ thể.
     * @param {string} targetUser - Tên người dùng cần xem.
     */
    async function adminViewNotes(targetUser) {
        if (!currentAdminCreds) return;
        
        adminNoteViewerTitle.textContent = `Ghi chú của: ${targetUser}`;
        adminNoteViewerContent.innerHTML = `<p class="text-gray-400">Đang tải ghi chú...</p>`;
        adminNoteViewerModal.classList.remove('hidden');
        
        try {
            const payload = {
                ...currentAdminCreds, // { adminUser, adminPass }
                targetUser: targetUser
            };
            
            const response = await fetch('/api/admin/get-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const notes = await response.json();
            if (!response.ok) throw new Error(notes.error || 'Lỗi không xác định');

            // Hiển thị Ghi chú (dạng JSON)
            const formattedNotes = JSON.stringify(notes, null, 2); // Định dạng JSON cho dễ đọc
            adminNoteViewerContent.innerHTML = `<pre class="whitespace-pre-wrap text-white text-sm">${formattedNotes}</pre>`;

        } catch (err) {
             adminNoteViewerContent.innerHTML = `<p class="text-red-400">Lỗi: ${err.message}</p>`;
        }
    }
    
    /**
     * (Admin) Xóa một người dùng.
     * @param {string} targetUser - Tên người dùng cần xóa.
     */
    async function adminDeleteUser(targetUser) {
        if (!currentAdminCreds) return;

        if (!confirm(`ĐẠI CA ADMIN!\n\nĐại ca có chắc chắn muốn XÓA VĨNH VIỄN người dùng "${targetUser}" không?\n\nHành động này không thể hoàn tác.`)) {
            return;
        }

        try {
            const payload = {
                ...currentAdminCreds, // { adminUser, adminPass }
                targetUser: targetUser
            };
            
            const response = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Lỗi không xác định');
            
            alert(result.message); // Thông báo thành công
            loadAdminPanel(); // Tải lại danh sách
            
        } catch (err) {
            alert(`Lỗi khi xóa: ${err.message}`);
        }
    }

    // ===================================================================
    // (CẬP NHẬT) PHẦN 4: LOGIC ĐIỀU HƯỚNG (TAB)
    // ===================================================================
    
    let currentTab = 'news'; // Theo dõi tab hiện tại
    
    /**
     * (MỚI) Chuyển đổi Sub-Tab bên trong trang Lịch.
     * @param {'work' | 'reminders'} subTabName - Tên sub-tab.
     */
    async function showCalendarSubTab(subTabName) {
        if (subTabName === currentCalendarSubTab) return; // Không làm gì
        currentCalendarSubTab = subTabName;
        
        if (subTabName === 'reminders') {
            // --- Chuyển sang Nhắc Nhở ---
            calendarWorkContent.classList.add('hidden');
            calendarRemindersContent.classList.remove('hidden');
            calSubtabWork.classList.remove('active');
            calSubtabReminders.classList.add('active');
            
            // (MỚI) Chạy logic của tab Nhắc nhở cũ
            await checkNotificationStatus(); 
            await fetchReminders(); 

        } else {
            // --- Chuyển sang Lịch Làm Việc (mặc định) ---
            calendarWorkContent.classList.remove('hidden');
            calendarRemindersContent.classList.add('hidden');
            calSubtabWork.classList.add('active');
            calSubtabReminders.classList.remove('active');
            
            // (MỚI) Cần vẽ lại lịch và tổng kết
            renderCalendar(currentViewDate);
        }
    }

    /**
     * Chuyển đổi giữa các tab (Trang) của ứng dụng.
     * @param {'news' | 'calendar' | 'chat' | 'links' | 'settings'} tabName - Tên tab cần chuyển đến.
     */
    async function showTab(tabName) { // (SỬA) Chuyển thành async
        if (tabName === currentTab) return; // Không làm gì nếu đã ở tab đó
        
        // --- Dọn dẹp tab cũ ---
        if (currentTab === 'chat') {
            resetChat(); // Reset chat nếu rời khỏi tab chat
        }
        if (currentTab === 'settings' && currentAdminCreds) {
            adminLogout(); // Tự động logout admin nếu rời tab settings
        }
        
        currentTab = tabName;
        
        // ===== (SỬA LỖI BỐ CỤC) Xử lý padding cho thanh Navibar dưới =====
        document.body.style.paddingBottom = '80px';

        // 1. Ẩn tất cả các trang
        newsMain.classList.add('hidden');
        calendarMain.classList.add('hidden');
        chatMain.classList.add('hidden');
        linksMain.classList.add('hidden'); // (MỚI)
        settingsMain.classList.add('hidden');
        
        // 2. Tắt active tất cả các nút (Desktop & Mobile)
        if (newsTabBtn) newsTabBtn.classList.remove('active');
        if (calendarTabBtn) calendarTabBtn.classList.remove('active');
        if (settingsBtn) settingsBtn.classList.remove('active');
        bottomTabNews.classList.remove('active');
        bottomTabCalendar.classList.remove('active');
        bottomTabChat.classList.remove('active');
        bottomTabLinks.classList.remove('active'); // (MỚI)
        bottomTabSettings.classList.remove('active');
        
        // 3. (CẬP NHẬT) Ẩn/Hiện các thành phần Header Mobile
        // Ẩn tất cả theo mặc định
        if (rssMenuBtn) rssMenuBtn.classList.add('hidden');
        if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.add('hidden');
        if (mobileHeaderTitle) mobileHeaderTitle.classList.add('hidden');
        if (calendarSubtabHeader) calendarSubtabHeader.classList.add('hidden');
        
        // 4. Ẩn nút Chat FAB (desktop)
        chatFab.classList.add('hidden'); // (Biến này có thể không có trong HTML)

        // 5. Xử lý hiển thị tab
        switch (tabName) {
            case 'news':
                newsMain.classList.remove('hidden');
                if (newsTabBtn) newsTabBtn.classList.add('active');
                bottomTabNews.classList.add('active');
                
                // (CẬP NHẬT) Hiển thị Header cho Tin tức
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
                
                // (CẬP NHẬT) Hiển thị Header cho Lịch (Tiêu đề)
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Lịch & Nhắc Nhở";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                // (SỬA) Thanh sub-tab đã nằm trong 'calendarMain' nên sẽ tự hiển thị
                
                // (MỚI) Khi mở tab Lịch, luôn reset về sub-tab 'work'
                showCalendarSubTab('work'); 
                break;
            
            case 'chat':
                chatMain.classList.remove('hidden');
                bottomTabChat.classList.add('active');
                
                // (CẬP NHẬT) Hiển thị Header cho Chat
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Trò chuyện";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                break;
            
            // (MỚI) THÊM CASE CHO LƯU TRỮ
            case 'links':
                linksMain.classList.remove('hidden');
                bottomTabLinks.classList.add('active');
                
                // Hiển thị Header
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Lưu Trữ";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                renderLinkList(); // (MỚI) Vẽ danh sách link khi mở tab
                break;
            // KẾT THÚC CASE LƯU TRỮ
                
            case 'settings':
                settingsMain.classList.remove('hidden');
                await checkNotificationStatus(); // (MỚI) Kiểm tra quyền
                await syncAppDataToServer(); // (SỬA) Ép đồng bộ khi mở tab Cài đặt
                
                if (settingsBtn) settingsBtn.classList.add('active');
                bottomTabSettings.classList.add('active');
                
                // (CẬP NHẬT) Hiển thị Header cho Cài đặt
                if (mobileHeaderTitle) {
                    mobileHeaderTitle.textContent = "Cài đặt";
                    mobileHeaderTitle.classList.remove('hidden');
                }
                break;
        }
        
        // 7. Luôn đóng menu RSS khi chuyển tab
        rssMobileMenu.classList.add('hidden');
    }


    // ===================================================================
    // (CẬP NHẬT) PHẦN 5: GẮN SỰ KIỆN (EVENT LISTENERS) & KHỞI ĐỘNG
    // ===================================================================
    
    // ----- KHỐI SỰ KIỆN 1: TAB VÀ ĐIỀU HƯỚNG -----
    
    // Desktop (Header)
    if (newsTabBtn) newsTabBtn.addEventListener('click', () => showTab('news'));
    if (calendarTabBtn) calendarTabBtn.addEventListener('click', () => showTab('calendar'));
    if (settingsBtn) settingsBtn.addEventListener('click', () => showTab('settings'));
    if (chatFab) chatFab.addEventListener('click', () => showTab('chat')); 
    
    // Mobile (Bottom Nav)
    bottomTabNews.addEventListener('click', () => showTab('news'));
    bottomTabCalendar.addEventListener('click', () => showTab('calendar'));
    bottomTabChat.addEventListener('click', () => showTab('chat'));
    bottomTabLinks.addEventListener('click', () => showTab('links')); // (MỚI)
    bottomTabSettings.addEventListener('click', () => showTab('settings'));
    
    // Mobile (Top Header)
    if (rssMenuBtn) rssMenuBtn.addEventListener('click', () => rssMobileMenu.classList.toggle('hidden'));

    /**
     * Xử lý sự kiện nhấn nút Tải lại (Refresh) tin tức.
     */
    function handleRefreshClick() {
        console.log("Đang yêu cầu tải lại...");
        const activeButton = feedNav.querySelector('.feed-button.active');
        if (activeButton) {
            const rssUrl = activeButton.dataset.rss;
            const sourceName = activeButton.dataset.source;
            fetchRSS(rssUrl, sourceName, { display: true, force: true }); // force = true
        }
        rssMobileMenu.classList.add('hidden'); 
    }
    
    // ----- KHỐI SỰ KIỆN 2: TIN TỨC & CHAT (KHỞI ĐỘNG) -----
    (async () => {
        // ... (Giữ nguyên toàn bộ khối sự kiện 2) ...
        // Feed (Desktop & Mobile)
        feedNav.addEventListener('click', handleFeedButtonClick);
        rssMobileMenu.addEventListener('click', handleFeedButtonClick); 
        
        // Nút Tải lại (Desktop & Mobile)
        refreshFeedButton.addEventListener('click', handleRefreshClick);
        refreshFeedButtonMobile.addEventListener('click', handleRefreshClick); 

        // Tải feed mặc định
        const defaultFeed = feedNav.querySelector('.feed-button.active');
        if (defaultFeed) {
            await fetchRSS(defaultFeed.dataset.rss, defaultFeed.dataset.source);
        }
        // Tải ngầm các feed khác
        setTimeout(prewarmCache, 0);

        // Nút đóng Modal Tóm tắt
        closeSummaryModalButton.addEventListener('click', () => {
             summaryModal.classList.add('hidden');
             if (summaryEventSource) { // Dừng stream nếu đang chạy
                 summaryEventSource.close();
                 summaryEventSource = null;
             }
        });
        // Click bên ngoài Modal Tóm tắt
         summaryModal.addEventListener('click', (e) => {
             if (e.target === summaryModal) {
                  summaryModal.classList.add('hidden');
                  if (summaryEventSource) {
                      summaryEventSource.close();
                      summaryEventSource = null;
                  }
             }
         });
         
         // Nút đóng Toast
         toastCloseButton.addEventListener('click', (e) => {
             e.stopPropagation(); // Ngăn sự kiện click của toast
             hideToast();
         });
         
        // Gửi Chat
        chatForm.addEventListener('submit', handleSendChat);

        
    })();
    
    // ----- (CẬP NHẬT) KHỐI SỰ KIỆN 3: LỊCH, CÀI ĐẶT, SYNC, ADMIN (KHỞI ĐỘNG) -----
    (async () => {
        // Khởi động Lịch
        renderCalendar(currentViewDate);
        loadSettings();
        
        // ==========================================================
        // ===== TẢI VÀ LƯU THÔNG TIN ĐĂNG NHẬP SYNC (Không đổi) =====
        // ==========================================================
        
        // 1. Tải Tên/Mật khẩu đã lưu khi khởi động
        if (syncUsernameInput) {
            syncUsernameInput.value = localStorage.getItem('syncUsername') || '';
        }
        if (syncPasswordInput) {
            syncPasswordInput.value = localStorage.getItem('syncPassword') || '';
        }

        // 2. Lưu Tên/Mật khẩu khi người dùng thay đổi chúng
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
        
        // --- Cài đặt (Không đổi) ---
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

        // --- (MỚI) Lịch (Sub-tab) ---
        calSubtabWork.addEventListener('click', () => showCalendarSubTab('work'));
        calSubtabReminders.addEventListener('click', () => showCalendarSubTab('reminders'));

        // --- Lịch (Tháng) (Không đổi) ---
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
         
        // --- Lịch (Modal Ghi chú) (CẬP NHẬT) ---
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
            
            if (!Array.isArray(appData.calendar[currentEditingDateStr])) { // (SỬA)
                appData.calendar[currentEditingDateStr] = []; // (SỬA)
            }
            appData.calendar[currentEditingDateStr].push(noteText); // (SỬA)
            
            saveAppData(); // (SỬA)
            renderNoteList(currentEditingDateStr); 
            renderCalendar(currentViewDate); 
            newNoteInput.value = ''; 
        });
        
        noteList.addEventListener('click', (e) => {
            const target = e.target;
            const index = target.dataset.index;
            if (!currentEditingDateStr || index === undefined) return;
            
            const notes = appData.calendar[currentEditingDateStr] || []; // (SỬA)
            
            if (target.classList.contains('edit-note')) {
                const oldText = notes[index];
                const newText = prompt("Sửa ghi chú:", oldText); 
                if (newText !== null && newText.trim() !== "") {
                    appData.calendar[currentEditingDateStr][index] = newText.trim(); // (SỬA)
                    saveAppData(); // (SỬA)
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
            if (target.classList.contains('delete-note')) {
                if (confirm(`Bạn có chắc muốn xóa ghi chú: "${notes[index]}"?`)) {
                    appData.calendar[currentEditingDateStr].splice(index, 1); // (SỬA)
                    saveAppData(); // (SỬA)
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
        });
        
        // --- Lịch (AI) (CẬP NHẬT) ---
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
                            if (!Array.isArray(appData.calendar[dateStr])) { // (SỬA)
                                appData.calendar[dateStr] = []; // (SỬA)
                            }
                            appData.calendar[dateStr].push(noteText); // (SỬA)
                        }
                    });
                    saveAppData(); // (SỬA)
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

        // ==========================================================
        // ===== (CẬP NHẬT) LISTENER SYNC-UP (Gửi AppData) =========
        // ==========================================================
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
                            noteData: appData, // (SỬA) Gửi toàn bộ appData
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
        
        // ==========================================================
        // ===== (CẬP NHẬT) LISTENER SYNC-DOWN (Nhận AppData) ======
        // ==========================================================
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
                    
                    // (SỬA) Chuẩn hóa dữ liệu tải về
                    appData = normalizeAppData(downloadedData); 
                    
                    saveAppData(); // (SỬA)
                    renderCalendar(currentViewDate); // Tải lại lịch
                    
                    // (SỬA) Tải lại tab hiện tại nếu là 'links' hoặc 'calendar'
                    if (currentTab === 'calendar') {
                        // Tải lại sub-tab hiện tại
                        const subTabToReload = currentCalendarSubTab;
                        currentCalendarSubTab = null; // Buộc tải lại
                        showCalendarSubTab(subTabToReload);
                    } else if (currentTab === 'links') {
                        renderLinkList(); // Tải lại danh sách link
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
        
        // --- Admin (Không đổi) ---
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

        // ==========================================================
        // ===== (CẬP NHẬT) KHỐI SỰ KIỆN CHO NHẮC NHỞ (Không đổi) =====
        // (DOM ID vẫn giữ nguyên nên các listener này vẫn hoạt động)
        // ==========================================================

        // --- (CẬP NHẬT) 1. Thêm nhắc nhở mới ---
        if (newReminderForm) {
            newReminderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                // (SỬA) Lấy title và content
                const title = newReminderTitle.value.trim();
                const content = newReminderContent.value.trim();
                
                if (!title) { // (SỬA)
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
                        body: JSON.stringify({ // (SỬA)
                            endpoint: subscription.endpoint,
                            title: title,
                            content: content
                        })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);

                    showReminderStatus('Thêm thành công!', false);
                    newReminderTitle.value = ''; // (SỬA)
                    newReminderContent.value = ''; // (SỬA)
                    
                    await fetchReminders();

                } catch (err) {
                    showReminderStatus(`Lỗi: ${err.message}`, true);
                }
            });
        }
        
        // --- (CẬP NHẬT) 2. Xử lý click trong danh sách (Mở Modal + Xóa) ---
        if (reminderListContainer) {
            reminderListContainer.addEventListener('click', async (e) => {
                const item = e.target.closest('.reminder-item');
                if (!item) return;

                // --- Xử lý nút Xóa (trong item) ---
                const deleteBtn = e.target.closest('.reminder-delete-btn');
                if (deleteBtn) {
                    // (SỬA) Ngăn modal mở
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
                            const list = item.closest('.reminder-list'); // 1. TÌM CHA TRƯỚC (list = hợp lệ)
                            item.remove(); // 2. XÓA SAU
                        // 3. Kiểm tra (Thêm 'list &&' để đảm bảo an toàn)
                            if (list && list.children.length === 0) { 
                            list.closest('.reminder-month-group').remove();
                        }
                        
                    } catch (err) {
                        alert(`Lỗi khi xóa: ${err.message}`);
                        item.style.opacity = '1'; 
                    }
                    return; // Dừng
                }
                
                // --- (SỬA) Xử lý Mở Modal Edit ---
                // (SỬA) Chỉ mở modal nếu click vào box nội dung
                const contentBoxClick = e.target.closest('.reminder-content-clickable');
                
                if (contentBoxClick) { 
                    // Lấy dữ liệu từ dataset CỦA ITEM (LI)
                    const id = item.dataset.id;
                    const title = item.dataset.title;
                    const content = item.dataset.content;
                    const dtValue = item.dataset.datetime;
                    const isActive = item.dataset.active === 'true'; // Chuyển chuỗi sang boolean

                    // Mở Modal
                    editReminderId.value = id;
                    editReminderTitle.value = title;
                    editReminderContent.value = content;
                    editReminderDatetime.value = dtValue;
                    editReminderActive.checked = isActive;
                    
                    reminderEditModal.classList.remove('hidden');
                }
                // Nếu không click vào contentBox (mà click vào toggle, delete, or empty space)
                // thì không làm gì cả (click handler sẽ tự kết thúc).
            });
            
            // --- (CẬP NHẬT) 3. Xử lý Bật/Tắt (Event Delegation) ---
            reminderListContainer.addEventListener('change', async (e) => {
                const target = e.target;
                
                if (target.classList.contains('reminder-toggle-check')) {
                    const item = target.closest('.reminder-item');
                    if (!item) return;

                    const id = item.dataset.id;
                    // (SỬA) Tìm input thời gian trong box điều khiển
                    const timeInput = item.querySelector('.reminder-datetime-input');
                    // (SỬA) Tìm tiêu đề trong box nội dung
                    const textSpan = item.querySelector('.reminder-title'); 
                    const isActive = target.checked;

                    if (isActive && !timeInput.value) {
                        alert("Đại ca phải chọn ngày giờ trước khi bật!");
                        target.checked = false; 
                        return; 
                    }
                    
                    textSpan.classList.toggle('text-white', isActive);
                    textSpan.classList.toggle('text-gray-400', !isActive);

                    // (SỬA) Gọi API
                    const success = await updateReminder(id, {
                        datetimeLocalString: timeInput.value,
                        isActive: isActive
                    });
                    
                    // (SỬA) Chỉ tải lại nếu lỗi (để khôi phục)
                    if (!success) {
                        await fetchReminders();
                    } else {
                        // (MỚI) Cập nhật lại dataset
                        item.dataset.active = isActive.toString();
                        item.dataset.datetime = timeInput.value;
                    }
                }
            });
            
            // --- (CẬP NHẬT) 4. Xử lý Đổi giờ (Event Delegation) ---
            reminderListContainer.addEventListener('blur', async (e) => {
                const target = e.target;

                if (target.classList.contains('reminder-datetime-input')) {
                    const item = target.closest('.reminder-item');
                    if (!item) return;

                    const id = item.dataset.id;
                    const timeInput = target; 
                    // (SỬA) Tìm toggle và title ở vị trí mới của chúng
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
                    
                    // (SỬA) Gọi API
                    const success = await updateReminder(id, {
                        datetimeLocalString: timeInput.value,
                        isActive: true
                    });

                    // (SỬA) Chỉ tải lại nếu lỗi
                    if (!success) {
                        await fetchReminders();
                    } else {
                         // (MỚI) Cập nhật lại dataset
                        item.dataset.active = 'true';
                        item.dataset.datetime = timeInput.value;
                        // Tải lại để sắp xếp
                        await fetchReminders();
                    }
                }
            }, true); 
        }

        // --- (MỚI) 5. Xử lý sự kiện cho Modal Edit ---
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

                // Lấy tất cả dữ liệu
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
                
                // (MỚI) Gọi hàm updateReminder với đầy đủ dữ liệu
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
                    await fetchReminders(); // Tải lại toàn bộ
                } else {
                    alert("Lưu thất bại! Vui lòng thử lại.");
                }
            });
        }
        
        // ==========================================================
        // ===== (MỚI) KHỐI SỰ KIỆN CHO TAB LƯU TRỮ (LINKS) =====
        // ==========================================================
        
        // --- Thêm Link mới ---
        if (newLinkForm) {
            newLinkForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const url = newLinkUrl.value.trim();
                const note = newLinkNote.value.trim();
                
                if (!url) {
                    showLinkStatus('Vui lòng nhập đường dẫn URL.', true);
                    return;
                }
                
                // Thêm vào đầu mảng (hoặc cuối mảng)
                appData.links.push({ url, note });
                
                saveAppData(); // Lưu
                renderLinkList(); // Vẽ lại
                
                newLinkUrl.value = '';
                newLinkNote.value = '';
                showLinkStatus('Đã lưu link thành công!', false);
            });
        }
        
        // --- Xóa Link ---
        if (linkListContainer) {
            linkListContainer.addEventListener('click', (e) => {
                const deleteButton = e.target.closest('.delete-link');
                if (deleteButton) {
                    const index = parseInt(deleteButton.dataset.index, 10);
                    if (isNaN(index)) return;
                    
                    const link = appData.links[index];
                    if (confirm(`Đại ca có chắc muốn xóa link này?\n\n${link.url}`)) {
                        appData.links.splice(index, 1); // Xóa
                        saveAppData(); // Lưu
                        renderLinkList(); // Vẽ lại
                    }
                }
            });
        }

    })();
    
    // ----- KHỐI SỰ KIỆN 4: KHỞI ĐỘNG TAB BAN ĐẦU -----
    
    // Kiểm tra URL hash (ví dụ: /#calendar) để mở đúng tab khi tải lại trang
    if (window.location.hash === '#calendar') {
        showTab('calendar');
    } else {
        showTab('news'); // Mặc định là tab Tin tức
    }

}); // --- KẾT THÚC DOMCONTENTLOADED ---
