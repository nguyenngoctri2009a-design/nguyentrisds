document.addEventListener('DOMContentLoaded', () => {
    Auth.requireAuth();
    const currentUser = Auth.getCurrentUser();

    const roomListEl = document.getElementById('room-list');

    const passwordModal = document.getElementById('password-modal');
    const btnCancelJoin = document.getElementById('btn-cancel-join');
    const btnConfirmJoin = document.getElementById('btn-confirm-join');

    // Inputs
    const roomNameInput = document.getElementById('room-name');
    const gameTypeInput = document.getElementById('game-type');
    const gameModeInput = document.getElementById('game-mode');
    const roomBetInput = document.getElementById('room-bet');
    const roomPasswordInput = document.getElementById('room-password');
    const joinPasswordInput = document.getElementById('join-password');
    const userCoinsEl = document.getElementById('user-coins');
    const modeGroup = document.getElementById('mode-group');

    let selectedRoomId = null;
    let lastRoomListHtml = null;

    function ensureBotRooms() {
        const targetCount = 4;
        const allRooms = DB.getRooms();
        const botRooms = allRooms.filter(r => r && r.isBotMatch === true);

        const kept = botRooms.slice(0, targetCount);
        const need = targetCount - kept.length;
        const bets = [0, 10, 20, 50, 100, 200];
        const fakeNames = [
            'Máy Trí Tuệ', 'Máy Tốc Độ', 'Máy Thách Đấu', 'Máy Tập Sự',
            'Bot Alpha', 'Bot Beta', 'Bot Khó', 'Bot Dễ',
            'Máy Siêu Cấp', 'Bot Gà', 'Máy Hủy Diệt', 'Máy Thông Minh'
        ];
        const botRoomNames = [
            'Giải Đấu Của tèo',
            'Solo Máy vs Bé Ba',
            'Trận Chiến Căng Cúc',
            'Đấu Trường AI',
            'Giao Lưu vui vẻ',
            'Caro Vô Địch'
        ];

        for (let i = 0; i < need; i++) {
            const id = ('BOT' + Math.random().toString(36).slice(2, 6)).toUpperCase();
            const bet = bets[Math.floor(Math.random() * bets.length)];
            const botX = `bot_x_${id}`;
            const botO = `bot_o_${id}`;

            let xName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
            let oName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
            while (oName === xName) {
                oName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
            }

            const room = {
                id,
                name: `${botRoomNames[Math.floor(Math.random() * botRoomNames.length)]} • ${xName} vs ${oName}`,
                type: 'caro',
                mode: 'botvbot',
                bet,
                password: '',
                status: 'playing',
                players: [botX, botO],
                host: 'system',
                isBotMatch: true,
                botXName: xName,
                botOName: oName,
                created_at: new Date().toISOString()
            };
            kept.push(room);

            const initialData = {
                board: Array(9).fill(null),
                turn: 'X',
                players: { X: botX, O: botO },
                winner: null,
                winningLine: [],
                scores: { X: 0, O: 0 },
                betAmount: bet
            };
            DB.saveRoomGameData(room.id, initialData);
        }

        const nonBotRooms = allRooms.filter(r => {
            if (!r) return false;
            if (r.isBotMatch === true) return false;
            // Catch legacy bot rooms that lack isBotMatch
            if (r.host === 'system' || r.mode === 'botvbot' || (r.id && r.id.startsWith('BOT'))) return false;
            return true;
        });
        
        DB.saveRooms([...kept, ...nonBotRooms]);
    }

    function checkWin(board, symbol) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        for (let pattern of winPatterns) {
            if (pattern.every(idx => board[idx] === symbol)) {
                return pattern;
            }
        }
        return null;
    }

    function findWinningMove(board, sym) {
        for (let i = 0; i < board.length; i++) {
            if (board[i] !== null) continue;
            const test = [...board];
            test[i] = sym;
            if (checkWin(test, sym)) return i;
        }
        return -1;
    }

    function tickBotRooms() {
        const rooms = DB.getRooms();
        let changedRooms = false;

        for (let room of rooms) {
            if (!room || room.isBotMatch !== true) continue;

            let gameData = DB.getRoomGameData(room.id);
            if (!gameData || !Array.isArray(gameData.board)) {
                const botX = room.players[0];
                const botO = room.players[1];
                gameData = {
                    board: Array(9).fill(null),
                    turn: 'X',
                    players: { X: botX, O: botO },
                    winner: null,
                    winningLine: [],
                    scores: { X: 0, O: 0 },
                    betAmount: room.bet || 0
                };
                DB.saveRoomGameData(room.id, gameData);
            }

            if (gameData.winner) {
                if (!gameData.__resetAt) {
                    gameData.__resetAt = Date.now() + 2500;
                    DB.saveRoomGameData(room.id, gameData);
                    continue;
                }
                if (Date.now() >= gameData.__resetAt) {
                    gameData.board = Array(9).fill(null);
                    gameData.turn = 'X';
                    gameData.winner = null;
                    gameData.winningLine = [];
                    delete gameData.__resetAt;
                    DB.saveRoomGameData(room.id, gameData);
                }
                continue;
            }

            const sym = gameData.turn;
            const opp = sym === 'X' ? 'O' : 'X';
            let move = -1;

            if (Math.random() > 0.3) {
                move = findWinningMove(gameData.board, sym);
                if (move === -1) move = findWinningMove(gameData.board, opp);
                if (move === -1 && gameData.board[4] === null) move = 4;
            }
            if (move === -1) {
                const empty = gameData.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
                if (empty.length > 0) move = empty[Math.floor(Math.random() * empty.length)];
            }
            if (move === -1) continue;

            gameData.board[move] = sym;
            const line = checkWin(gameData.board, sym);
            if (line) {
                gameData.winner = sym;
                gameData.winningLine = line;
                gameData.scores = gameData.scores || { X: 0, O: 0 };
                gameData.scores[sym] = (gameData.scores[sym] || 0) + 1;
            } else if (gameData.board.every(v => v !== null)) {
                gameData.winner = 'draw';
            } else {
                gameData.turn = sym === 'X' ? 'O' : 'X';
            }
            DB.saveRoomGameData(room.id, gameData);

            if (room.status !== 'playing') {
                room.status = 'playing';
                changedRooms = true;
            }
        }

        if (changedRooms) DB.saveRooms(rooms);
    }

    // Load initial data
    updateCoins();
    renderRooms();

    // Poll for room updates
    setInterval(renderRooms, 2000);

    // Force cleanup on load
    DB.cleanupRooms();

    ensureBotRooms();
    setInterval(() => {
        ensureBotRooms();
        tickBotRooms();
    }, 1500);

    // Event Listeners
    
    btnCancelJoin.addEventListener('click', () => {
        passwordModal.classList.remove('active');
        selectedRoomId = null;
        joinPasswordInput.value = '';
    });

    btnConfirmJoin.addEventListener('click', () => {
        const password = joinPasswordInput.value.trim();
        if (selectedRoomId) {
            attemptJoin(selectedRoomId, password);
        }
    });



    function updateCoins() {
        if (userCoinsEl) userCoinsEl.textContent = DB.getCoins(currentUser.uid);
    }

    function renderRooms(roomsToRender) {
        // Apply Wallpaper from Settings
        if (typeof DB !== 'undefined' && DB.getConfig) {
            const config = DB.getConfig();
            if (config && config.wallpaper) {
                document.body.style.backgroundImage = `url(${config.wallpaper})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundAttachment = 'fixed';
            }
        }

        const realRooms = roomsToRender || DB.getRooms();

        let html = '';

        if (realRooms.length > 0) {
            html += realRooms.map(room => {
                const isFull = room.players.length >= 2 && room.mode !== 'pve';
                const isPlaying = room.status === 'playing';
                const isPrivate = !!room.password;
                const isMyRoom = room.players.includes(currentUser.uid);

                // ... status logic ...
                let statusClass = 'status-waiting';
                let statusText = 'Đang chờ';

                if (room.mode === 'pve') {
                    statusClass = 'status-playing';
                    statusText = 'Đang đấu Bot';
                } else if (isPlaying) {
                    statusClass = 'status-playing';
                    statusText = 'Đang chơi';
                } else if (isFull) {
                    statusClass = 'status-playing';
                    statusText = 'Đã đầy';
                }

                const gameName = room.type === 'caro' ? 'Cờ Caro' : 'Nối Từ';
                const modeName = room.mode === 'pve' ? '(Bot)' : '';

                // Button Logic (no spectator)
                let btnAction = '';
                let btnLabel = '';
                let btnIcon = '';

                if (isMyRoom) {
                    btnLabel = 'Tiếp Tục';
                    btnIcon = 'fa-play';
                    btnAction = `handleJoinClick('${room.id}', false)`;
                } else if (room.isBotMatch === true) {
                    btnLabel = 'Xem';
                    btnIcon = 'fa-eye';
                    btnAction = `handleWatchBotMatch('${room.id}')`;
                } else if (!isFull && !isPlaying && room.mode !== 'pve') {
                    btnLabel = 'Vào';
                    btnIcon = 'fa-sign-in-alt';
                    btnAction = `handleJoinClick('${room.id}', ${isPrivate})`;
                }

                return `
                    <div class="room-card">
                        <div class="room-info">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <h3 style="margin: 0;">${escapeHtml(room.name)}</h3>
                                <span style="font-size: 0.7rem; color: #a0aec0; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">ID: ${room.id}</span>
                                ${isPrivate ? '<i class="fas fa-lock" style="font-size: 0.75rem; color: #ffd700;"></i>' : ''}
                            </div>
                            <div class="room-meta">
                                <span class="room-game-type badge-${room.type}">${gameName} ${modeName}</span>
                                <span class="room-bet"><i class="fas fa-coins"></i> ${room.bet}</span>
                                <span class="room-players"><i class="fas fa-users" style="margin-right: 4px;"></i>${room.players.length}/${room.mode === 'pve' ? '1' : '2'}</span>
                            </div>
                        </div>
                        <div class="room-action">
                            <span class="room-status ${statusClass}">${statusText}</span>
                            ${btnAction ? `<button class="join-btn" onclick="${btnAction}"><i class="fas ${btnIcon}" style="margin-right: 4px;"></i>${btnLabel}</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (!html) html = '<div class="empty-state">Chưa có phòng nào. Hãy tạo phòng mới!</div>';

        if (html !== lastRoomListHtml) {
            roomListEl.innerHTML = html;
            lastRoomListHtml = html;
        }
    }



    // ====== EXISTING FUNCTIONS ======
    window.handleWatchBotMatch = (roomId) => {
        window.location.href = `caro?room=${roomId}&spectate=1`;
    };

    window.handleJoinClick = (roomId, isPrivate) => {
        if (isPrivate) {
            selectedRoomId = roomId;
            passwordModal.classList.add('active');
        } else {
            attemptJoin(roomId, '');
        }
    };

    function attemptJoin(roomId, password) {
        const result = DB.joinRoom(roomId, currentUser.uid, password);
        if (result.success) {
            joinGame(roomId, result.room.type, result.room.mode);
        } else {
            alert(result.message);
        }
    }

    function joinGame(roomId, type, mode) {
        if (type === 'caro') {
            window.location.href = `caro?room=${roomId}`;
        } else if (type === 'noitu') {
            window.location.href = `noitu?room=${roomId}`;
        }
    }

    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
