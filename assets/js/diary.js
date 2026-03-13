/**
 * ============================================
 * DIARY.JS - Logic nhật ký kỷ niệm
 * ============================================
 */

const Diary = {
    /**
     * Thêm bài nhật ký mới
     * @param {string} content - Nội dung
     * @param {File|null} imageFile - File ảnh (optional)
     */
    async addEntry(content, imageFile) {
        content = content.trim();
        if (!content) {
            return { success: false, message: 'Vui lòng nhập nội dung!' };
        }

        const currentUser = Auth.getCurrentUser();
        if (!currentUser) {
            return { success: false, message: 'Bạn cần đăng nhập!' };
        }

        let imageData = '';
        if (imageFile) {
            try {
                imageData = await DB.fileToBase64(imageFile);
            } catch (e) {
                return { success: false, message: e.message };
            }
        }

        const entry = {
            author: currentUser.username,
            author_uid: currentUser.uid,
            content: content,
            image: imageData,
            time: new Date().toISOString()
        };

        DB.addDiaryEntry(entry);
        return { success: true, message: 'Đã lưu kỷ niệm!' };
    },

    /**
     * Render danh sách nhật ký ra UI
     * @param {string} containerId - ID của container HTML
     */
    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const entries = DB.getDiary();
        const reversed = [...entries].reverse();

        if (reversed.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📸</div>
                    <p>Chưa có kỷ niệm nào. Hãy viết bài đầu tiên nhé!</p>
                </div>
            `;
            return;
        }

        let html = '<div class="timeline-line">';
        reversed.forEach((item, index) => {
            const timeStr = this.formatTime(item.time);
            const delay = Math.min(index * 0.1, 0.5);
            
            const itemUser = DB.findUserByUID(item.author_uid) || DB.findUserByUsername(item.author);
            
            let itemAvt = 'https://i.imgur.com/6VBx3io.png';
            if (itemUser) {
                const config = DB.getConfig();
                if (itemUser.avatar) {
                    itemAvt = itemUser.avatar;
                } else if (itemUser.role === 'nam' && config.avt_nam) {
                    itemAvt = config.avt_nam;
                } else if (itemUser.role === 'nu' && config.avt_nu) {
                    itemAvt = config.avt_nu;
                }
            }

            html += `
                <div class="memory-card" style="animation-delay: ${delay}s">
                    <div class="memory-header" style="display: flex; align-items: center; gap: 10px;">
                        <img src="${itemAvt}" alt="Avt" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--pink-400);">
                        <div>
                            <span class="memory-author" style="display: block;">${this.escapeHtml(item.author)}</span>
                            <span class="memory-date" style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">🗓️ ${timeStr}</span>
                        </div>
                    </div>
                    <div class="memory-text" style="margin-top: 10px;">${this.nl2br(this.escapeHtml(item.content))}</div>
                    ${item.image ? `<img src="${item.image}" class="memory-img" alt="Ảnh kỷ niệm" loading="lazy">` : ''}
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    },

    formatTime(isoString) {
        const d = new Date(isoString);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} - ${h}:${m}`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    nl2br(text) {
        return text.replace(/\n/g, '<br>');
    }
};
