/**
 * ============================================
 * CHAT.JS - Logic nhắn tin (Simulated Realtime)
 * ============================================
 */

const Chat = {
    currentChatUID: null,
    pollInterval: null,
    lastMessageCount: 0,
    
    audioChunks: [],
    mediaRecorder: null,
    isRecording: false,

    openChat(uid) {
        this.currentChatUID = uid;
        this.loadMessages();
        this.applySettings();
        this.startPolling();
    },

    send(content, type = 'text') {
        const currentUser = Auth.getCurrentUser();
        if (!content || !this.currentChatUID || !currentUser) return false;

        const settings = DB.getConversationSettings(currentUser.uid, this.currentChatUID);
        if (settings.blockedBy[currentUser.uid] || settings.blockedBy[this.currentChatUID]) {
            alert('Không thể gửi tin nhắn. Cuộc trò chuyện này đã bị chặn.');
            return false;
        }

        const msg = {
            sender_id: currentUser.uid,
            receiver_id: this.currentChatUID,
            content: content,
            type: type,
            time: new Date().toISOString()
        };

        DB.addMessage(msg);
        this.loadMessages();
        return true;
    },

    loadMessages() {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser || !this.currentChatUID) return;

        DB.markMessagesAsRead(this.currentChatUID, currentUser.uid);

        const conversation = DB.getConversation(currentUser.uid, this.currentChatUID);
        const chatBox = document.getElementById('chat-box');
        if (!chatBox) return;

        if (conversation.length === this.lastMessageCount) return;
        this.lastMessageCount = conversation.length;

        if (conversation.length === 0) {
            chatBox.innerHTML = `
                <div style="text-align: center; color: rgba(255,255,255,0.3); margin-top: 40px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">💌</div>
                    <p>Hãy gửi tin nhắn đầu tiên nhé!</p>
                </div>
            `;
            return;
        }

        let html = '';
        conversation.forEach(msg => {
            const isMe = msg.sender_id === currentUser.uid;
            const sideClass = isMe ? 'me' : 'them';
            const timeStr = this.formatTime(msg.time);
            
            let inner = '';
            let extraClass = '';
            if (msg.type === 'image') {
                inner = `<img src="${msg.content}" alt="Image">`;
                extraClass = 'msg-image';
            } else if (msg.type === 'audio') {
                inner = `<audio controls src="${msg.content}"></audio>`;
                extraClass = 'msg-audio';
            } else {
                inner = `<div class="msg-content">${this.escapeHtml(msg.content)}</div>`;
            }
            
            html += `
                <div class="bubble ${sideClass} ${extraClass}">
                    ${inner}
                    <span class="msg-time">${timeStr}</span>
                </div>
            `;
        });

        chatBox.innerHTML = html;
        chatBox.scrollTop = chatBox.scrollHeight;
    },

    startPolling() {
        this.stopPolling();
        this.pollInterval = setInterval(() => {
            this.loadMessages();
            this.updateBadges();
            
            // Check settings block changes in polling too
            const currentUser = Auth.getCurrentUser();
            if (currentUser && this.currentChatUID) {
                const settings = DB.getConversationSettings(currentUser.uid, this.currentChatUID);
                this.updateBlockUI(settings, currentUser.uid);
            }
        }, 1500);
    },

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    formatTime(isoString) {
        const date = new Date(isoString);
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        const mo = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${h}:${m} - ${d}/${mo}`;
    },

    formatShortTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) {
            return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
        }
        const d = date.getDate().toString().padStart(2, '0');
        const mo = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${d}/${mo}`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    escapeAttr(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    getLastMessageInfo(myUid, otherUid) {
        const convo = DB.getConversation(myUid, otherUid);
        if (!convo || convo.length === 0) return { preview: 'Nhấn để trò chuyện', time: '' };

        const last = convo[convo.length - 1];
        let preview = '';
        if (last.type === 'image') preview = '🖼️ Ảnh';
        else if (last.type === 'audio') preview = '🎤 Tin nhắn thoại';
        else preview = (last.content || '').toString();

        preview = preview.trim();
        if (!preview) preview = 'Tin nhắn';

        const isMe = last.sender_id === myUid;
        const prefix = isMe ? 'Bạn: ' : '';

        return { preview: prefix + preview, time: this.formatShortTime(last.time) };
    },

    renderUserList(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const currentUser = Auth.getCurrentUser();
        if (!currentUser) return;

        const users = DB.getUsers();
        const friendsKey = 'friends_' + currentUser.uid;
        const friendsList = JSON.parse(localStorage.getItem(friendsKey) || '[]');
        
        // Always include partner in the list
        const partner = DB.getLinkedPartner(currentUser.uid);
        if (partner && !friendsList.includes(partner.uid)) {
            friendsList.push(partner.uid);
        }

        const otherUsers = users.filter(u => u.uid !== currentUser.uid && friendsList.includes(u.uid));

        if (otherUsers.length === 0) {
            container.innerHTML = `
                <div class="no-users" style="padding: 15px; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.85rem;">
                    Bạn chưa có bạn bè nào.<br>Hãy qua Cộng Đồng kết bạn nhé!
                </div>
            `;
            return;
        }

        let html = '';
        otherUsers.forEach(u => {
            const isActive = this.currentChatUID === u.uid ? 'active' : '';
            const avatar = typeof getRealAvatar === 'function' ? getRealAvatar(u) : 'https://i.imgur.com/6VBx3io.png';
            const unreadCount = DB.getUnreadCount(u.uid, currentUser.uid);
            const badgeHtml = unreadCount > 0 ? `<div class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : '';
            const lastInfo = this.getLastMessageInfo(currentUser.uid, u.uid);
            const searchKey = (u.username || '').toLowerCase();
            html += `
                <a href="?chat_with=${u.uid}" class="user-item ${isActive}" data-search="${this.escapeAttr(searchKey)}" onclick="Chat.selectUser('${u.uid}', event)">
                    <div class="user-avatar-wrap">
                        <img src="${avatar}" class="user-avt" alt="Avt">
                        ${badgeHtml}
                    </div>
                    <div class="user-body">
                        <div class="user-row">
                            <h4>${this.escapeHtml(u.username)}</h4>
                            <span class="user-time">${this.escapeHtml(lastInfo.time)}</span>
                        </div>
                        <div class="user-row">
                            <span class="user-preview">${this.escapeHtml(lastInfo.preview)}</span>
                        </div>
                    </div>
                </a>
            `;
        });

        container.innerHTML = html;
    },

    selectUser(uid, event) {
        if (event) event.preventDefault();
        this.currentChatUID = uid;
        this.lastMessageCount = 0;
        history.pushState(null, '', '?chat_with=' + uid);

        const currentUser = Auth.getCurrentUser();
        const user = DB.findUserByUID(uid);
        if (user) {
            const nameEl = document.getElementById('chat-target-name');
            const avtEl = document.getElementById('chat-target-avt');
            const avatar = typeof getRealAvatar === 'function' ? getRealAvatar(user) : 'https://i.imgur.com/6VBx3io.png';
            if (nameEl) nameEl.textContent = user.username;
            if (avtEl) avtEl.src = avatar;

            const inputEl = document.getElementById('msg-input');
            if (inputEl) inputEl.placeholder = `Nhắn tin cho ${user.username}...`;

            const pNameEl = document.getElementById('panel-name');
            const pAvtEl = document.getElementById('panel-avt');
            if (pNameEl) pNameEl.textContent = user.username;
            if (pAvtEl) pAvtEl.src = avatar;
        }

        const chatSection = document.getElementById('chat-section');
        const emptySection = document.getElementById('empty-section');
        if (chatSection) chatSection.style.display = 'flex';
        if (emptySection) emptySection.style.display = 'none';

        this.renderUserList('user-list');
        
        if (currentUser) {
            this.applySettings();
        }
        
        this.loadMessages();
        this.startPolling();
        this.updateBadges();

        const input = document.getElementById('msg-input');
        if (input) input.focus();
    },

    updateBadges() {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) return;
        
        const friendsKey = 'friends_' + currentUser.uid;
        const friendsList = JSON.parse(localStorage.getItem(friendsKey) || '[]');
        
        friendsList.forEach(friendId => {
            const count = DB.getUnreadCount(friendId, currentUser.uid);
            const userLink = document.querySelector(`.user-item[href="?chat_with=${friendId}"]`);
            if (userLink) {
                let badge = userLink.querySelector('.unread-badge');
                if (count > 0) {
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'unread-badge';
                        const wrap = userLink.querySelector('.user-avatar-wrap');
                        if (wrap) wrap.appendChild(badge);
                    }
                    if (badge) badge.textContent = count > 99 ? '99+' : count;
                } else if (badge) {
                    badge.remove();
                }
            }
        });
        
        if (typeof updateGlobalUnreadBadge === 'function') {
            updateGlobalUnreadBadge();
        }
    },

    filterUserList(query) {
        const container = document.getElementById('user-list');
        if (!container) return;
        const q = (query || '').trim().toLowerCase();
        const items = container.querySelectorAll('.user-item');
        items.forEach(el => {
            const key = (el.getAttribute('data-search') || '').toLowerCase();
            el.style.display = !q || key.includes(q) ? '' : 'none';
        });
    },

    /* --- Settings: Theme & Block --- */
    applySettings() {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser || !this.currentChatUID) return;
        
        const settings = DB.getConversationSettings(currentUser.uid, this.currentChatUID);
        
        if (settings.themeUrl) {
            document.getElementById('chat-box').style.background = settings.themeUrl + ' no-repeat center center / cover';
        } else {
            document.getElementById('chat-box').style.background = '#242526';
        }
        
        this.updateBlockUI(settings, currentUser.uid);
    },

    updateBlockUI(settings, myUid) {
        if (!this.currentChatUID) return;
        const isBlockedByMe = settings.blockedBy[myUid];
        const isBlockedByThem = settings.blockedBy[this.currentChatUID];
        
        const inputArea = document.getElementById('input-area');
        const blockedArea = document.getElementById('blocked-area');
        const blockBtnText = document.getElementById('block-btn-text');
        
        if (isBlockedByMe || isBlockedByThem) {
            if (inputArea) inputArea.style.display = 'none';
            if (blockedArea) blockedArea.style.display = 'block';
        } else {
            if (inputArea) inputArea.style.display = 'flex';
            if (blockedArea) blockedArea.style.display = 'none';
        }
        
        if (blockBtnText) {
            blockBtnText.textContent = isBlockedByMe ? 'Bỏ chặn' : 'Chặn';
        }
    },

    toggleBlockUser() {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser || !this.currentChatUID) return;
        
        const settings = DB.getConversationSettings(currentUser.uid, this.currentChatUID);
        settings.blockedBy[currentUser.uid] = !settings.blockedBy[currentUser.uid];
        
        DB.saveConversationSettings(currentUser.uid, this.currentChatUID, settings);
        this.updateBlockUI(settings, currentUser.uid);
    },

    changeTheme(themeUrl) {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser || !this.currentChatUID) return;
        
        const settings = DB.getConversationSettings(currentUser.uid, this.currentChatUID);
        settings.themeUrl = themeUrl;
        DB.saveConversationSettings(currentUser.uid, this.currentChatUID, settings);
        
        document.getElementById('chat-box').style.background = themeUrl + ' no-repeat center center / cover';
        if (typeof closeThemeModal === 'function') closeThemeModal();
    },

    /* --- Multimedia: Image & Audio --- */
    async handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const base64 = await DB.fileToBase64(file);
            this.send(base64, 'image');
        } catch (e) {
            alert(e.message);
        }
        event.target.value = '';
    },

    async toggleRecordAudio() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    },

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };
            
            this.mediaRecorder.onstop = async () => {
                const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
                try {
                    const base64 = await DB.fileToBase64(blob);
                    this.send(base64, 'audio');
                } catch (e) {
                    alert('Lỗi xử lý âm thanh: ' + e.message);
                }
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // UI Updates during recording
            document.getElementById('mic-btn').classList.add('recording');
            document.getElementById('msg-input').placeholder = "Đang ghi âm lưu ý nếu chọn lại nút ghi âm thì sẽ ngừng ghi âm và gửi đi...";
            document.getElementById('msg-input').disabled = true;
            
            const sendBtn = document.querySelector('.send-btn');
            if (sendBtn) {
                // Lưu lại icon cũ để restore
                sendBtn.dataset.originalIcon = sendBtn.innerHTML;
                sendBtn.innerHTML = '🚀'; // Icon gửi đi hoặc máy bay giấy
                // Khi đang ghi âm, bấm nút gửi cũng sẽ stop và gửi
                sendBtn.onclick = () => this.stopRecording();
            }

        } catch (e) {
            alert('Không thể truy cập Microphone: ' + e.message);
        }
    },

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Restore UI
            document.getElementById('mic-btn').classList.remove('recording');
            const input = document.getElementById('msg-input');
            input.placeholder = "Aa";
            input.disabled = false;
            
            const sendBtn = document.querySelector('.send-btn');
            if (sendBtn) {
                sendBtn.innerHTML = sendBtn.dataset.originalIcon || '👍';
                sendBtn.onclick = () => window.handleSend ? handleSend() : null;
            }
        }
    }
};
