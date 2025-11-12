/* =================================================================== */
/* FILE: public/app.js                                                 */
/* MỤC ĐÍCH: Logic JavaScript chính cho toàn bộ ứng dụng Ghichu App.     */
/* PHIÊN BẢN: Đã tách logic tính toán sang utils.js                     */
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
    // (MỚI) PHẦN 0: KHAI BÁO BIẾN (DOM ELEMENTS)
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

    // --- Biến Phần 4 (Điều khiển Tab) ---
    const newsTabBtn = document.getElementById('news-tab-btn');
    const calendarTabBtn = document.getElementById('calendar-tab-btn'); // (Lưu ý: Biến này có thể không có trong HTML)
    const settingsBtn = document.getElementById('settings-btn'); // (Lưu ý: Biến này có thể không có trong HTML)
    const mobileHeaderTitle = document.getElementById('mobile-header-title');
    const refreshFeedButton = document.getElementById('refresh-feed-button');
    const refreshFeedButtonMobile = document.getElementById('refresh-feed-button-mobile'); 
    const bottomTabNews = document.getElementById('bottom-tab-news');
    const bottomTabCalendar = document.getElementById('bottom-tab-calendar');
    const bottomTabChat = document.getElementById('bottom-tab-chat');
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
    let summaryViewMode = 'byDate'; // 'byDate' hoặc 'byNote'
    let currentAdminCreds = null; // Lưu trữ thông tin đăng nhập Admin
    let currentEditingDateStr = null; // Ngày đang sửa trong modal
    let currentViewDate = new Date(); // Tháng đang xem trên lịch
    let chatHistory = []; // Lịch sử chat
    let summaryEventSource = null; // Đối tượng stream tóm tắt
    let completedSummary = { title: '', text: '' }; // Tóm tắt đã hoàn thành
    let toastTimeoutId = null; // ID của setTimeout cho toast
    const clientRssCache = new Map(); // Cache RSS phía client
    
    // Đọc dữ liệu từ LocalStorage khi khởi động
    let noteData = JSON.parse(localStorage.getItem('myScheduleNotes')) || {};
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
        
        // ==========================================================
        // ===== (MỚI - GĐ 2) LẤY ENDPOINT ĐỂ GỬI CHO TÈO =====
        // ==========================================================
        let endpoint = null;
        if (swRegistration) {
            try {
                // Lấy thông tin đăng ký push hiện tại
                const subscription = await swRegistration.pushManager.getSubscription();
                if (subscription) {
                    // Lấy endpoint (danh tính duy nhất của thiết bị)
                    endpoint = subscription.endpoint;
                }
            } catch (err) {
                console.warn("Không thể lấy subscription endpoint:", err);
            }
        }
        // ==========================================================

        try {
            // Gửi request lên server
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Gửi cả lịch sử chat VÀ endpoint
                body: JSON.stringify({ 
                    history: chatHistory, 
                    endpoint: endpoint // (MỚI)
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lỗi server: ${errorText}`);
            }
            
            const result = await response.json();
            const answer = result.answer;
            
            // Thêm câu trả lời của AI vào lịch sử
            chatHistory.push({ role: "model", parts: [{ text: answer }] });
            
            // Xóa bubble tải và vẽ lại lịch sử
            chatDisplay.removeChild(loadingBubble);
            renderChatHistory();
            
        } catch (error) {
            console.error("Lỗi khi gọi API chat:", error);
            chatDisplay.removeChild(loadingBubble);
            // Hiển thị bubble lỗi
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
            
            // Tạo thẻ Card
            const card = document.createElement('a');
            card.href = link;
            card.className = "bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 transform hover:scale-[1.03] hover:shadow-blue-500/20 block";
            card.innerHTML = `
                <img src="${imgSrc}" alt="${title}" class="w-full h-48 object-cover" onerror="this.src='https://placehold.co/600x400/374151/9CA3AF?text=Error';">
                <div class="p-5">
                    <span class="text-xs font-semibold text-blue-400">${sourceName}</span>
                    <h3 class="text-lg font-bold text-white mt-2 mb-1 leading-tight line-clamp-2">${title}</h3>
                    <p class="text-sm text-gray-400 mt-2 mb-3 line-clamp-3">${descriptionText}</p>
                    <div class="flex justify-between items-center mt-4">
                        <p class="text-sm text-gray-400">${pubDate ? new Date(pubDate).toLocaleString('vi-VN') : ''}</p>
                        <button class="summary-btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-3 rounded-full transition-all duration-200 z-10 relative">
                            Tóm tắt
                        </button>
                    </div>
                </div>
            `;
            
            // Ngăn thẻ <a> điều hướng khi bấm nút "Tóm tắt"
             card.addEventListener('click', (e) => {
                 if (e.target.closest('.summary-btn')) {
                     return; // Không làm gì cả
                 }
                 // Nếu không phải nút tóm tắt, thẻ <a> sẽ hoạt động bình thường
             });
            
            // Gắn sự kiện cho nút "Tóm tắt"
            const summaryButton = card.querySelector('.summary-btn');
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
     * Lưu dữ liệu ghi chú (noteData) vào LocalStorage.
     * Đồng thời, lọc bỏ các ngày không có ghi chú (dọn rác).
     * Cũng gọi hàm syncNotesToServer() để đồng bộ với máy chủ thông báo.
     */
    function saveNoteData() {
        const cleanData = {};
        // Lọc bỏ các ngày rỗng
        for (const date in noteData) {
            if (Array.isArray(noteData[date]) && noteData[date].length > 0) {
                cleanData[date] = noteData[date];
            }
        }
        localStorage.setItem('myScheduleNotes', JSON.stringify(cleanData));
        
        // Đồng bộ lên server (nếu đã đăng ký push)
        syncNotesToServer().catch(err => console.error('Lỗi đồng bộ ghi chú:', err));
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
                const notes = noteData[dateStr] || []; 

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
            const notes = noteData[dateStr] || []; 

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
            const notes = noteData[dateStr] || []; 

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
     * Vẽ danh sách ghi chú bên trong Modal.
     * @param {string} dateStr - Chuỗi "YYYY-MM-DD" của ngày đang sửa.
     */
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
     * Kiểm tra trạng thái đăng ký Push (đã bật hay tắt) và cập nhật nút.
     */
    async function checkNotificationStatus() {
        if (!swRegistration) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            console.log("Người dùng đã đăng ký.");
            notifyButton.textContent = "Tắt Thông Báo";
            notifyButton.classList.add('subscribed'); // Thêm class 'subscribed' (màu đỏ)
        } else {
            console.log("Người dùng chưa đăng ký.");
            notifyButton.textContent = "Bật Thông Báo";
            notifyButton.classList.remove('subscribed'); // Xóa class 'subscribed'
        }
    }

    /**
     * Xử lý sự kiện khi nhấn nút "Bật/Tắt Thông Báo".
     * Bao gồm logic Đăng ký (Subscribe) và Hủy đăng ký (Unsubscribe).
     */
    async function handleSubscribeClick() {
        if (!swRegistration || !vapidPublicKey) {
            alert("Service Worker hoặc VAPID Key chưa sẵn sàng. Vui lòng thử lại.");
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
                
                // Lấy ghi chú hiện tại
                const noteDataStr = localStorage.getItem('myScheduleNotes') || '{}';
                const noteData = JSON.parse(noteDataStr);
                
                // Gửi subscription, settings, và notes lên server
                await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        subscription: subscription, 
                        settings: settings,
                        noteData: noteData 
                    })
                });
                
                console.log("Đã đăng ký và gửi (cả ghi chú) lên server.");
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
        if (!swRegistration) return;
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

            const noteDataStr = localStorage.getItem('myScheduleNotes') || '{}';
            const noteData = JSON.parse(noteDataStr);
            
            // Gửi lại yêu cầu 'subscribe' (API server sẽ tự xử lý ON CONFLICT)
            await fetch('/subscribe', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscription: subscription, 
                    settings: settings,
                    noteData: noteData 
                })
            });
            console.log("Đã cập nhật settings (và ghi chú) trên server.");
        } catch (err) {
            console.error("Lỗi khi cập nhật settings:", err);
        }
    }

    /**
     * Đồng bộ GHI CHÚ lên server (cho máy chủ Push Notification).
     * Được gọi khi lưu ghi chú, hoặc khi mở tab Cài đặt.
     * Chỉ hoạt động nếu đã đăng ký push.
     */
    async function syncNotesToServer() {
        if (!swRegistration) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (!subscription) {
            return; // Nếu chưa đăng ký thông báo thì không làm gì
        }
        
        console.log("Đang đồng bộ ghi chú (vì có thay đổi) lên server...");
        try {
            const noteDataStr = localStorage.getItem('myScheduleNotes') || '{}';
            const noteData = JSON.parse(noteDataStr);
            
            // Chỉ gửi ghi chú (nhanh hơn)
            await fetch('/update-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    endpoint: subscription.endpoint, 
                    noteData: noteData
                })
            });
            console.log("Đồng bộ ghi chú (cho Push) thành công.");
        } catch (err) {
            console.error("Lỗi khi đồng bộ ghi chú (cho Push):", err);
        }
    }


    // ===================================================================
    // PHẦN 3: LOGIC ADMIN (ĐĂNG NHẬP, XEM, XÓA)
    // ===================================================================
    
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
    // PHẦN 4: LOGIC ĐIỀU HƯỚNG (TAB)
    // ===================================================================
    
    let currentTab = 'news'; // Theo dõi tab hiện tại
    
    /**
     * Chuyển đổi giữa các tab (Trang) của ứng dụng.
     * @param {'news' | 'calendar' | 'chat' | 'settings'} tabName - Tên tab cần chuyển đến.
     */
    function showTab(tabName) {
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
        // =================================================================
        // TẤT CẢ các tab bây giờ đều cần 80px đệm ở dưới
        // để chừa chỗ cho thanh Navibar.
        document.body.style.paddingBottom = '80px';

        // 1. Ẩn tất cả các trang
        newsMain.classList.add('hidden');
        calendarMain.classList.add('hidden');
        chatMain.classList.add('hidden');
        settingsMain.classList.add('hidden');
        
        // 2. Tắt active tất cả các nút (Desktop & Mobile)
        if (newsTabBtn) newsTabBtn.classList.remove('active');
        if (calendarTabBtn) calendarTabBtn.classList.remove('active');
        if (settingsBtn) settingsBtn.classList.remove('active');
        bottomTabNews.classList.remove('active');
        bottomTabCalendar.classList.remove('active');
        bottomTabChat.classList.remove('active');
        bottomTabSettings.classList.remove('active');
        
        // 3. Ẩn các nút header mobile
        if (rssMenuBtn) rssMenuBtn.classList.add('hidden');
        if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.add('hidden');
        
        // 4. Ẩn nút Chat FAB (desktop)
        chatFab.classList.add('hidden'); // (Biến này có thể không có trong HTML)

        // 5. Xử lý hiển thị tab
        switch (tabName) {
            case 'news':
                newsMain.classList.remove('hidden');
                if (newsTabBtn) newsTabBtn.classList.add('active');
                bottomTabNews.classList.add('active');
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Tin Tức";
                // Hiện lại các nút của tab Tin tức
                if (rssMenuBtn) rssMenuBtn.classList.remove('hidden');
                if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.remove('hidden');
                break;
                
            case 'calendar':
                calendarMain.classList.remove('hidden');
                if (calendarTabBtn) calendarTabBtn.classList.add('active');
                bottomTabCalendar.classList.add('active');
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Lịch Làm Việc";
                break;
                
            case 'chat':
                chatMain.classList.remove('hidden');
                bottomTabChat.classList.add('active');
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Trò chuyện";
                break;
                
            case 'settings':
                settingsMain.classList.remove('hidden');
                syncNotesToServer(); // Ép đồng bộ khi mở tab Cài đặt
                
                if (settingsBtn) settingsBtn.classList.add('active');
                bottomTabSettings.classList.add('active');
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Cài đặt";
                break;
        }
        
        // 7. Luôn đóng menu RSS khi chuyển tab
        rssMobileMenu.classList.add('hidden');
    }


    // ===================================================================
    // PHẦN 5: GẮN SỰ KIỆN (EVENT LISTENERS) & KHỞI ĐỘNG
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
    
    // ----- KHỐI SỰ KIỆN 3: LỊCH, CÀI ĐẶT, SYNC, ADMIN (KHỞI ĐỘNG) -----
    (async () => {
        // Khởi động Lịch
        renderCalendar(currentViewDate);
        loadSettings();
        
        // --- Cài đặt ---
        // Thay đổi giờ
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
        // Bật/tắt thông báo
        notifyButton.addEventListener('click', handleSubscribeClick);

        // --- Lịch (Tháng) ---
        prevMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            renderCalendar(currentViewDate);
        });
        nextMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            renderCalendar(currentViewDate);
        });
        // (MỚI) Chuyển đổi chế độ xem tổng kết
        toggleSummaryViewBtn.addEventListener('click', () => {
    // Đảo trạng thái
       if (summaryViewMode === 'byDate') {
        summaryViewMode = 'byNote';
        toggleSummaryViewBtn.textContent = 'Xem theo: Ngày';
       } else {
        summaryViewMode = 'byDate';
        toggleSummaryViewBtn.textContent = 'Xem theo: Ghi chú';
    }
    // Vẽ lại bảng tổng kết với trạng thái mới
    renderMonthlyNoteSummary(currentViewDate);
         });
        // --- Lịch (Modal Ghi chú) ---
        // Đóng modal
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
        
        // Thêm ghi chú mới
        addNoteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const noteText = newNoteInput.value.trim();
            if (!noteText || !currentEditingDateStr) return;
            
            if (!Array.isArray(noteData[currentEditingDateStr])) {
                noteData[currentEditingDateStr] = [];
            }
            noteData[currentEditingDateStr].push(noteText);
            
            saveNoteData(); // Lưu
            renderNoteList(currentEditingDateStr); // Vẽ lại list trong modal
            renderCalendar(currentViewDate); // Vẽ lại lịch (hiển thị chấm)
            newNoteInput.value = ''; 
        });
        
        // Sửa/Xóa ghi chú (dùng Event Delegation)
        noteList.addEventListener('click', (e) => {
            const target = e.target;
            const index = target.dataset.index;
            if (!currentEditingDateStr || index === undefined) return;
            
            const notes = noteData[currentEditingDateStr] || [];
            
            if (target.classList.contains('edit-note')) {
                // SỬA
                const oldText = notes[index];
                const newText = prompt("Sửa ghi chú:", oldText); // Dùng prompt cho nhanh
                if (newText !== null && newText.trim() !== "") {
                    noteData[currentEditingDateStr][index] = newText.trim();
                    saveNoteData(); 
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
            if (target.classList.contains('delete-note')) {
                // XÓA
                if (confirm(`Bạn có chắc muốn xóa ghi chú: "${notes[index]}"?`)) {
                    noteData[currentEditingDateStr].splice(index, 1);
                    saveNoteData(); 
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
        });
        
        // --- Lịch (AI) ---
        cal_aiForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const text = cal_aiInput.value.trim();
            if (!text) return;
            
            // Vô hiệu hóa form
            cal_aiInput.disabled = true;
            cal_aiForm.querySelector('button').disabled = true;
            cal_aiForm.querySelector('button').textContent = "Đang xử lý...";
            
            try {
                // Gọi API AI
                const response = await fetch('/api/calendar-ai-parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                const updates = await response.json(); // Mong đợi 1 mảng
                
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
                    saveNoteData(); // Lưu 1 lần sau khi thêm hết
                    renderCalendar(currentViewDate); 
                    cal_aiInput.value = ''; 
                } else {
                    throw new Error("AI không trả về định dạng mảng.");
                }
            } catch (err) {
                console.error('Lỗi gọi AI API (Lịch):', err);
                alert('Không thể phân tích. Vui lòng kiểm tra lại prompt và API key.');
            }
            
            // Mở lại form
            cal_aiInput.disabled = false;
            cal_aiForm.querySelector('button').disabled = false;
            cal_aiForm.querySelector('button').textContent = "Phân tích";
        });

        // --- Đồng bộ Online (Sync) ---
        if (syncUpBtn) {
            syncUpBtn.addEventListener('click', async () => {
                const username = syncUsernameInput.value.trim();
                const password = syncPasswordInput.value.trim();
                if (!username || !password) {
                    showSyncStatus('Vui lòng nhập Tên và Mật khẩu.', true);
                    return;
                }
                
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
                            noteData: noteData // Dùng biến noteData toàn cục
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

                if (!confirm('HÀNH ĐỘNG NGUY HIỂM!\n\nViệc này sẽ GHI ĐÈ toàn bộ ghi chú hiện tại trên máy này bằng dữ liệu trên server.\n\nĐại ca có chắc chắn muốn tải về?')) {
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
                            password: password 
                        })
                    });
                    
                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.error || 'Lỗi không xác định');
                    }

                    const downloadedNotes = await response.json();
                    
                    // 1. Cập nhật dữ liệu
                    noteData = downloadedNotes || {};
                    // 2. Lưu vào local
                    saveNoteData(); // Hàm này đã bao gồm cả lưu localStorage
                    // 3. Vẽ lại lịch
                    renderCalendar(currentViewDate); 
                    
                    showSyncStatus('Tải về và đồng bộ thành công!', false);
                    
                } catch (err) {
                    showSyncStatus(err.message, true);
                } finally {
                    syncUpBtn.disabled = false;
                    syncDownBtn.disabled = false;
                    if(adminLoginBtn) adminLoginBtn.disabled = false;
                }
            });
        }
        
        // --- Admin ---
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
                    // Chúng ta dùng API 'get-users' để kiểm tra đăng nhập
                    const response = await fetch('/api/admin/get-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(creds)
                    });
                    
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Lỗi không xác định');
                    
                    // Đăng nhập thành công
                    showSyncStatus('Đăng nhập Admin thành công!', false);
                    currentAdminCreds = creds; // Lưu lại thông tin đăng nhập
                    loadAdminPanel(); // Tải bảng admin

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

        // Gắn listener cho các nút trong danh sách (event delegation)
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
        
        // Đóng modal xem ghi chú (Admin)
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

    })();
    
    // ----- KHỐI SỰ KIỆN 4: KHỞI ĐỘNG TAB BAN ĐẦU -----
    
    // Kiểm tra URL hash (ví dụ: /#calendar) để mở đúng tab khi tải lại trang
    if (window.location.hash === '#calendar') {
        showTab('calendar');
    } else {
        showTab('news'); // Mặc định là tab Tin tức
    }

}); // --- KẾT THÚC DOMCONTENTLOADED ---
