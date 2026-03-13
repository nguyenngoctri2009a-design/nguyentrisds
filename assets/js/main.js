/**
 * ============================================
 * MAIN.JS - Hiệu ứng giao diện & tiện ích chung
 * ============================================
 */

document.addEventListener('DOMContentLoaded', function () {

    // 1. LOAD HEADER & FOOTER
    loadComponent('header-placeholder', 'header.html');
    loadComponent('footer-placeholder', 'footer.html');

    // 2. STICKY HEADER EFFECT
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.nav-bar');
        if (header) {
            if (window.scrollY > 50) {
                header.style.background = 'rgba(10, 10, 20, 0.9)';
                header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
            } else {
                header.style.background = 'rgba(10, 10, 20, 0.6)';
                header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
            }
        }
    });

    // 3. AUTO-HIDE ALERTS
    document.querySelectorAll('.alert-auto-hide').forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateX(100px)';
            alert.style.transition = '0.5s ease';
            setTimeout(() => alert.remove(), 500);
        }, 3000);
    });
    // 4. GLOBAL MESSAGE BADGE POLLING
    setInterval(() => {
        if (typeof updateGlobalUnreadBadge === 'function') {
            updateGlobalUnreadBadge();
        }
    }, 2000);

    // 5. APPLY GLOBAL BACKGROUND FROM SETTINGS
    applyGlobalBackground();

    // 6. INITIALIZE LOCATION SHARING
    if (typeof initLocationSharing === 'function') {
        initLocationSharing();
    }
});

/**
 * Áp dụng hình nền từ cài đặt hệ thống
 */
function applyGlobalBackground() {
    if (typeof DB !== 'undefined' && DB.getConfig) {
        const config = DB.getConfig();
        if (config && config.anh_nen) {
            document.body.style.backgroundImage = `url('${config.anh_nen}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.minHeight = '100vh';
        }
    }
}

/**
 * Load HTML component vào placeholder
 * @param {string} placeholderId - ID của element placeholder
 * @param {string} file - Đường dẫn file HTML
 */
async function loadComponent(placeholderId, file) {
    const el = document.getElementById(placeholderId);
    if (!el) return;

    try {
        const response = await fetch(file);
        if (response.ok) {
            const html = await response.text();
            el.innerHTML = html;

            // Execute scripts trong component
            el.querySelectorAll('script').forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });

            // Highlight active menu
            highlightActiveMenu();

            // Cập nhật badge sau khi nạp xong navbar
            if (typeof updateGlobalUnreadBadge === 'function') {
                updateGlobalUnreadBadge();
            }
        }
    } catch (e) {
        console.warn(`Không thể tải ${file}:`, e);
    }
}

/**
 * Highlight menu item hiện tại
 */
function highlightActiveMenu() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === currentPage) {
            a.classList.add('active');
        }
    });
}

/**
 * KHỞI TẠO CHIA SẺ VỊ TRÍ
 */
let locationWatchId = null;
function initLocationSharing() {
    const currentUserStr = sessionStorage.getItem('current_user');
    if (!currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);

    // Bắt đầu theo dõi vị trí của chính mình
    if ("geolocation" in navigator) {
        locationWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // Lưu vào DB
                if (typeof DB !== 'undefined' && DB.saveUserLocation) {
                    DB.saveUserLocation(currentUser.uid, latitude, longitude);
                }
            },
            (error) => {
                console.warn("Lỗi lấy vị trí:", error.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    }

    // Cập nhật UI vị trí của đối phương mỗi 10 giây
    setInterval(() => {
        updatePartnerLocationUI();
    }, 10000);
    
    // Gọi lần đầu
    setTimeout(updatePartnerLocationUI, 1000);
}

/**
 * CẬP NHẬT GIAO DIỆN VỊ TRÍ ĐỐI PHƯƠNG
 */
async function updatePartnerLocationUI() {
    const currentUserStr = sessionStorage.getItem('current_user');
    if (!currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);

    if (typeof DB === 'undefined' || !DB.getLinkedPartner) return;
    const partner = DB.getLinkedPartner(currentUser.uid);
    
    const locationBadge = document.getElementById('partner-location-badge');
    if (!partner) {
        if (locationBadge) locationBadge.style.display = 'none';
        return;
    }

    const partnerLoc = DB.getUserLocation(partner.uid);
    if (!partnerLoc) return;

    if (locationBadge) {
        locationBadge.style.display = 'flex';
        
        // Nhãn hiển thị dựa trên vai trò
        let partnerLabel = partner.username;
        if (currentUser.role === 'nam' && partner.role === 'nu') partnerLabel = `📍 Bạn Nữ (${partner.username})`;
        else if (currentUser.role === 'nu' && partner.role === 'nam') partnerLabel = `📍 Bạn Nam (${partner.username})`;
        
        // Tính thời gian cập nhật cuối
        const now = Date.now();
        const diff = Math.floor((now - partnerLoc.updated_at) / 1000); // giây
        
        let timeStr = 'Vừa xong';
        if (diff > 3600) timeStr = Math.floor(diff / 3600) + 'h trước';
        else if (diff > 60) timeStr = Math.floor(diff / 60) + 'p trước';
        
        // Tạo link Google Maps
        const mapUrl = `https://www.google.com/maps?q=${partnerLoc.lat},${partnerLoc.lng}`;
        
        locationBadge.innerHTML = `
            <a href="${mapUrl}" target="_blank" title="Xem vị trí của ${partner.username}">
                <span class="loc-dot"></span>
                <span class="loc-text">${partnerLabel}: ${timeStr}</span>
            </a>
        `;
    }
}

/**
 * Hiển thị thông báo Toast
 * @param {string} message - Nội dung thông báo
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.toast-alert').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast-alert toast-' + type;

    const icons = { success: '✅', error: '⚠️', info: '💡' };
    toast.innerHTML = `<span>${icons[type] || '💡'} ${message}</span>`;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = '0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

/**
 * Toggle mobile menu
 */
function toggleMenu() {
    const nav = document.getElementById('nav-links');
    if (nav) nav.classList.toggle('open');
}

/**
 * Copy UID vào clipboard
 */
function copyUID(uid) {
    navigator.clipboard.writeText(uid).then(() => {
        showToast('Đã sao chép mã ID: ' + uid, 'success');
    });
}

/**
 * Tạo floating hearts animation
 */
function createFloatingHearts(containerId, count = 12) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const hearts = ['❤️', '💕', '💖', '💗', '🩷', '🤍'];
    for (let i = 0; i < count; i++) {
        const h = document.createElement('span');
        h.className = 'fh';
        h.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        h.style.left = Math.random() * 100 + '%';
        h.style.fontSize = (Math.random() * 1.2 + 0.6) + 'rem';
        h.style.animationDuration = (Math.random() * 10 + 8) + 's';
        h.style.animationDelay = (Math.random() * 12) + 's';
        container.appendChild(h);
    }
}

/**
 * Lấy avatar thực, nếu không có thì lấy theo role từ config, cuối cùng mới fallback ảnh mặc định
 */
function getRealAvatar(userObj) {
    if (!userObj) return 'https://i.imgur.com/6VBx3io.png';
    if (userObj.avatar) return userObj.avatar;

    // Fallback sang thiết lập hệ thống (nếu có config)
    if (typeof DB !== 'undefined' && DB.getConfig) {
        const config = DB.getConfig();
        if (userObj.role === 'nam' && config.avt_nam) return config.avt_nam;
        if (userObj.role === 'nu' && config.avt_nu) return config.avt_nu;
    }

    return 'https://i.imgur.com/6VBx3io.png';
}

/**
 * Cập nhật số unread message chung trên thanh điều hướng
 */
function updateGlobalUnreadBadge() {
    const currentUserStr = sessionStorage.getItem('current_user');
    if (!currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);

    let totalUnread = 0;
    if (typeof DB !== 'undefined' && DB.getTotalUnreadCount) {
        totalUnread = DB.getTotalUnreadCount(currentUser.uid);
    } else {
        return;
    }

    const msgLinks = document.querySelectorAll('.nav-links a[href="messenger.html"]');
    msgLinks.forEach(link => {
        let badge = link.querySelector('.nav-badge');
        if (totalUnread > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                link.style.position = 'relative';
                link.appendChild(badge);
            }
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        } else if (badge) {
            badge.remove();
        }
    });
}
