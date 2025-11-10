document.addEventListener('DOMContentLoaded', () => {

    let swRegistration = null; 
    let vapidPublicKey = null; 

    // --- ĐĂNG KÝ SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(async reg => {
                console.log('Main Service Worker Registered!', reg);
                swRegistration = reg; 
                
                // Lấy VAPID key ngay sau khi đăng ký
                await getVapidPublicKey();
                
                // Kiểm tra trạng thái thông báo
                checkNotificationStatus();
            })
            .catch(err => console.error('Main Service Worker registration failed:', err));
    }

    // ===================================================================
    // PHẦN 0: KHAI BÁO BIẾN (DOM ELEMENTS)
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
    const chatModal = document.getElementById('chat-modal');
    const closeChatModal = document.getElementById('close-chat-modal');
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
    const settingsModal = document.getElementById('settings-modal'); 
    const closeModalBtn = document.getElementById('close-modal');
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

    // --- Biến Phần 3 (Trò chuyện) ---
    const chatMain = document.getElementById('chat-main'); 

    // --- Biến Phần 4 (Điều khiển Tab) ---
    const newsTabBtn = document.getElementById('news-tab-btn');
    const calendarTabBtn = document.getElementById('calendar-tab-btn');
    const settingsBtn = document.getElementById('settings-btn'); 
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
    
    // Biến tạm để lưu trữ thông tin đăng nhập Admin
    let currentAdminCreds = null;

    // ===================================================================
    // PHẦN 1: LOGIC TIN TỨC (HÀM VÀ BIẾN LOGIC)
    // ===================================================================
    
    // Các icon dùng cho thông báo toast
    const iconSpinner = `<div class="spinner border-t-white" style="width: 24px; height: 24px;"></div>`;
    const iconCheck = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    const iconError = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    // Cache tin tức phía client (trình duyệt)
    const clientRssCache = new Map();
    // Lịch sử chat (lưu tạm thời)
    let chatHistory = [];
    // Biến giữ kết nối streaming tóm tắt
    let summaryEventSource = null;
    // Lưu trữ tóm tắt đã hoàn thành
    let completedSummary = { title: '', text: '' };
    // ID của timeout để ẩn toast
    let toastTimeoutId = null;

    /**
     * Gọi API Gemini ở chế độ streaming để tóm tắt văn bản.
     * Sử dụng EventSource để nhận dữ liệu từng phần.
     * Hiển thị thông báo (toast) khi bắt đầu và khi hoàn thành.
     * @param {string} prompt - Câu lệnh (prompt) chứa nội dung cần tóm tắt.
     * @param {string} title - Tiêu đề của bài viết (để hiển thị khi tóm tắt xong).
     */
    function callGeminiAPIStreaming(prompt, title) {
        // Đóng kết nối cũ nếu có
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
                    // Cộng dồn văn bản
                    currentSummaryText += data.text;
                } else if (data.error) {
                    // Xử lý lỗi từ server
                    console.error("Lỗi từ stream:", data.error);
                    currentSummaryText += `\n\n[Lỗi: ${data.error}]`;
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    showToast("Lỗi tóm tắt", data.error, 'error', null, 5000);
                } else if (data.done) {
                    // Hoàn thành
                    console.log("Stream tóm tắt hoàn thành.");
                    if (summaryEventSource) summaryEventSource.close();
                    summaryEventSource = null;
                    completedSummary = { title: title, text: currentSummaryText };
                    // Hiển thị toast báo sẵn sàng
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
     * Gửi lịch sử trò chuyện hiện tại đến API Chat (Gemini) và nhận phản hồi.
     * Cập nhật giao diện trò chuyện với phản hồi của mô hình hoặc thông báo lỗi.
     */
    async function callChatAPI() {
        // Hiển thị bong bóng "đang tải"
        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'model-bubble';
        loadingBubble.innerHTML = `<div class="spinner border-t-white" style="width: 20px; height: 20px;"></div>`;
        chatDisplay.appendChild(loadingBubble);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
        
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: chatHistory })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lỗi server: ${errorText}`);
            }
            
            const result = await response.json();
            const answer = result.answer;
            // Thêm phản hồi của model vào lịch sử
            chatHistory.push({ role: "model", parts: [{ text: answer }] });
            // Xóa bong bóng tải
            chatDisplay.removeChild(loadingBubble);
            // Vẽ lại toàn bộ lịch sử chat
            renderChatHistory();
        } catch (error) {
            console.error("Lỗi khi gọi API chat:", error);
            chatDisplay.removeChild(loadingBubble);
            // Hiển thị bong bóng lỗi
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
     * Tải và hiển thị tin tức từ một nguồn RSS.
     * Sử dụng cache phía client để tránh gọi lại API nếu không cần thiết.
     * @param {string} rssUrl - URL của nguồn RSS.
     * @param {string} sourceName - Tên của nguồn (ví dụ: 'VnExpress').
     * @param {object} [options] - Các tùy chọn.
     * @param {boolean} [options.display=true] - Có hiển thị kết quả lên grid hay không.
     * @param {boolean} [options.force=false] - Có buộc tải lại (xóa cache) hay không.
     */
    async function fetchRSS(rssUrl, sourceName, { display = true, force = false } = {}) {
        if (display) {
            loadingSpinner.classList.remove('hidden');
            newsGrid.innerHTML = '';
        }
        
        // Xóa cache nếu bị buộc tải lại
        if (force) {
            clientRssCache.delete(rssUrl);
            console.log(`[CACHE] Đã xóa ${rssUrl} do yêu cầu Tải lại.`);
        }
        
        // Sử dụng cache nếu có
        if (clientRssCache.has(rssUrl)) {
            if (display) {
                displayArticles(clientRssCache.get(rssUrl), sourceName);
                loadingSpinner.classList.add('hidden');
            }
            return;
        }
        
        try {
            // Gọi proxy RSS của server
            const response = await fetch(`/get-rss?url=${encodeURIComponent(rssUrl)}`);
            if (!response.ok) throw new Error('Lỗi server (RSS)');
            
            const str = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(str, "text/xml");
            
            if (xmlDoc.getElementsByTagName("parsererror").length) throw new Error("Lỗi phân tích XML");
            
            // Xử lý cả <item> (RSS) và <entry> (Atom)
            let items;
            const itemNodes = xmlDoc.querySelectorAll("item");
            if (itemNodes.length === 0) {
                const entryNodes = xmlDoc.querySelectorAll("entry");
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
     * Hiển thị danh sách các bài báo lên giao diện (newsGrid).
     * @param {Element[]} items - Mảng các phần tử <item> hoặc <entry> từ XML.
     * @param {string} sourceName - Tên của nguồn tin.
     */
    function displayArticles(items, sourceName) {
        newsGrid.innerHTML = '';
        items.forEach(item => {
            const title = item.querySelector("title")?.textContent || "Không có tiêu đề";
            // Lấy mô tả (description, summary, content)
            let description = item.querySelector("description")?.textContent || item.querySelector("summary")?.textContent || item.querySelector("content")?.textContent || "";
            // Lấy link
            let link = item.querySelector("link")?.textContent || "#";
            if (link === "#" && item.querySelector("link")?.hasAttribute("href")) {
                link = item.querySelector("link")?.getAttribute("href") || "#";
            }
            const pubDate = item.querySelector("pubDate")?.textContent || item.querySelector("updated")?.textContent || "";
            
            // Xử lý HTML trong mô tả để lấy ảnh và text
            const descParser = new DOMParser();
            const descDoc = descParser.parseFromString(`<!doctype html><body>${description}`, 'text/html');
            const img = descDoc.querySelector("img");
            const imgSrc = img ? img.src : "https://placehold.co/600x400/374151/9CA3AF?text=Tin+Tuc";
            let descriptionText = descDoc.body.textContent.trim() || "Không có mô tả.";
            
            // Loại bỏ tiêu đề nếu nó bị lặp lại trong mô tả
            if (descriptionText.startsWith(title)) {
                descriptionText = descriptionText.substring(title.length).trim();
            }
            
            // Tạo card HTML
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
                     return; // Không làm gì nếu bấm vào nút
                 }
                 // Nếu không phải nút, thẻ <a> sẽ hoạt động bình thường
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
     * Xử lý sự kiện khi bấm vào một nút chọn nguồn tin (feed).
     * @param {Event} e - Sự kiện click.
     */
    function handleFeedButtonClick(e) {
         const clickedButton = e.target.closest('.feed-button');
         if (!clickedButton || clickedButton.classList.contains('active')) return;
         
         const rssUrl = clickedButton.dataset.rss;
         const sourceName = clickedButton.dataset.source;
         
         // Bỏ active tất cả các nút (cả mobile và desktop)
         document.querySelectorAll('#feed-nav .feed-button, #rss-mobile-menu .feed-button').forEach(btn => btn.classList.remove('active'));
         // Active nút được bấm (cả mobile và desktop)
         document.querySelectorAll(`.feed-button[data-rss="${rssUrl}"]`).forEach(btn => btn.classList.add('active'));
         
         window.scrollTo({ top: 0, behavior: 'smooth' });
         fetchRSS(rssUrl, sourceName);
         
         // Ẩn menu mobile nếu đang mở
         rssMobileMenu.classList.add('hidden'); 
    }

    /**
     * Xử lý sự kiện khi bấm nút "Tóm tắt".
     * @param {string} title - Tiêu đề bài báo.
     * @param {string} description - Mô tả/nội dung bài báo.
     */
    function handleSummaryClick(title, description) {
        if (!description || description === "Không có mô tả.") {
             showToast("Không thể tóm tắt", "Bài viết không có đủ nội dung.", 'error', null, 4000);
            return;
        }
        
        const prompt = `Tóm tắt nội dung sau đây trong khoảng 200 từ:
        Tiêu đề: ${title}
        Nội dung: ${description}`;
        
        // Bắt đầu streaming
        callGeminiAPIStreaming(prompt, title);
        // Hiển thị toast "Đang tóm tắt"
        showToast("Đang tóm tắt...", title.substring(0, 50) + "...", 'loading', null, 5000);
    }

     /**
     * Hiển thị thông báo toast (thông báo nhỏ ở góc).
     * @param {string} mainMessage - Thông báo chính (ví dụ: "Đang tóm tắt...").
     * @param {string} detailMessage - Chi tiết (ví dụ: tiêu đề bài báo).
     * @param {'ready'|'loading'|'error'} [state='ready'] - Trạng thái của toast (ảnh hưởng đến icon và màu sắc).
     * @param {function|null} onClickAction - Hàm sẽ chạy khi bấm vào toast.
     * @param {number|null} autoHideDelay - Tự động ẩn sau bao nhiêu ms (null = không tự ẩn).
     */
     function showToast(mainMessage, detailMessage, state = 'ready', onClickAction, autoHideDelay = null) {
         if (toastTimeoutId) clearTimeout(toastTimeoutId);
         
         toastMainMessage.textContent = mainMessage;
         toastTitle.textContent = detailMessage;
         summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
         
         if (state === 'loading') {
             toastIcon.innerHTML = iconSpinner;
             summaryToast.classList.add('toast-loading'); 
             summaryToast.style.cursor = 'default';
             toastCta.style.display = 'none';
             summaryToast.onclick = null;
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
             summaryToast.onclick = null;
         }
         
         summaryToast.classList.remove('hidden');
         // Dùng timeout nhỏ để kích hoạt transition
         setTimeout(() => summaryToast.classList.add('show'), 50); 
         
         if (autoHideDelay) {
             toastTimeoutId = setTimeout(hideToast, autoHideDelay);
         }
     }

     /**
     * Ẩn thông báo toast.
     */
     function hideToast() {
          if (toastTimeoutId) clearTimeout(toastTimeoutId);
          toastTimeoutId = null;
          summaryToast.classList.remove('show');
          // Chờ transition hoàn tất rồi mới ẩn hẳn
          setTimeout(() => {
              summaryToast.classList.add('hidden');
              summaryToast.classList.remove('toast-loading', 'bg-blue-600', 'bg-red-600');
          }, 300);
          summaryToast.onclick = null;
     }
     
     /**
     * Hiển thị toast đặc biệt báo "Tóm tắt đã sẵn sàng".
     * Khi bấm vào sẽ mở modal chứa nội dung tóm tắt.
     * @param {string} title - Tiêu đề bài báo đã tóm tắt.
     */
     function showSummaryReadyNotification(title) {
          showToast(
              "Tóm tắt đã sẵn sàng!",
              title.substring(0, 50) + "...",
              'ready', 
              () => { 
                  // Gán nội dung vào modal
                  summaryTitleElement.textContent = completedSummary.title;
                  summaryTextElement.textContent = completedSummary.text;
                  // Mở modal
                  summaryModal.classList.remove('hidden');
                  // Ẩn toast
                  hideToast();
              },
              null // Không tự động ẩn
          );
     }

    /**
     * Vẽ lại toàn bộ lịch sử trò chuyện từ biến `chatHistory` lên giao diện.
     */
    function renderChatHistory() {
        chatDisplay.innerHTML = '';
        if (chatHistory.length === 0) {
             // Hiển thị tin nhắn chào mừng mặc định
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
            bubble.style.whiteSpace = "pre-wrap"; // Giữ nguyên định dạng xuống dòng
            bubble.textContent = message.parts[0].text;
            chatDisplay.appendChild(bubble);
        });
        
        // Cuộn xuống dưới cùng
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    /**
     * Xử lý sự kiện khi gửi tin nhắn chat.
     * @param {Event} e - Sự kiện submit form.
     */
    async function handleSendChat(e) {
        e.preventDefault();
        const prompt = chatInput.value.trim();
        if (!prompt) return;
        
        // Thêm tin nhắn của người dùng vào lịch sử
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        renderChatHistory(); // Cập nhật UI ngay lập tức
        chatInput.value = '';
        
        // Gọi API để lấy phản hồi
        await callChatAPI();
    }

    // Ẩn/hiện thanh nav dưới khi mở/đóng bàn phím (trên mobile)
    if (chatInput && bottomNav) {
        chatInput.addEventListener('focus', () => {
            bottomNav.style.display = 'none';
        });
        chatInput.addEventListener('blur', () => {
            setTimeout(() => {
                bottomNav.style.display = 'flex';
            }, 100);
        });
    }

    /**
     * Xóa toàn bộ lịch sử trò chuyện và reset về màn hình chào mừng.
     */
    function resetChat() {
        chatHistory = [];
        renderChatHistory();
    }
    
    /**
     * Tải trước (pre-warm) cache cho các nguồn tin RSS khác
     * (chưa được chọn) để tăng tốc độ chuyển tab.
     */
    function prewarmCache() {
        console.log("[Cache-Warmer] Bắt đầu tải nền các feed khác...");
        const feedsToPrewarm = Array.from(feedNav.querySelectorAll('.feed-button:not(.active)'));
        feedsToPrewarm.forEach(feed => {
            // Gọi fetchRSS nhưng không hiển thị
            fetchRSS(feed.dataset.rss, feed.dataset.source, { display: false });
        });
    }
            
            
    // ===================================================================
    // PHẦN 2: LOGIC LỊCH (HÀM VÀ BIẾN LOGIC)
    // ===================================================================

    // Biến lưu ngày đang được chỉnh sửa trong modal
    let currentEditingDateStr = null;
    // Tải dữ liệu ghi chú từ localStorage
    let noteData = JSON.parse(localStorage.getItem('myScheduleNotes')) || {};
    // Tải cài đặt từ localStorage
    let appSettings = JSON.parse(localStorage.getItem('myScheduleSettings')) || {
        notifyTimeNgay: "06:00",
        notifyTimeDem: "20:00",
        notifyTimeOff: "08:00"
    };
    // Ngày hiện tại đang xem trên lịch
    let currentViewDate = new Date(); 

    // Hằng số cho logic tính ca
    const EPOCH_DAYS = dateToDays('2025-10-26');
    const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];

    /**
     * Hiển thị thông báo trạng thái cho chức năng Đồng bộ Online.
     * @param {string} message - Nội dung thông báo.
     * @param {boolean} [isError=false] - `true` nếu là lỗi (màu đỏ), `false` nếu thành công (màu xanh).
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
            if (syncStatusMsg.textContent === message) { 
                syncStatusMsg.classList.add('hidden');
            }
        }, 5000);
    }

    // ======================================
    // ===== CÁC HÀM QUẢN TRỊ (ADMIN) =====
    // ======================================
    
    /**
     * (Admin) Tải và hiển thị bảng điều khiển quản trị (danh sách người dùng).
     * Chỉ được gọi sau khi đăng nhập admin thành công.
     */
    async function loadAdminPanel() {
        if (!currentAdminCreds) return;
        
        // Ẩn các cài đặt thông thường
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
            adminLogout(); // Đăng xuất nếu có lỗi
        }
    }
    
    /**
     * (Admin) Đăng xuất khỏi chế độ quản trị, quay về cài đặt thông thường.
     */
    function adminLogout() {
        currentAdminCreds = null;
        adminPanel.classList.add('hidden');
        // Hiện lại các cài đặt thông thường
        document.querySelector('#settings-main fieldset:nth-of-type(1)').classList.remove('hidden'); // Push
        document.querySelector('#settings-main fieldset:nth-of-type(2)').classList.remove('hidden'); // Sync
        syncPasswordInput.value = '';
    }

    /**
     * (Admin) Xem nội dung ghi chú (notes) của một người dùng cụ thể.
     * @param {string} targetUser - Tên người dùng muốn xem.
     */
    async function adminViewNotes(targetUser) {
        if (!currentAdminCreds) return;
        
        // Chuẩn bị modal
        adminNoteViewerTitle.textContent = `Ghi chú của: ${targetUser}`;
        adminNoteViewerContent.innerHTML = `<p class="text-gray-400">Đang tải ghi chú...</p>`;
        adminNoteViewerModal.classList.remove('hidden');
        
        try {
            const payload = {
                ...currentAdminCreds, // { adminUser, adminPass }
                targetUser: targetUser
            };
            
            // Gọi API lấy ghi chú
            const response = await fetch('/api/admin/get-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const notes = await response.json();
            if (!response.ok) throw new Error(notes.error || 'Lỗi không xác định');

            // Hiển thị Ghi chú (dạng JSON)
            const formattedNotes = JSON.stringify(notes, null, 2);
            adminNoteViewerContent.innerHTML = `<pre class="whitespace-pre-wrap text-white text-sm">${formattedNotes}</pre>`;

        } catch (err) {
             adminNoteViewerContent.innerHTML = `<p class="text-red-400">Lỗi: ${err.message}</p>`;
        }
    }
    
    /**
     * (Admin) Xóa một người dùng (không phải admin) khỏi cơ sở dữ liệu.
     * @param {string} targetUser - Tên người dùng muốn xóa.
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
            
            // Gọi API xóa user
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

    // ======================================
    // ===== CÁC HÀM LỊCH & GHI CHÚ =====
    // ======================================

    /**
     * Chuyển đổi đối tượng Date thành chuỗi "YYYY-MM-DD".
     * @param {Date} date - Đối tượng Date.
     * @returns {string} Chuỗi ngày tháng.
     */
    function getLocalDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    /**
     * Chuyển đổi chuỗi "YYYY-MM-DD" thành số ngày (epoch days).
     * @param {string} dateStr - Chuỗi ngày tháng.
     * @returns {number} Số ngày.
     */
    function dateToDays(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
    }
    
    /**
     * Lưu dữ liệu ghi chú (noteData) vào localStorage và đồng bộ lên server (nếu đã đăng ký push).
     */
    function saveNoteData() {
        // Dọn dẹp các ngày không có ghi chú
        const cleanData = {};
        for (const date in noteData) {
            if (Array.isArray(noteData[date]) && noteData[date].length > 0) {
                cleanData[date] = noteData[date];
            }
        }
        // Lưu vào localStorage
        localStorage.setItem('myScheduleNotes', JSON.stringify(cleanData));
        
        // Đồng bộ lên server (cho thông báo push)
        syncNotesToServer().catch(err => console.error('Lỗi đồng bộ ghi chú:', err));
    }
    
    /**
     * Lưu cài đặt (appSettings) vào localStorage và cập nhật lên server (nếu đã đăng ký push).
     */
    function saveSettings() {
        localStorage.setItem('myScheduleSettings', JSON.stringify(appSettings));
        // Cập nhật giờ thông báo lên server
        updateSubscriptionSettings();
    }
    
    /**
     * Tính toán ca làm việc ("ngày", "đêm", "giãn ca") cho một ngày cụ thể.
     * @param {string} dateStr - Chuỗi ngày "YYYY-MM-DD".
     * @returns {string} Tên ca.
     */
    function getShiftForDate(dateStr) {
        const currentDays = dateToDays(dateStr);
        const diffDays = currentDays - EPOCH_DAYS;
        const patternIndex = (diffDays % SHIFT_PATTERN.length + SHIFT_PATTERN.length) % SHIFT_PATTERN.length;
        return SHIFT_PATTERN[patternIndex];
    }
    
    /**
     * Tải cài đặt (appSettings) và hiển thị lên các ô input time trong tab Cài đặt.
     */
    function loadSettings() {
        notifyTimeNgay.value = appSettings.notifyTimeNgay;
        notifyTimeDem.value = appSettings.notifyTimeDem;
        notifyTimeOff.value = appSettings.notifyTimeOff;
    }

    // ======================================
    // ===== CÁC HÀM TÍNH LỊCH ÂM =====
    // ======================================
    
    // Dữ liệu Lịch Âm (từ 1900 đến 2050)
    const LUNAR_CAL_DATA = [
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
        0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
        0x14b63
    ];

    /** (Lịch Âm) Lấy số ngày trong tháng âm. */
    function getLunarMonthDays(lunarYear, lunarMonth) {
        if ((LUNAR_CAL_DATA[lunarYear - 1900] & (0x10000 >> lunarMonth)))
            return 30;
        else
            return 29;
    }

    /** (Lịch Âm) Lấy tháng nhuận (0 nếu không có). */
    function getLunarLeapMonth(lunarYear) {
        return (LUNAR_CAL_DATA[lunarYear - 1900] & 0xf);
    }

    /** (Lịch Âm) Lấy số ngày của tháng nhuận. */
    function getLunarLeapDays(lunarYear) {
        if (getLunarLeapMonth(lunarYear) != 0) {
            if ((LUNAR_CAL_DATA[lunarYear - 1900] & 0x10000))
                return 30;
            else
                return 29;
        } else
            return 0;
    }

    /** (Lịch Âm) Lấy tổng số ngày trong năm âm. */
    function getLunarYearDays(lunarYear) {
        let i, sum = 348;
        for (i = 0x8000; i > 0x8; i >>= 1) {
            if ((LUNAR_CAL_DATA[lunarYear - 1900] & i))
                sum += 1;
        }
        return (sum + getLunarLeapDays(lunarYear));
    }

    /**
     * Chuyển đổi ngày Dương lịch sang Âm lịch.
     * @param {number} dd - Ngày (1-31).
     * @param {number} mm - Tháng (1-12).
     * @param {number} yyyy - Năm.
     * @returns {object} { day, month, year, isLeap }
     */
    function convertSolarToLunar(dd, mm, yyyy) {
        // Sử dụng Date.UTC để tránh lỗi múi giờ
        let date = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
        let i, leap = 0, temp = 0;
        let baseDate = new Date(Date.UTC(1900, 0, 31)); 
        // Tính số ngày chênh lệch (offset)
        let offset = (date - baseDate) / 86400000;

        // Tìm năm âm lịch
        for (i = 1900; i < 2050 && offset > 0; i++) {
            temp = getLunarYearDays(i);
            offset -= temp;
        }
        if (offset < 0) {
            offset += temp;
            i--;
        }

        let year = i;
        leap = getLunarLeapMonth(year); 
        let isLeap = false;
        
        // Tìm tháng âm lịch
        for (i = 1; i < 13 && offset > 0; i++) {
            if (leap > 0 && i == (leap + 1) && !isLeap) {
                --i;
                isLeap = true;
                temp = getLunarLeapDays(year); 
            } else {
                temp = getLunarMonthDays(year, i);
            }
            if (isLeap && i == (leap + 1)) isLeap = false;
            offset -= temp;
        }

        if (offset == 0 && leap > 0 && i == leap + 1) {
            if (isLeap) {
                isLeap = false;
            } else {
                isLeap = true;
                --i;
            }
        }
        if (offset < 0) {
            offset += temp;
            --i;
        }

        let month = i;
        // Ngày âm lịch
        let day = Math.floor(offset + 1); 
        
        return { day: day, month: month, year: year, isLeap: isLeap };
    }

    // ======================================
    // ===== CÁC HÀM VẼ GIAO DIỆN LỊCH =====
    // ======================================

    /**
     * Vẽ toàn bộ lịch (các ô ngày) cho một tháng cụ thể.
     * Bao gồm: ngày dương, ngày âm, ca, và ghi chú.
     * @param {Date} date - Một ngày bất kỳ trong tháng cần vẽ.
     */
    function renderCalendar(date) {
        calendarBody.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth(); 

        // Cập nhật tiêu đề (ví dụ: "Tháng 11 2025")
        currentMonthYearEl.textContent = `Tháng ${month + 1} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        
        // Lấy thứ của ngày đầu tiên trong tháng (1=T2, 7=CN)
        let firstDayOfWeek = firstDayOfMonth.getDay();
        if (firstDayOfWeek === 0) firstDayOfWeek = 7; 

        // Tính ngày bắt đầu vẽ (có thể thuộc tháng trước)
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(firstDayOfMonth.getDate() - (firstDayOfWeek - 1));

        const todayStr = getLocalDateString(new Date());

        // Vẽ 42 ô (6 hàng x 7 cột)
        for (let i = 0; i < 42; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = "bg-white rounded-lg p-1 sm:p-2 min-h-[80px] sm:min-h-[100px] flex flex-col justify-start relative cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200";
            
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateStr = getLocalDateString(currentDate);
            const day = currentDate.getDate();
            
            // --- Thêm ngày Dương và Âm ---
            const dayWrapper = document.createElement('div');
            dayWrapper.className = "flex justify-between items-baseline flex-nowrap gap-1"; 
            
            const dayNumberEl = document.createElement('span'); // Ngày dương
            dayNumberEl.className = 'day-number font-semibold text-sm sm:text-lg text-gray-800'; 
            dayNumberEl.textContent = day;
            dayWrapper.appendChild(dayNumberEl); 

            const lunarDate = convertSolarToLunar(day, currentDate.getMonth() + 1, currentDate.getFullYear());
            const lunarDayEl = document.createElement('span'); // Ngày âm
            lunarDayEl.className = "text-xs text-gray-500 flex-shrink-0"; 
            
            let lunarText;
            if (lunarDate.day === 1) {
                lunarText = `${lunarDate.day}/${lunarDate.month}`; // Hiển thị "1/10"
                lunarDayEl.classList.add("font-bold", "text-red-600"); 
            } else {
                lunarText = lunarDate.day; // Chỉ hiển thị ngày "2", "3"...
            }
            if (lunarDate.isLeap) lunarText += "N"; // Thêm "N" nếu nhuận
            
            lunarDayEl.textContent = lunarText;
            dayWrapper.appendChild(lunarDayEl); 
            dayCell.appendChild(dayWrapper); 
            
            dayCell.dataset.date = dateStr; 

            // --- Xử lý cho các ngày không thuộc tháng hiện tại ---
            if (currentDate.getMonth() !== month) {
                dayCell.classList.add('other-month', 'bg-gray-50', 'opacity-70', 'cursor-default'); 
                dayCell.classList.remove('hover:bg-gray-50', 'cursor-pointer');
                dayNumberEl.classList.add('text-gray-400'); 
                dayNumberEl.classList.remove('text-gray-800');
                lunarDayEl.className = "text-xs text-gray-400 flex-shrink-0";
            } else {
                // --- Xử lý cho các ngày thuộc tháng hiện tại ---
                const shift = getShiftForDate(dateStr);
                const notes = noteData[dateStr] || []; 

                // Hiển thị ca
                if (shift === 'giãn ca') {
                    dayCell.classList.add('bg-yellow-100'); 
                    dayCell.classList.remove('bg-white');
                } else if (shift === 'off') {
                    // (Hiện không có ca 'off' trong pattern, nhưng để dự phòng)
                    dayCell.classList.add('bg-gray-100'); 
                    dayCell.classList.remove('bg-white');
                } else {
                    const shiftEl = document.createElement('span');
                    shiftEl.className = 'day-shift text-xs font-bold text-blue-700 bg-blue-100 px-1 sm:px-2 py-0.5 rounded-full self-start mt-1';
                    shiftEl.textContent = shift;
                    dayCell.appendChild(shiftEl);
                }
                
                // Hiển thị ghi chú
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
                    dayCell.classList.add('today', 'border-2', 'border-blue-500'); 
                    dayNumberEl.classList.add('text-blue-600'); 
                    dayNumberEl.classList.remove('text-gray-800');
                } else if (lunarDate.day === 1) {
                    // Đánh dấu mùng 1 (nếu không phải hôm nay)
                    lunarDayEl.classList.add("text-red-500");
                    lunarDayEl.classList.remove("text-red-600");
                }

                // Gắn sự kiện mở modal
                dayCell.addEventListener('click', () => {
                    openNoteModal(dateStr);
                });
            }
            calendarBody.appendChild(dayCell);
        }
        
        // Vẽ lại bảng tổng kết ghi chú của tháng
        renderMonthlyNoteSummary(date); 
    }

    /**
     * Vẽ lại bảng "Tổng kết Ghi chú Tháng" ở cuối trang Lịch.
     * @param {Date} date - Một ngày bất kỳ trong tháng cần tổng kết.
     */
    function renderMonthlyNoteSummary(date) {
        const monthlyNoteList = document.getElementById('monthly-note-list');
        if (!monthlyNoteList) return; 

        monthlyNoteList.innerHTML = ''; 
        
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        
        const daysWithNotes = []; 
        
        // Lặp qua các ngày trong tháng để tìm ghi chú
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

        // Hiển thị kết quả
        if (daysWithNotes.length === 0) {
            monthlyNoteList.style.display = 'block';
            monthlyNoteList.className = ''; 
            monthlyNoteList.style.gridTemplateColumns = '';
            monthlyNoteList.innerHTML = `<p class="text-gray-400 italic">Không có ghi chú nào cho tháng này.</p>`;
        
        } else {
            // Dùng CSS Grid để căn chỉnh đẹp
            monthlyNoteList.style.display = 'grid';
            monthlyNoteList.className = 'grid gap-2'; 
            monthlyNoteList.style.gridTemplateColumns = 'auto 1fr';

            daysWithNotes.forEach(dayData => {
                const prefixWrapper = document.createElement('div');
                prefixWrapper.className = 'bg-gray-700 rounded-md text-gray-200 text-sm p-2 whitespace-nowrap';
                prefixWrapper.textContent = dayData.datePrefix;
                
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'bg-gray-700 rounded-md text-sm text-gray-200 divide-y divide-gray-600'; 
                
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
     * Mở modal (cửa sổ nổi) để thêm/sửa/xóa ghi chú cho một ngày.
     * @param {string} dateStr - Chuỗi ngày "YYYY-MM-DD".
     */
    function openNoteModal(dateStr) {
        const date = new Date(dateStr + 'T12:00:00'); // Thêm giờ để tránh lỗi múi giờ
        noteModal.style.display = 'flex';
        noteModalTitle.textContent = `Cập nhật (${date.toLocaleDateString('vi-VN')})`;
        currentEditingDateStr = dateStr; // Lưu lại ngày đang sửa
        
        // Hiển thị thông tin ca
        const shift = getShiftForDate(dateStr);
        modalShiftInfo.innerHTML = `Ca tự động: <strong>${shift.toUpperCase()}</strong>`;
        
        renderNoteList(dateStr); // Vẽ danh sách ghi chú hiện có
        newNoteInput.value = ''; 
        newNoteInput.focus();
    }
    
    /**
     * Vẽ danh sách ghi chú bên trong modal.
     * @param {string} dateStr - Chuỗi ngày "YYYY-MM-DD".
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

    // ===============================================
    // ===== CÁC HÀM PUSH NOTIFICATION (THÔNG BÁO) =====
    // ===============================================

    /**
     * Chuyển đổi chuỗi VAPID public key (Base64) thành Uint8Array.
     * @param {string} base64String - Chuỗi VAPID key.
     * @returns {Uint8Array}
     */
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Lấy VAPID public key từ server.
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
     * Kiểm tra trạng thái đăng ký thông báo hiện tại (đã bật hay chưa)
     * và cập nhật giao diện nút "Bật Thông Báo".
     */
    async function checkNotificationStatus() {
        if (!swRegistration) return;
        const subscription = await swRegistration.pushManager.getSubscription();
        if (subscription) {
            console.log("Người dùng đã đăng ký.");
            notifyButton.textContent = "Tắt Thông Báo";
            notifyButton.classList.add('subscribed'); // Thêm class màu đỏ
        } else {
            console.log("Người dùng chưa đăng ký.");
            notifyButton.textContent = "Bật Thông Báo";
            notifyButton.classList.remove('subscribed');
        }
    }

    /**
     * Xử lý sự kiện khi bấm nút "Bật/Tắt Thông Báo".
     * Bao gồm việc đăng ký hoặc hủy đăng ký PushManager.
     */
    async function handleSubscribeClick() {
        if (!swRegistration || !vapidPublicKey) {
            alert("Service Worker hoặc VAPID Key chưa sẵn sàng. Vui lòng thử lại.");
            return;
        }
        
        const existingSubscription = await swRegistration.pushManager.getSubscription();

        if (existingSubscription) {
            // --- HỦY ĐĂNG KÝ ---
            console.log("Đang hủy đăng ký...");
            notifyButton.disabled = true;
            try {
                const unsubscribed = await existingSubscription.unsubscribe();
                if (unsubscribed) {
                    // Gửi yêu cầu hủy lên server
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
            notifyButton.disabled = true;
            
            // Xin quyền
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert("Đại ca đã từ chối quyền thông báo. Vui lòng bật thủ công trong cài đặt trình duyệt.");
                notifyButton.disabled = false;
                return;
            }

            try {
                // Đăng ký với PushManager
                const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
                const subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                
                // Lấy cài đặt giờ
                const settings = {
                    notifyTimeNgay: notifyTimeNgay.value,
                    notifyTimeDem: notifyTimeDem.value,
                    notifyTimeOff: notifyTimeOff.value
                };
                
                // Lấy dữ liệu ghi chú
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
        
        notifyButton.disabled = false;
        checkNotificationStatus(); // Cập nhật lại giao diện nút
    }

    /**
     * Cập nhật cài đặt (giờ thông báo) lên server.
     * Được gọi mỗi khi thay đổi giờ trong tab Cài đặt.
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
            
            // Dùng endpoint /subscribe (ON CONFLICT DO UPDATE)
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
     * Đồng bộ (chỉ ghi chú) lên server.
     * Được gọi khi lưu ghi chú (saveNoteData) hoặc khi mở tab Cài đặt.
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
            
            // Gọi API /update-notes
            await fetch('/update-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    endpoint: subscription.endpoint, 
                    noteData: noteData
                })
            });
            console.log("Đồng bộ ghi chú thành công.");
        } catch (err) {
            console.error("Lỗi khi đồng bộ ghi chú:", err);
        }
    }


    // ===================================================================
    // PHẦN 3: LOGIC CHUNG (ĐIỀU KHIỂN TAB VÀ KHỞI ĐỘNG)
    // ===================================================================
    
    // Biến theo dõi tab hiện tại
    let currentTab = 'news'; 
    
    /**
     * Hàm chính điều khiển việc chuyển đổi qua lại giữa các tab (Tin tức, Lịch, Chat, Cài đặt).
     * @param {'news'|'calendar'|'chat'|'settings'} tabName - Tên của tab muốn chuyển đến.
     */
    function showTab(tabName) {
        if (tabName === currentTab) return; // Không làm gì nếu đã ở tab đó
        
        // Reset chat nếu rời khỏi tab chat
        if (currentTab === 'chat') {
            resetChat();
        }
        
        // Reset admin panel nếu rời tab settings
        if (currentTab === 'settings' && currentAdminCreds) {
            adminLogout();
        }
        
        currentTab = tabName;
        
        // Sửa lỗi bố cục: Chỉ xóa padding-bottom cho trang CHAT
        if (tabName === 'chat') {
            document.body.style.paddingBottom = '0';
        } else {
            document.body.style.paddingBottom = ''; // Dùng CSS mặc định
        }

        // 1. Ẩn tất cả các trang
        newsMain.classList.add('hidden');
        calendarMain.classList.add('hidden');
        chatMain.classList.add('hidden');
        settingsMain.classList.add('hidden');
        
        // 2. Tắt active tất cả các nút (desktop và mobile)
        if (newsTabBtn) newsTabBtn.classList.remove('active');
        if (calendarTabBtn) calendarTabBtn.classList.remove('active');
        if (settingsBtn) settingsBtn.classList.remove('active');
        bottomTabNews.classList.remove('active');
        bottomTabCalendar.classList.remove('active');
        bottomTabChat.classList.remove('active');
        bottomTabSettings.classList.remove('active');
        
        // 3. Ẩn các nút header mobile (mặc định)
        if (rssMenuBtn) rssMenuBtn.classList.add('hidden');
        if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.add('hidden');
        
        // 4. Ẩn nút Chat FAB
        chatFab.classList.add('hidden');

        // 5. Xử lý hiển thị tab được chọn
        switch (tabName) {
            case 'news':
                newsMain.classList.remove('hidden');
                if (newsTabBtn) newsTabBtn.classList.add('active'); // Desktop
                bottomTabNews.classList.add('active'); // Mobile
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Tin Tức";
                // Hiện lại các nút của tab Tin tức
                if (rssMenuBtn) rssMenuBtn.classList.remove('hidden');
                if (refreshFeedButtonMobile) refreshFeedButtonMobile.classList.remove('hidden');
                break;
            case 'calendar':
                calendarMain.classList.remove('hidden');
                if (calendarTabBtn) calendarTabBtn.classList.add('active'); // Desktop
                bottomTabCalendar.classList.add('active'); // Mobile
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Lịch Làm Việc";
                break;
            case 'chat':
                chatMain.classList.remove('hidden');
                bottomTabChat.classList.add('active'); // Mobile
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Trò chuyện";
                break;
            case 'settings':
                settingsMain.classList.remove('hidden');
                // Ép đồng bộ ghi chú khi mở tab Cài đặt
                syncNotesToServer();
                
                if (settingsBtn) settingsBtn.classList.add('active'); // Desktop
                bottomTabSettings.classList.add('active'); // Mobile
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = "Cài đặt";
                break;
        }
        
        // 7. Luôn đóng menu RSS khi chuyển tab
        rssMobileMenu.classList.add('hidden');
    }

    // --- Gắn sự kiện cho các nút chuyển TAB ---
    
    // Desktop (Thanh nav trên)
    if (newsTabBtn) newsTabBtn.addEventListener('click', () => showTab('news'));
    if (calendarTabBtn) calendarTabBtn.addEventListener('click', () => showTab('calendar'));
    if (settingsBtn) settingsBtn.addEventListener('click', () => showTab('settings'));
    chatFab.addEventListener('click', () => showTab('chat')); 
    
    // Mobile (Thanh nav dưới)
    bottomTabNews.addEventListener('click', () => showTab('news'));
    bottomTabCalendar.addEventListener('click', () => showTab('calendar'));
    bottomTabChat.addEventListener('click', () => showTab('chat')); 
    bottomTabSettings.addEventListener('click', () => showTab('settings'));
    
    // Mobile (Menu RSS)
    if (rssMenuBtn) rssMenuBtn.addEventListener('click', () => rssMobileMenu.classList.toggle('hidden'));

    /**
     * Xử lý sự kiện khi bấm nút Tải lại tin tức (Refresh).
     */
    function handleRefreshClick() {
        console.log("Đang yêu cầu tải lại...");
        const activeButton = feedNav.querySelector('.feed-button.active');
        if (activeButton) {
            const rssUrl = activeButton.dataset.rss;
            const sourceName = activeButton.dataset.source;
            // Gọi fetchRSS với cờ `force = true`
            fetchRSS(rssUrl, sourceName, { display: true, force: true });
        }
        rssMobileMenu.classList.add('hidden'); 
    }
    
    // --- KHỐI KHỞI ĐỘNG (IIFE - Immediately Invoked Function Expression) ---
    
    // --- KHỞI ĐỘNG (TIN TỨC) ---
    (async () => {
        // Gắn sự kiện cho các nút chọn feed và tải lại
        feedNav.addEventListener('click', handleFeedButtonClick);
        rssMobileMenu.addEventListener('click', handleFeedButtonClick); 
        refreshFeedButton.addEventListener('click', handleRefreshClick);
        refreshFeedButtonMobile.addEventListener('click', handleRefreshClick); 

        // Tải feed mặc định (VnExpress)
        const defaultFeed = feedNav.querySelector('.feed-button.active');
        if (defaultFeed) {
            await fetchRSS(defaultFeed.dataset.rss, defaultFeed.dataset.source);
        }
        // Tải nền các feed khác
        setTimeout(prewarmCache, 0);

        // Gắn sự kiện đóng modal tóm tắt
        closeSummaryModalButton.addEventListener('click', () => {
             summaryModal.classList.add('hidden');
             if (summaryEventSource) { // Dừng stream nếu đang chạy
                 summaryEventSource.close();
                 summaryEventSource = null;
             }
        });
         summaryModal.addEventListener('click', (e) => {
             if (e.target === summaryModal) { // Đóng khi bấm ra ngoài
                  summaryModal.classList.add('hidden');
                  if (summaryEventSource) {
                      summaryEventSource.close();
                      summaryEventSource = null;
                  }
             }
         });
         
         // Gắn sự kiện đóng toast
         toastCloseButton.addEventListener('click', (e) => {
             e.stopPropagation(); // Ngăn sự kiện click của toast
             hideToast();
         });
         
         // Gắn sự kiện gửi chat
        chatForm.addEventListener('submit', handleSendChat);
    })();
    
    // --- KHỞI ĐỘNG (LỊCH & CÀI ĐẶT) ---
    (async () => {
        // Vẽ lịch và tải cài đặt
        renderCalendar(currentViewDate);
        loadSettings();
        
        // Gắn sự kiện lưu cài đặt khi thay đổi giờ
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
        
        // Gắn sự kiện cho nút Bật/Tắt Thông báo
        notifyButton.addEventListener('click', handleSubscribeClick);

        // Gắn sự kiện cho nút chuyển tháng
        prevMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            renderCalendar(currentViewDate);
        });
        nextMonthBtn.addEventListener('click', () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            renderCalendar(currentViewDate);
        });
        
        // Gắn sự kiện đóng modal ghi chú
        closeNoteModalBtn.addEventListener('click', () => {
            noteModal.style.display = 'none';
            currentEditingDateStr = null; 
        });
        noteModal.addEventListener('click', (e) => {
            if (e.target === noteModal) { // Đóng khi bấm ra ngoài
                noteModal.style.display = 'none';
                currentEditingDateStr = null;
            }
        });
        
        // Gắn sự kiện Thêm ghi chú mới
        addNoteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const noteText = newNoteInput.value.trim();
            if (!noteText || !currentEditingDateStr) return;
            
            if (!Array.isArray(noteData[currentEditingDateStr])) {
                noteData[currentEditingDateStr] = [];
            }
            noteData[currentEditingDateStr].push(noteText);
            
            saveNoteData(); // Lưu và đồng bộ
            renderNoteList(currentEditingDateStr); // Cập nhật modal
            renderCalendar(currentViewDate); // Cập nhật lịch
            newNoteInput.value = ''; 
        });
        
        // Gắn sự kiện Sửa/Xóa ghi chú (dùng event delegation)
        noteList.addEventListener('click', (e) => {
            const target = e.target;
            const index = target.dataset.index;
            if (!currentEditingDateStr || index === undefined) return;
            
            const notes = noteData[currentEditingDateStr] || [];
            
            // Nút Sửa
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
            
            // Nút Xóa
            if (target.classList.contains('delete-note')) {
                if (confirm(`Bạn có chắc muốn xóa ghi chú: "${notes[index]}"?`)) {
                    noteData[currentEditingDateStr].splice(index, 1);
                    saveNoteData(); 
                    renderNoteList(currentEditingDateStr);
                    renderCalendar(currentViewDate);
                }
            }
        });
        
        // Gắn sự kiện cho Form AI (Thêm nhanh lịch)
        cal_aiForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const text = cal_aiInput.value.trim();
            if (!text) return;
            
            // Vô hiệu hóa form
            cal_aiInput.disabled = true;
            cal_aiForm.querySelector('button').disabled = true;
            cal_aiForm.querySelector('button').textContent = "Đang xử lý...";
            
            try {
                // Gọi API phân tích
                const response = await fetch('/api/calendar-ai-parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                const updates = await response.json(); 
                
                // Cập nhật dữ liệu từ AI
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
                    cal_aiInput.value = ''; 
                } else {
                    throw new Error("AI không trả về định dạng mảng.");
                }
            } catch (err) {
                console.error('Lỗi gọi AI API (Lịch):', err);
                alert('Không thể phân tích. Vui lòng kiểm tra lại prompt và API key.');
            }
            
            // Kích hoạt lại form
            cal_aiInput.disabled = false;
            cal_aiForm.querySelector('button').disabled = false;
            cal_aiForm.querySelector('button').textContent = "Phân tích";
        });

        // --- Gắn sự kiện cho ĐỒNG BỘ ONLINE ---
        
        // Nút Tải lên (Sync Up)
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

        // Nút Tải về (Sync Down)
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
                    
                    noteData = downloadedNotes || {}; // Ghi đè dữ liệu hiện tại
                    saveNoteData(); // Lưu vào local
                    renderCalendar(currentViewDate); // Vẽ lại lịch
                    
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
        
        // --- Gắn sự kiện cho ADMIN ---

        // Nút Đăng nhập Admin
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
                    // Dùng API 'get-users' để kiểm tra đăng nhập
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
        
        // Nút Đăng xuất Admin
        if (adminLogoutBtn) {
            adminLogoutBtn.addEventListener('click', adminLogout);
        }

        // Gắn listener cho các nút Xem/Xóa trong danh sách (dùng event delegation)
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
                 if (e.target === adminNoteViewerModal) { // Đóng khi bấm ra ngoài
                    adminNoteViewerModal.classList.add('hidden');
                 }
             });
        }

    })();
    
    // --- KHỞI ĐỘNG (TAB) ---
    // Kiểm tra hash (#) trên URL để mở đúng tab khi tải lại
    if (window.location.hash === '#calendar') {
        showTab('calendar');
    } else {
        showTab('news'); // Mặc định là tab Tin tức
    }

});
