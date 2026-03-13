
const DB = {
    // ===== KEYS =====
    KEYS: {
        CONFIG: 'config',
        USERS: 'users',
        MESSAGES: 'messages',
        CONVERSATION_SETTINGS: 'conversation_settings',
        CALL_SIGNALING: 'call_signaling',
        PARTNER_REQUESTS: 'partner_requests',
        PARTNER_OUTGOING: 'partner_outgoing',
        POSTS: 'posts',
        DIARY: 'diary',
        GAMES: 'games',
        LOCATIONS: 'user_locations'
    },

    // ===== GENERIC CRUD (LocalStorage - đồng bộ, nhanh) =====

    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`DB.get error [${key}]:`, e);
            return null;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`DB.set error [${key}]:`, e);
            if (e.name === 'QuotaExceededError') {
                alert('⚠️ Bộ nhớ LocalStorage đã đầy! Hãy xóa bớt dữ liệu cũ.');
            }
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    // ===== CONFIG =====

    getDefaultConfig() {
        return {
            ten_nam: 'Chàng Trai',
            ten_nu: 'Cô Gái',
            ngay_bat_dau: '',
            anh_nen: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7',
            avt_nam: 'https://i.imgur.com/6VBx3io.png',
            avt_nu: 'https://i.imgur.com/6VBx3io.png'
        };
    },

    getConfigStorageKey(uid) {
        const partner = this.getLinkedPartner(uid);
        if (partner) {
            const sharedKey = [uid, partner.uid].sort().join('_');
            return this.KEYS.CONFIG + '_shared_' + sharedKey;
        }
        return this.KEYS.CONFIG + '_' + uid;
    },

    getUserConfig(uid) {
        const key = this.KEYS.CONFIG + '_' + uid;
        return this.get(key) || null;
    },

    ensureSharedConfig(uid) {
        const partner = this.getLinkedPartner(uid);
        if (!partner) return;

        const sharedKey = this.KEYS.CONFIG + '_shared_' + [uid, partner.uid].sort().join('_');
        const existing = this.get(sharedKey);
        if (existing) return;

        const base = this.getDefaultConfig();
        const myCfg = this.getUserConfig(uid) || {};
        const partnerCfg = this.getUserConfig(partner.uid) || {};

        const merged = {
            ...base,
            ...partnerCfg,
            ...myCfg
        };
        merged.ngay_bat_dau = (myCfg.ngay_bat_dau || partnerCfg.ngay_bat_dau || base.ngay_bat_dau || '').trim();
        merged.anh_nen = (myCfg.anh_nen || partnerCfg.anh_nen || base.anh_nen || '').trim();

        this.set(sharedKey, merged);
    },

    getConfig() {
        const currentUserStr = sessionStorage.getItem('current_user');
        const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
        const uid = currentUser ? currentUser.uid : 'default';

        this.ensureSharedConfig(uid);
        const key = this.getConfigStorageKey(uid);

        let config = this.get(key);
        if (!config) {
            config = this.getDefaultConfig();
        }
        return config;
    },

    saveConfig(config) {
        const currentUserStr = sessionStorage.getItem('current_user');
        const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
        const uid = currentUser ? currentUser.uid : 'default';

        this.ensureSharedConfig(uid);
        const key = this.getConfigStorageKey(uid);

        this.set(key, { ...config, updated_at: new Date().toISOString() });
    },

    // ===== USERS =====

    getUsers() {
        return this.get(this.KEYS.USERS) || [];
    },

    saveUsers(users) {
        this.set(this.KEYS.USERS, users);
    },

    findUserByUsername(username) {
        const users = this.getUsers();
        return users.find(u => u.username === username) || null;
    },

    findUserByUID(uid) {
        const users = this.getUsers();
        return users.find(u => u.uid === uid) || null;
    },

    getPartnerUID(uid) {
        const user = this.findUserByUID(uid);
        return user && user.partner_uid ? user.partner_uid : '';
    },

    getOutgoingPartnerRequest(uid) {
        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        return outgoing[uid] || '';
    },

    getIncomingPartnerRequests(uid) {
        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        return all[uid] || [];
    },

    requestPartner(uid, partnerUid) {
        const me = this.findUserByUID(uid);
        const partner = this.findUserByUID(partnerUid);
        if (!me || !partner) {
            return { success: false, message: 'Không tìm thấy người dùng với ID này.' };
        }
        if (uid === partnerUid) {
            return { success: false, message: 'Không thể kết nối với chính bạn.' };
        }
        if (this.getLinkedPartner(uid)) {
            return { success: false, message: 'Bạn đang kết nối với người khác. Hãy hủy kết nối trước.' };
        }
        if (this.getLinkedPartner(partnerUid)) {
            return { success: false, message: 'Người này đang kết nối với người khác.' };
        }

        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        outgoing[uid] = partnerUid;
        this.set(this.KEYS.PARTNER_OUTGOING, outgoing);

        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        const list = all[partnerUid] || [];
        const exists = list.some(r => r.from === uid);
        if (!exists) {
            list.push({ from: uid, time: new Date().toISOString() });
        }
        all[partnerUid] = list;
        this.set(this.KEYS.PARTNER_REQUESTS, all);

        return { success: true, message: `Đã gửi lời mời đến ${partner.username} (#${partner.uid}). Chờ đối phương đồng ý.` };
    },

    cancelPartnerRequest(uid) {
        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        const partnerUid = outgoing[uid];
        if (!partnerUid) {
            return { success: false, message: 'Bạn chưa gửi lời mời nào.' };
        }

        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        const list = all[partnerUid] || [];
        all[partnerUid] = list.filter(r => r.from !== uid);
        this.set(this.KEYS.PARTNER_REQUESTS, all);

        delete outgoing[uid];
        this.set(this.KEYS.PARTNER_OUTGOING, outgoing);

        return { success: true, message: 'Đã hủy lời mời.' };
    },

    acceptPartnerRequest(uid, fromUid) {
        const me = this.findUserByUID(uid);
        const from = this.findUserByUID(fromUid);
        if (!me || !from) {
            return { success: false, message: 'Không tìm thấy người dùng.' };
        }
        if (this.getLinkedPartner(uid) || this.getLinkedPartner(fromUid)) {
            return { success: false, message: 'Không thể đồng ý vì một trong hai đã có kết nối.' };
        }

        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        const list = all[uid] || [];
        const exists = list.some(r => r.from === fromUid);
        if (!exists) {
            return { success: false, message: 'Không tìm thấy lời mời.' };
        }
        all[uid] = list.filter(r => r.from !== fromUid);
        this.set(this.KEYS.PARTNER_REQUESTS, all);

        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        if (outgoing[fromUid] === uid) delete outgoing[fromUid];
        if (outgoing[uid] === fromUid) delete outgoing[uid];
        this.set(this.KEYS.PARTNER_OUTGOING, outgoing);

        const users = this.getUsers();
        const myIndex = users.findIndex(u => u.uid === uid);
        const fromIndex = users.findIndex(u => u.uid === fromUid);
        if (myIndex < 0 || fromIndex < 0) {
            return { success: false, message: 'Không tìm thấy người dùng.' };
        }

        users[myIndex].partner_uid = fromUid;
        users[fromIndex].partner_uid = uid;
        this.saveUsers(users);

        return { success: true, message: `Đã kết nối với ${from.username} (#${from.uid}).`, user: users[myIndex] };
    },

    declinePartnerRequest(uid, fromUid) {
        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        const list = all[uid] || [];
        all[uid] = list.filter(r => r.from !== fromUid);
        this.set(this.KEYS.PARTNER_REQUESTS, all);

        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        if (outgoing[fromUid] === uid) {
            delete outgoing[fromUid];
            this.set(this.KEYS.PARTNER_OUTGOING, outgoing);
        }

        return { success: true, message: 'Đã từ chối lời mời.' };
    },

    getLinkedPartner(uid) {
        const myPartnerUid = this.getPartnerUID(uid);
        if (!myPartnerUid) return null;
        const partner = this.findUserByUID(myPartnerUid);
        if (!partner) return null;
        if (partner.partner_uid !== uid) return null;
        return partner;
    },

    clearPartner(uid) {
        const users = this.getUsers();
        const myIndex = users.findIndex(u => u.uid === uid);
        if (myIndex < 0) return { success: false, message: 'Không tìm thấy người dùng.' };

        const partnerUid = users[myIndex].partner_uid;
        users[myIndex].partner_uid = '';

        if (partnerUid) {
            const partnerIndex = users.findIndex(u => u.uid === partnerUid);
            if (partnerIndex > -1 && users[partnerIndex].partner_uid === uid) {
                users[partnerIndex].partner_uid = '';
            }
        }

        this.saveUsers(users);

        const outgoing = this.get(this.KEYS.PARTNER_OUTGOING) || {};
        if (outgoing[uid]) delete outgoing[uid];
        if (partnerUid && outgoing[partnerUid]) delete outgoing[partnerUid];
        this.set(this.KEYS.PARTNER_OUTGOING, outgoing);

        const all = this.get(this.KEYS.PARTNER_REQUESTS) || {};
        if (partnerUid && all[partnerUid]) {
            all[partnerUid] = (all[partnerUid] || []).filter(r => r.from !== uid);
        }
        if (all[uid]) {
            all[uid] = (all[uid] || []).filter(r => r.from !== partnerUid);
        }
        this.set(this.KEYS.PARTNER_REQUESTS, all);

        return { success: true, message: 'Đã hủy kết nối.' };
    },

    addUser(user) {
        const users = this.getUsers();
        users.push(user);
        this.saveUsers(users);
    },

    // ===== MESSAGES (NEW STRUCTURE: messages_uid1_uid2) =====

    getConversationKey(uid1, uid2) {
        // Create a unique key for the pair, sorted to ensure consistency (e.g. 1_2 same as 2_1)
        const key = [uid1, uid2].sort().join('_');
        return this.KEYS.MESSAGES + '_' + key;
    },

    migrateMessages() {
        const allMsg = this.get(this.KEYS.MESSAGES);
        if (allMsg && Array.isArray(allMsg) && allMsg.length > 0) {
            console.log('Migrating messages to separate keys...');
            const grouped = {};
            allMsg.forEach(msg => {
                if (!msg.sender_id || !msg.receiver_id) return;
                const k = this.getConversationKey(msg.sender_id, msg.receiver_id);
                if (!grouped[k]) grouped[k] = [];
                grouped[k].push(msg);
            });

            for (const [key, msgs] of Object.entries(grouped)) {
                const existing = this.get(key) || [];
                // Simple merge, assuming no duplicates or just append
                this.set(key, [...existing, ...msgs]);
            }
            this.remove(this.KEYS.MESSAGES); // Clear old storage
            console.log('Migration done.');
        }
    },

    addMessage(msg) {
        if (this.get(this.KEYS.MESSAGES)) this.migrateMessages();

        if (msg.read === undefined) msg.read = false;
        const key = this.getConversationKey(msg.sender_id, msg.receiver_id);
        const messages = this.get(key) || [];
        messages.push(msg);
        this.set(key, messages);
    },

    getConversation(uid1, uid2) {
        if (this.get(this.KEYS.MESSAGES)) this.migrateMessages();
        
        const key = this.getConversationKey(uid1, uid2);
        return this.get(key) || [];
    },

    getUnreadCount(sender_id, receiver_id) {
        // Optimization: only check specific conversation
        if (this.get(this.KEYS.MESSAGES)) this.migrateMessages();
        
        const key = this.getConversationKey(sender_id, receiver_id);
        const messages = this.get(key) || [];
        return messages.filter(m => m.sender_id === sender_id && m.receiver_id === receiver_id && !m.read).length;
    },

    getTotalUnreadCount(receiver_id) {
        if (this.get(this.KEYS.MESSAGES)) this.migrateMessages();

        // Need to scan all keys starting with 'messages_'
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.KEYS.MESSAGES + '_')) {
                const msgs = this.get(key);
                if (msgs && Array.isArray(msgs)) {
                    total += msgs.filter(m => m.receiver_id === receiver_id && !m.read).length;
                }
            }
        }
        return total;
    },

    markMessagesAsRead(sender_id, receiver_id) {
        if (this.get(this.KEYS.MESSAGES)) this.migrateMessages();

        const key = this.getConversationKey(sender_id, receiver_id);
        const messages = this.get(key) || [];
        let changed = false;
        messages.forEach(m => {
            if (m.sender_id === sender_id && m.receiver_id === receiver_id && !m.read) {
                m.read = true;
                changed = true;
            }
        });
        if (changed) {
            this.set(key, messages);
        }
    },

    // ===== CONVERSATION SETTINGS =====

    getConversationSettings(uid1, uid2) {
        const allSettings = this.get(this.KEYS.CONVERSATION_SETTINGS) || {};
        const convoKey = [uid1, uid2].sort().join('_');
        
        if (!allSettings[convoKey]) {
            allSettings[convoKey] = {
                themeUrl: '', // URL ảnh nền hoặc mã màu
                blockedBy: {} // { uid1: true/false, uid2: true/false }
            };
        }
        return allSettings[convoKey];
    },

    saveConversationSettings(uid1, uid2, settings) {
        const allSettings = this.get(this.KEYS.CONVERSATION_SETTINGS) || {};
        const convoKey = [uid1, uid2].sort().join('_');
        allSettings[convoKey] = settings;
        this.set(this.KEYS.CONVERSATION_SETTINGS, allSettings);
    },

    // ===== CALL SIGNALING (WebRTC LocalStorage Proxy) =====
    // Dùng mảng queue để không bị ghi đè signal

    getCallSignals(myUid) {
        const signaling = this.get(this.KEYS.CALL_SIGNALING) || {};
        const data = signaling[myUid];
        if (!data) return [];
        // Tương thích data cũ (object) -> chuyển thành array
        if (Array.isArray(data)) return data;
        return [data]; // object cũ -> wrap thành array
    },

    pushCallSignal(targetUid, stateObj) {
        const signaling = this.get(this.KEYS.CALL_SIGNALING) || {};
        if (!Array.isArray(signaling[targetUid])) signaling[targetUid] = [];
        signaling[targetUid].push(stateObj);
        this.set(this.KEYS.CALL_SIGNALING, signaling);
    },

    clearCallSignals(myUid) {
        const signaling = this.get(this.KEYS.CALL_SIGNALING) || {};
        if (signaling[myUid]) {
            delete signaling[myUid];
            this.set(this.KEYS.CALL_SIGNALING, signaling);
        }
    },

    // ===== POSTS (Cộng Đồng) =====

    getPosts() {
        let posts = this.get(this.KEYS.POSTS) || [];
        let modified = false;
        posts.forEach(p => {
            if (!p.id) {
                p.id = this.generateId();
                modified = true;
            }
        });
        if (modified) {
            this.savePosts(posts);
        }
        return posts;
    },

    savePosts(posts) {
        this.set(this.KEYS.POSTS, posts);
    },

    addPost(post) {
        const posts = this.getPosts();
        post.id = this.generateId();
        posts.push(post);
        this.set(this.KEYS.POSTS, posts);
    },

    // ===== DIARY (Nhật Ký) =====

    getDiaryStorageKey(uid) {
        const partner = this.getLinkedPartner(uid);
        if (partner) {
            const sharedKey = [uid, partner.uid].sort().join('_');
            return this.KEYS.DIARY + '_shared_' + sharedKey;
        }
        return this.KEYS.DIARY + '_' + uid;
    },

    getDiary() {
        const currentUserStr = sessionStorage.getItem('current_user');
        const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
        const uid = currentUser ? currentUser.uid : 'default';
        const key = this.getDiaryStorageKey(uid);

        return this.get(key) || [];
    },

    addDiaryEntry(entry) {
        const currentUserStr = sessionStorage.getItem('current_user');
        const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
        const uid = currentUser ? currentUser.uid : 'default';
        const key = this.getDiaryStorageKey(uid);

        const diary = this.get(key) || [];
        entry.id = this.generateId();
        diary.push(entry);
        this.set(key, diary);
    },

    // ===== GAMES =====

    // Room based game storage
    // Key: games_rooms
    // Structure: [{ id, name, type, bet, password, status, players: [uid1, uid2], created_at }]
    
    getRooms() {
        return this.get('games_rooms') || [];
    },

    saveRooms(rooms) {
        this.set('games_rooms', rooms);
    },

    createRoom(roomData) {
        const rooms = this.getRooms();
        
        // Remove existing room by this host if any
        const existingIndex = rooms.findIndex(r => r.host === roomData.hostUid);
        if (existingIndex !== -1) {
            rooms.splice(existingIndex, 1);
        }

        const newRoom = {
            id: this.generateId(),
            name: roomData.name,
            type: roomData.type,
            mode: roomData.mode || 'pvp',
            bet: parseInt(roomData.bet) || 0,
            password: roomData.password || '', 
            status: 'waiting', 
            players: [roomData.hostUid],
            host: roomData.hostUid,
            created_at: new Date().toISOString()
        };
        
        if (newRoom.mode === 'pve') {
            newRoom.players.push('bot');
            newRoom.status = 'playing';
            this.initRoomGameData(newRoom);
        }
        
        rooms.push(newRoom);
        this.saveRooms(rooms);
        return newRoom;
    },

    joinRoom(roomId, uid, password = '') {
        // Clean up old rooms first (optional maintenance)
        this.cleanupRooms();

        const rooms = this.getRooms();
        const index = rooms.findIndex(r => r.id === roomId);
        if (index === -1) return { success: false, message: 'Phòng không tồn tại!' };
        
        const room = rooms[index];
        
        if (room.players.includes(uid)) {
             return { success: true, room: room }; // Already in
        }

        if (room.status === 'playing' || room.players.length >= 2) {
            return { success: false, message: 'Phòng đã đầy hoặc đang chơi!' };
        }

        if (room.password && room.password !== password) {
            return { success: false, message: 'Mật khẩu không đúng!' };
        }

        // Check balance
        const userCoins = this.getCoins(uid);
        if (userCoins < room.bet) {
            return { success: false, message: 'Bạn không đủ xu để vào phòng này!' };
        }

        room.players.push(uid);
        if (room.players.length === 2) {
            room.status = 'playing';
            // Init game data for this room
            this.initRoomGameData(room);
        }
        
        this.saveRooms(rooms);
        return { success: true, room: room };
    },

    leaveRoom(roomId, uid) {
        const rooms = this.getRooms();
        const index = rooms.findIndex(r => r.id === roomId);
        if (index === -1) return;

        const room = rooms[index];
        room.players = room.players.filter(p => p !== uid);
        
        if (room.players.length === 0) {
            // Remove empty room
            rooms.splice(index, 1);
        } else {
            // If host left, assign new host
            if (room.host === uid) {
                room.host = room.players[0];
            }
            // Reset status if someone leaves during play
            if (room.status === 'playing') {
                room.status = 'waiting';
                // Reset game state? Maybe forfeit logic should be handled in game
            }
        }
        this.saveRooms(rooms);
    },

    cleanupRooms() {
        const rooms = this.getRooms();
        const now = new Date();
        const activeRooms = rooms.filter(room => {
            // 1. Remove if empty players
            if (!room.players || room.players.length === 0) return false;
            
            // 2. Remove waiting rooms older than 30 minutes
            const created = new Date(room.created_at);
            const diffMs = now - created;
            const diffMins = Math.round(diffMs / 60000);
            
            if (room.status === 'waiting' && diffMins > 30) return false;
            
            // 3. Remove STUCK rooms:
            // - If room is 'playing' but last update was long ago?
            // - Check game data timestamp if available
            if (room.status === 'playing') {
                const gameData = this.getRoomGameData(room.id);
                if (gameData && gameData.last_updated) {
                    const lastActive = now - gameData.last_updated;
                    // If inactive for > 10 minutes, kill it
                    if (lastActive > 10 * 60 * 1000) return false; 
                } else {
                    // Fallback: If no game data or no timestamp, use room creation time > 2 hours
                    if (diffMins > 120) return false;
                }
            }

            return true;
        });
        
        if (activeRooms.length !== rooms.length) {
            this.saveRooms(activeRooms);
        }
    },

    getRoom(roomId) {
        const rooms = this.getRooms();
        return rooms.find(r => r.id === roomId);
    },

    // Room-specific Game Data
    // Key: games_data_ROOMID
    
    getRoomGameData(roomId) {
        return this.get(`games_data_${roomId}`) || null;
    },

    saveRoomGameData(roomId, data) {
        // Add timestamp to track activity
        data.last_updated = Date.now();
        this.set(`games_data_${roomId}`, data);
    },

    initRoomGameData(room) {
        // Initialize based on game type
        let initialData = {};
        if (room.type === 'caro') {
            initialData = {
                board: Array(9).fill(null),
                turn: 'X',
                players: { X: room.players[0], O: room.players[1] },
                winner: null,
                winningLine: [],
                scores: { X: 0, O: 0 },
                betAmount: room.bet,
                last_updated: Date.now()
            };
        } else if (room.type === 'noitu') {
            initialData = {
                score: 0,
                history: [],
                current_word: '',
                gameOver: false,
                loser: null,
                betAmount: room.bet,
                players: room.players,
                turn: room.players[0], // Host starts first?
                last_updated: Date.now()
            };
        }
        this.saveRoomGameData(room.id, initialData);
    },

    getGameStorageKey(uid, gameType) {
        const partner = this.getLinkedPartner(uid);
        if (partner) {
            const sharedKey = [uid, partner.uid].sort().join('_');
            return `${this.KEYS.GAMES}_${gameType}_shared_${sharedKey}`;
        }
        return `${this.KEYS.GAMES}_${gameType}_${uid}`;
    },

    getGameData(uid, gameType) {
        const key = this.getGameStorageKey(uid, gameType);
        return this.get(key) || { score: 0, history: [], current_word: '' };
    },

    saveGameData(uid, gameType, data) {
        const key = this.getGameStorageKey(uid, gameType);
        this.set(key, data);
    },

    // ===== COINS (XU) =====

    getCoins(uid) {
        const user = this.findUserByUID(uid);
        return (user && user.coins) ? user.coins : 0;
    },

    addCoins(uid, amount) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.uid === uid);
        if (index !== -1) {
            if (!users[index].coins) users[index].coins = 0;
            users[index].coins += amount;
            this.saveUsers(users);
            return users[index].coins;
        }
        return 0;
    },

    // ===== DAILY GIFTS =====

    // Key: daily_claims
    // Structure: [{ ip: "...", date: "YYYY-MM-DD", uid: "..." }]

    getDailyClaims() {
        return this.get('daily_claims') || [];
    },

    saveDailyClaims(claims) {
        this.set('daily_claims', claims);
    },

    hasClaimedToday(ip, uid) {
        const claims = this.getDailyClaims();
        const today = new Date().toISOString().split('T')[0];
        
        // Check if this IP OR this UID has claimed today
        return claims.some(c => (c.ip === ip || c.uid === uid) && c.date === today);
    },

    claimDailyGift(ip, uid, amount) {
        const claims = this.getDailyClaims();
        const today = new Date().toISOString().split('T')[0];
        
        // Add claim record
        claims.push({
            ip: ip,
            date: today,
            uid: uid,
            amount: amount,
            timestamp: Date.now()
        });
        
        // Optional: Clean up old claims (older than today) to save space
        const cleanClaims = claims.filter(c => c.date === today);
        
        this.saveDailyClaims(cleanClaims);
        
        // Add coins to user
        this.addCoins(uid, amount);
        
        return true;
    },

    // ===== LOCATIONS =====

    saveUserLocation(uid, lat, lng, address = '') {
        const locations = this.get(this.KEYS.LOCATIONS) || {};
        locations[uid] = {
            lat,
            lng,
            address,
            updated_at: Date.now()
        };
        this.set(this.KEYS.LOCATIONS, locations);
    },

    getUserLocation(uid) {
        const locations = this.get(this.KEYS.LOCATIONS) || {};
        return locations[uid] || null;
    },

    // ===== UTILITIES =====

    generateUID() {
        let uid;
        const users = this.getUsers();
        do {
            uid = Math.floor(100000 + Math.random() * 900000).toString();
        } while (users.some(u => u.uid === uid));
        return uid;
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    init() {
        if (!this.get(this.KEYS.CONFIG)) {
            this.set(this.KEYS.CONFIG, {
                ten_nam: 'Chàng Trai',
                ten_nu: 'Cô Gái',
                ngay_bat_dau: '2023-10-15T00:00:00',
                anh_nen: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7'
            });
        }
        if (!this.get(this.KEYS.USERS)) this.saveUsers([]);
        if (!this.get(this.KEYS.MESSAGES)) this.set(this.KEYS.MESSAGES, []);
        if (!this.get(this.KEYS.POSTS)) this.set(this.KEYS.POSTS, []);
        if (!this.get(this.KEYS.DIARY)) this.set(this.KEYS.DIARY, []);
    },

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve('');
            if (file.size > 2 * 1024 * 1024) {
                reject(new Error('Ảnh quá lớn! Tối đa 2MB.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};
