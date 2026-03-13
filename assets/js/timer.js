/**
 * ============================================
 * TIMER.JS - Logic đếm thời gian yêu nhau
 * ============================================
 */

const LoveTimer = {
    interval: null,

    /**
     * Bắt đầu đếm ngược
     * @param {string} startDateStr - Ngày bắt đầu yêu (ISO format)
     */
    start(startDateStr) {
        if (!startDateStr) {
            this.setDisplay(0, 0, 0, 0);
            return;
        }

        const startDate = new Date(startDateStr).getTime();
        if (isNaN(startDate)) {
            this.setDisplay(0, 0, 0, 0);
            return;
        }

        const update = () => {
            const now = Date.now();
            const distance = now - startDate;

            if (distance < 0) {
                // Ngày yêu trong tương lai
                this.setDisplay(0, 0, 0, 0);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            this.setDisplay(days, hours, minutes, seconds);
        };

        // Chạy ngay 1 lần
        update();

        // Cập nhật mỗi giây
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(update, 1000);
    },

    /**
     * Hiển thị lên UI
     */
    setDisplay(days, hours, minutes, seconds) {
        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');

        if (daysEl) daysEl.textContent = days;
        if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
        if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
        if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');

        // Counter tổng ngày (nếu có)
        const mainCounter = document.getElementById('main-counter');
        if (mainCounter) mainCounter.textContent = days + ' Ngày';
    },

    /**
     * Dừng timer
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
};
