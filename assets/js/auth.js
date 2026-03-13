/**
 * ============================================
 * AUTH.JS - Đăng ký / Đăng nhập / Session
 * ============================================
 * Quản lý xác thực người dùng qua sessionStorage.
 */

const Auth = {
    SESSION_KEY: 'current_user',

    /**
     * Lấy user hiện tại từ sessionStorage
     * @returns {object|null}
     */
    getCurrentUser() {
        try {
            const data = sessionStorage.getItem(this.SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    /**
     * Kiểm tra đã đăng nhập chưa
     */
    isLoggedIn() {
        return this.getCurrentUser() !== null;
    },

    /**
     * Bảo vệ trang - redirect nếu chưa login
     */
    requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    },

    /**
     * Đăng ký tài khoản mới
     * @param {string} username
     * @param {string} password
     * @returns {{ success: boolean, message: string }}
     */
    register(username, password) {
        username = username.trim();
        
        if (!username || !password) {
            return { success: false, message: 'Vui lòng nhập đầy đủ thông tin!' };
        }

        if (username.length < 2) {
            return { success: false, message: 'Tên phải có ít nhất 2 ký tự!' };
        }

        if (password.length < 4) {
            return { success: false, message: 'Mật khẩu phải có ít nhất 4 ký tự!' };
        }

        // Kiểm tra trùng username
        const existing = DB.findUserByUsername(username);
        if (existing) {
            return { success: false, message: 'Tên này đã được sử dụng rồi!' };
        }

        // Tạo user mới
        const newUser = {
            uid: DB.generateUID(),
            username: username,
            password: this.hashPassword(password),
            role: '',
            avatar: '',
            created_at: new Date().toISOString()
        };

        DB.addUser(newUser);

        // Tự động đăng nhập
        this.setSession(newUser);

        return { success: true, message: 'Tạo tài khoản thành công! UID: ' + newUser.uid };
    },

    /**
     * Đăng nhập
     * @param {string} usernameOrUid - Username hoặc UID 6 số
     * @param {string} password
     * @returns {{ success: boolean, message: string }}
     */
    login(usernameOrUid, password) {
        usernameOrUid = usernameOrUid.trim();
        
        if (!usernameOrUid || !password) {
            return { success: false, message: 'Vui lòng nhập đầy đủ thông tin!' };
        }

        const users = DB.getUsers();
        const user = users.find(u => 
            u.username === usernameOrUid || u.uid === usernameOrUid
        );

        if (!user) {
            return { success: false, message: 'Không tìm thấy tài khoản!' };
        }

        if (user.password !== this.hashPassword(password)) {
            return { success: false, message: 'Mật khẩu không đúng!' };
        }

        this.setSession(user);
        return { success: true, message: 'Đăng nhập thành công!' };
    },

    /**
     * Lưu session
     */
    setSession(user) {
        const sessionData = {
            uid: user.uid,
            username: user.username,
            role: user.role || '',
            avatar: user.avatar || ''
        };
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
    },

    /**
     * Đăng xuất
     */
    logout() {
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.href = 'index.html';
    },

    /**
     * Hash password đơn giản (cho demo, không bảo mật thực sự)
     */
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return 'h_' + Math.abs(hash).toString(36);
    }
};
