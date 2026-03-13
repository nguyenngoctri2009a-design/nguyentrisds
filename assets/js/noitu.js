document.addEventListener('DOMContentLoaded', () => {
    Auth.requireAuth();

    const currentUser = Auth.getCurrentUser();
    const gameType = 'noitu';
    const input = document.getElementById('word-input');
    const btnSubmit = document.getElementById('btn-submit');
    const historyList = document.getElementById('history-list');
    const scoreValue = document.getElementById('score-value');
    const turnValue = document.getElementById('turn-value');
    const currentWordEl = document.getElementById('current-word');
    const errorMsg = document.getElementById('error-msg');
    const btnReset = document.getElementById('btn-reset-game');
    const timerValue = document.getElementById('timer-value');
    
    // Betting Controls
    const userCoinsEl = document.getElementById('user-coins');
    const bettingOverlay = document.getElementById('betting-overlay');
    const betInputLarge = document.getElementById('bet-amount-large');
    const btnConfirmBet = document.getElementById('btn-confirm-bet');
    const btnBackBet = document.getElementById('btn-back-bet');
    const btnMinus = document.querySelector('.btn-large-adjust.minus');
    const btnPlus = document.querySelector('.btn-large-adjust.plus');
    const chipBtns = document.querySelectorAll('.chip-large');
    const modalUserCoins = document.getElementById('modal-user-coins');
    
    // In-game display
    const ingameBetInfo = document.getElementById('ingame-bet-info');
    const currentBetDisplay = document.getElementById('current-bet-display');

    // Configuration
    const BASE_TIME_LIMIT = 30; // seconds
    let countdownInterval = null;
    let lastGameOverState = false; // To track state change

    // Get Room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const isRoomMode = !!roomId;

    // Load initial game state
    let gameData = isRoomMode ? DB.getRoomGameData(roomId) : DB.getGameData(currentUser.uid, gameType);
    let roomInfo = isRoomMode ? DB.getRoom(roomId) : null;

    if (isRoomMode && roomInfo && Array.isArray(roomInfo.players) && !roomInfo.players.includes(currentUser.uid)) {
        alert('Bạn không thuộc phòng này.');
        window.location.href = 'lobby.html';
        return;
    }

    if (isRoomMode && roomInfo && (gameData && (!gameData.betAmount || gameData.betAmount === 0))) {
        gameData.betAmount = roomInfo.bet || 0;
        DB.saveRoomGameData(roomId, gameData);
    }

    // Polling for updates
    setInterval(() => {
        const newData = isRoomMode ? DB.getRoomGameData(roomId) : DB.getGameData(currentUser.uid, gameType);
        if (JSON.stringify(newData) !== JSON.stringify(gameData)) {
            gameData = newData;
            renderGame();
        }
    }, 1000); // Faster polling for timer sync

    renderGame();

    // Local timer loop
    setInterval(updateTimerDisplay, 1000);

    function getDynamicTimeLimit() {
        const historyLen = (gameData.history || []).length;
        // Decrease 1 second every 2 turns (or every turn for harder difficulty)
        // Min time is 5 seconds
        const reduction = Math.floor(historyLen / 1); 
        return Math.max(5, BASE_TIME_LIMIT - reduction);
    }

    function updateTimerDisplay() {
        if (!gameData.history || gameData.history.length === 0) {
            if (timerValue) timerValue.textContent = '--';
            return;
        }

        const lastMove = gameData.history[gameData.history.length - 1];
        if (!lastMove) return;

        // Check if game is already over
        if (gameData.gameOver) {
            if (timerValue) timerValue.textContent = 'Kết thúc';
            return;
        }

        const limit = getDynamicTimeLimit();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - lastMove.timestamp) / 1000);
        const remaining = limit - elapsedSeconds;

        if (remaining <= 0) {
            // Time's up!
            if (timerValue) {
                timerValue.textContent = '0s';
                timerValue.style.color = '#ff6b6b';
            }
            
            // Only the current turn player triggers the loss to avoid conflicts
            const partner = DB.getLinkedPartner(currentUser.uid);
            if (partner && lastMove.uid !== currentUser.uid && !gameData.gameOver) {
                // It's my turn and I ran out of time
                handleGameOver(currentUser.uid);
            }
        } else {
            if (timerValue) {
                timerValue.textContent = remaining + 's';
                // Alert colors
                if (remaining <= 5) timerValue.style.color = '#ff0000'; // Critical
                else if (remaining <= 10) timerValue.style.color = '#ff6b6b'; // Warning
                else timerValue.style.color = '#4ecdc4'; // Normal
            }
        }
    }

    function handleGameOver(loserUid) {
        if (gameData.gameOver) return; // Prevent double execution

        gameData.gameOver = true;
        gameData.loser = loserUid;
        
        // Save first so other client knows ASAP
        if (isRoomMode) {
            DB.saveRoomGameData(roomId, gameData);
        } else {
            DB.saveGameData(currentUser.uid, gameType, gameData);
        }
        
        // Coin Logic
        const bet = parseInt(gameData.betAmount) || 0;
        
        if (loserUid === currentUser.uid) {
            // I lost
            if (bet > 0) {
                DB.addCoins(currentUser.uid, -bet);
            }
        } else {
            // I won (partner lost)
            const earned = bet > 0 ? bet : 10;
            DB.addCoins(currentUser.uid, earned);
        }
        
        renderGame();
    }
    
    // UI Update triggered by state change detected in renderGame polling
    function handleGameEnd(loserUid) {
        // This is called exactly ONCE when game transitions from active -> over
        const bet = parseInt(gameData.betAmount) || 0;
        
        if (loserUid === currentUser.uid) {
             // I lost
             if (bet > 0) {
                 DB.addCoins(currentUser.uid, -bet);
             }
        } else {
             // I won
             const earned = bet > 0 ? bet : 10;
             DB.addCoins(currentUser.uid, earned);
        }
        
        // Force update UI
        if (userCoinsEl) userCoinsEl.textContent = DB.getCoins(currentUser.uid);
    }

    function renderGame() {
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

        if (!gameData.history) gameData.history = [];
        
        scoreValue.textContent = gameData.score || 0;
        
        // Update Coins
        const coins = DB.getCoins(currentUser.uid);
        if (userCoinsEl) userCoinsEl.textContent = coins;
        if (modalUserCoins) modalUserCoins.textContent = coins;

        // Show/Hide Betting Modal
        const currentBet = parseInt(gameData.betAmount) || 0;
        if (currentBet === 0 && !gameData.winner && (!gameData.history || gameData.history.length === 0)) {
            // New game, need bet
            if (bettingOverlay) bettingOverlay.classList.remove('hidden');
            if (ingameBetInfo) ingameBetInfo.style.display = 'none';
        } else {
            // Game started
            if (bettingOverlay) bettingOverlay.classList.add('hidden');
            
            // Show small bet info
            if (ingameBetInfo) {
                ingameBetInfo.style.display = 'block';
                if (currentBetDisplay) currentBetDisplay.textContent = currentBet;
            }
        }
        
        // Update Bet Input (if not focused)
        if (betInputLarge && !bettingOverlay.classList.contains('hidden')) {
            // Only update if not focused
            // if (document.activeElement !== betInputLarge) betInputLarge.value = gameData.betAmount || 0;
        }
        
        // Check Game Over State Change
        if (gameData.gameOver && !lastGameOverState) {
            lastGameOverState = true;
            handleGameEnd(gameData.loser);
        } else if (!gameData.gameOver) {
            lastGameOverState = false;
        }

        // Check Game Over UI
        if (gameData.gameOver) {
            let loserName = 'BẠN';
            if (isRoomMode) {
                const loserUser = DB.findUserByUID(gameData.loser);
                loserName = loserUser ? (loserUser.uid === currentUser.uid ? 'BẠN' : loserUser.username) : '...';
            } else {
                const partner = DB.getLinkedPartner(currentUser.uid);
                loserName = gameData.loser === currentUser.uid ? 'BẠN' : (partner ? partner.username : 'Người ấy');
            }
            
            let statusMsg = `<span style="color: #ff6b6b; font-size: 1.5rem;">${loserName} THUA! 😜</span>`;
            
            // Coin Info
            const bet = parseInt(gameData.betAmount) || 0;
            if (gameData.loser === currentUser.uid) {
                if (bet > 0) statusMsg += `<br><span style="color: #ff6b6b; font-size: 1rem;">(-${bet} xu)</span>`;
            } else {
                 statusMsg += `<br><span style="color: #ffd700; font-size: 1rem;">(+${bet > 0 ? bet : 10} xu)</span>`;
            }

            currentWordEl.innerHTML = statusMsg;
            turnValue.textContent = "Hết giờ!";
            input.disabled = true;
            btnSubmit.disabled = true;
            input.placeholder = "Bấm nút xoay để chơi lại";
            return; // Stop rendering normal state
        }

        const lastMove = gameData.history[gameData.history.length - 1];
        if (lastMove) {
            currentWordEl.textContent = lastMove.word;
            // Determine turn
            if (isRoomMode) {
                // In Room mode, gameData.turn should store whose turn it is
                // If not available, determine from last move
                const currentTurnUid = lastMove.uid === gameData.players[0] ? gameData.players[1] : gameData.players[0];
                
                if (currentTurnUid === currentUser.uid) {
                    turnValue.textContent = "Lượt của BẠN";
                    input.disabled = false;
                    btnSubmit.disabled = false;
                    input.placeholder = "Nhập từ tiếp theo...";
                } else {
                    const opponent = DB.findUserByUID(currentTurnUid);
                    turnValue.textContent = `Lượt của ${opponent ? opponent.username : '...'}`;
                    input.disabled = true;
                    btnSubmit.disabled = true;
                    input.placeholder = "Đợi đối phương...";
                }
            } else {
                // Legacy logic
                const partner = DB.getLinkedPartner(currentUser.uid);
                if (partner) {
                    if (lastMove.uid === currentUser.uid) {
                        turnValue.textContent = `Lượt của ${partner.username}`;
                        input.disabled = true;
                        btnSubmit.disabled = true;
                        input.placeholder = "Đợi đối phương...";
                    } else {
                        turnValue.textContent = "Lượt của BẠN";
                        input.disabled = false;
                        btnSubmit.disabled = false;
                        input.placeholder = "Nhập từ tiếp theo...";
                    }
                } else {
                    turnValue.textContent = "Chơi một mình";
                    input.disabled = false;
                    btnSubmit.disabled = false;
                }
            }
        } else {
            currentWordEl.textContent = "???";
            if (isRoomMode) {
                // First turn logic for room mode
                if (gameData.players[0] === currentUser.uid) {
                    turnValue.textContent = "Bạn đi trước!";
                    input.disabled = false;
                    btnSubmit.disabled = false;
                } else {
                    const host = DB.findUserByUID(gameData.players[0]);
                    turnValue.textContent = `Đợi ${host ? host.username : 'Chủ phòng'} đi trước...`;
                    input.disabled = true;
                    btnSubmit.disabled = true;
                }
            } else {
                turnValue.textContent = "Bắt đầu đi!";
                input.disabled = false;
                btnSubmit.disabled = false;
            }
        }

        // Render history
        if (gameData.history.length === 0) {
            historyList.innerHTML = '<div class="empty-state">Chưa có từ nào được nối. Hãy bắt đầu!</div>';
        } else {
            historyList.innerHTML = gameData.history.slice().reverse().map(move => {
                const isMe = move.uid === currentUser.uid;
                const user = isMe ? 'Bạn' : (DB.findUserByUID(move.uid)?.username || 'Người ấy');
                return `
                    <div class="history-item ${isMe ? 'mine' : 'partner'}">
                        <span class="word">${move.word}</span>
                        <span class="user">${user}</span>
                    </div>
                `;
            }).join('');
        }
    }

    btnSubmit.addEventListener('click', handleMove);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleMove();
    });

    btnReset.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn chơi lại từ đầu? Điểm số sẽ về 0.')) {
            const bet = gameData.betAmount || 0;
            gameData = { 
                score: 0, 
                history: [], 
                current_word: '', 
                gameOver: false, 
                loser: null,
                betAmount: bet,
                players: gameData.players
            };
            
            if (isRoomMode) {
                DB.saveRoomGameData(roomId, gameData);
            } else {
                DB.saveGameData(currentUser.uid, gameType, gameData);
            }
            renderGame();
        }
    });

    if (btnMinus) {
        btnMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            let current = parseInt(betInputLarge.value) || 0;
            current = Math.max(0, current - 10);
            betInputLarge.value = current;
        });
    }

    if (btnPlus) {
        btnPlus.addEventListener('click', (e) => {
            e.stopPropagation();
            let current = parseInt(betInputLarge.value) || 0;
            const currentCoins = DB.getCoins(currentUser.uid);
            
            if (current + 10 > currentCoins) {
                alert(`Bạn không đủ xu! Hiện có: ${currentCoins}`);
                return;
            }
            
            current += 10;
            betInputLarge.value = current;
        });
    }

    if (chipBtns) {
        chipBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = btn.getAttribute('data-val');
                const currentCoins = DB.getCoins(currentUser.uid);
                
                if (val === 'All') {
                    betInputLarge.value = currentCoins;
                } else {
                    let current = parseInt(betInputLarge.value) || 0;
                    const addAmount = parseInt(val);
                    
                    if (current + addAmount > currentCoins) {
                        alert(`Bạn không đủ xu! Hiện có: ${currentCoins}`);
                        return;
                    }
                    
                    current += addAmount;
                    betInputLarge.value = current;
                }
            });
        });
    }

    if (btnConfirmBet) {
        btnConfirmBet.addEventListener('click', (e) => {
            e.stopPropagation();
            const amount = parseInt(betInputLarge.value);
            if (isNaN(amount) || amount < 0) {
                alert('Vui lòng nhập số tiền hợp lệ!');
                return;
            }
            
            const currentCoins = DB.getCoins(currentUser.uid);
            if (amount > currentCoins) {
                alert(`Bạn không đủ xu! Hiện có: ${currentCoins}`);
                return;
            }

            gameData.betAmount = amount;
            gameData.history = [];
            gameData.current_word = '';
            gameData.gameOver = false;
            gameData.loser = null;
            gameData.score = 0;
            
            if (isRoomMode) {
                DB.saveRoomGameData(roomId, gameData);
            } else {
                DB.saveGameData(currentUser.uid, gameType, gameData);
            }
            
            if (bettingOverlay) bettingOverlay.classList.add('hidden');
        });
    }

    if (btnBackBet) {
        btnBackBet.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'games.html';
        });
    }

    function handleMove() {
        if (gameData.gameOver) return;

        // Check Bet
        const bet = parseInt(gameData.betAmount) || 0;
        if (bet <= 0) {
            showError('Vui lòng đặt cược trước khi chơi!');
            return;
        }

        const currentCoins = DB.getCoins(currentUser.uid);
        if (currentCoins < bet) {
            showError(`Bạn không đủ xu để chơi với mức cược ${bet}!`);
            return;
        }

        const rawInput = input.value.trim().toLowerCase();
        if (!rawInput) return;

        // Validation 1: Regex Vietnamese characters only
        const vietnameseRegex = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ\s]+$/;
        if (!vietnameseRegex.test(rawInput)) {
            showError('Từ không hợp lệ! Chỉ dùng chữ cái tiếng Việt.');
            return;
        }

        // Validation 2: Word length (syllables)
        const syllables = rawInput.split(/\s+/).filter(s => s.length > 0);
        if (syllables.length < 1 || syllables.length > 2) {
            showError('Chỉ được nhập từ đơn hoặc từ ghép (1-2 tiếng).');
            return;
        }
        
        // Validation 3: Syllable Structure Check (NEW)
        // Check each syllable for valid structure:
        // - Must contain vowel
        // - Valid ending consonant
        // - No invalid consonant clusters
        for (const s of syllables) {
            if (!isValidVietnameseSyllable(s)) {
                showError(`Tiếng "${s}" không đúng cấu trúc tiếng Việt.`);
                return;
            }
        }

        // Re-construct word with single spaces
        const cleanWord = syllables.join(' ');

        const lastMove = gameData.history[gameData.history.length - 1];
        if (lastMove) {
            const lastWord = lastMove.word.toLowerCase();
            const lastSyllables = lastWord.split(/\s+/).filter(s => s.length > 0);
            const lastChar = lastSyllables[lastSyllables.length - 1]; // Lấy tiếng cuối
            const firstChar = syllables[0]; // Lấy tiếng đầu

            // Check matching
            if (firstChar !== lastChar) {
                showError(`Từ phải bắt đầu bằng tiếng "${lastChar}"`);
                return;
            }

            // Check duplication
            if (gameData.history.some(m => m.word.toLowerCase() === cleanWord)) {
                showError('Từ này đã được sử dụng rồi!');
                return;
            }
        }

        // Add move
        gameData.history.push({
            uid: currentUser.uid,
            word: input.value.trim(), // Keep original display
            timestamp: Date.now()
        });
        gameData.score = (gameData.score || 0) + 1;
        gameData.current_word = input.value.trim();

        if (isRoomMode) {
            DB.saveRoomGameData(roomId, gameData);
        } else {
            DB.saveGameData(currentUser.uid, gameType, gameData);
        }
        
        input.value = '';
        errorMsg.textContent = '';
        renderGame();
    }

    // Helper: Check valid Vietnamese syllable structure
    function isValidVietnameseSyllable(s) {
        // Basic check for vowel presence
        // Vowels including accented ones
        const vowels = 'aàáảãạăắằẳẵặâấầẩẫậeéèẻẽẹêếềểễệiíìỉĩịoóòỏõọôốồổỗộơớờởỡợuúùủũụưứừửữựyýỳỷỹỵ';
        let hasVowel = false;
        for (let char of s) {
            if (vowels.includes(char)) {
                hasVowel = true;
                break;
            }
        }
        if (!hasVowel) return false;

        // Check for forbidden characters in Vietnamese words (unless telex, but we want clean words)
        // f, j, w, z are not standard Vietnamese consonants
        if (/[fjwz]/.test(s)) return false;

        // Check ending consonant
        // Valid endings: c, ch, m, n, ng, nh, p, t (and vowels)
        // We can check this by removing the last char(s) and seeing what remains
        
        // Regex for valid syllable structure (Simplified)
        // Optional Consonant + Vowel(s) + Optional Tone + Optional Final Consonant
        // This is tricky with regex due to many combinations.
        // Instead, let's use a blacklist approach for common errors seen in "dcc", "dckasd"
        
        // 1. Cannot have 2 consonants at start unless tr, th, ch, ph, nh, kh, gh, gi, ng, ngh, qu
        // 2. Cannot have 2 consonants at end unless ch, ng, nh
        // 3. Cannot have consonants inside vowel cluster (e.g. 'adu' -> a-d-u -> d inside vowels -> invalid for single syllable)
        
        // Better approach:
        // Use a strict regex for the whole syllable structure
        // ^(phụ_âm_đầu)?(vần_nguyên_âm)(phụ_âm_cuối)?$
        
        // Consonants Start: 
        // b, c, d, đ, g, h, k, l, m, n, p, q, r, s, t, v, x
        // ch, gh, gi, kh, ng, ngh, nh, ph, qu, th, tr
        
        // Consonants End:
        // c, ch, m, n, ng, nh, p, t
        
        // Vowels: [a-y...] (all vowels)
        
        // Let's try a regex that matches valid endings.
        // If it ends in a consonant, it must be one of the allowed ones.
        
        // Get the last characters that are NOT vowels
        let endConsonants = '';
        for (let i = s.length - 1; i >= 0; i--) {
            if (!vowels.includes(s[i])) {
                endConsonants = s[i] + endConsonants;
            } else {
                break; // Stop at first vowel from right
            }
        }

        if (endConsonants.length > 0) {
            // Check if valid ending
            const validEndings = ['c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't'];
            if (!validEndings.includes(endConsonants)) {
                return false; // Invalid ending (e.g. 'd', 'k', 's', 'sd', 'cc')
            }
        }

        // Check for "stuck" consonants in middle? 
        // e.g. "adu" -> "d" is surrounded by vowels? No, "adu" parsed as 1 syllable.
        // If "adu" is 1 syllable:
        // Vowels: a, u. Consonants: d.
        // "d" is not at start (starts with a). "d" is not at end (ends with u).
        // So "d" is in middle. Vietnamese syllables don't have middle consonants.
        // Vowel cluster must be contiguous.
        
        // Find indices of all vowels
        let vowelIndices = [];
        for (let i = 0; i < s.length; i++) {
            if (vowels.includes(s[i])) vowelIndices.push(i);
        }
        
        // Check if vowel indices are contiguous
        for (let i = 0; i < vowelIndices.length - 1; i++) {
            if (vowelIndices[i+1] !== vowelIndices[i] + 1) {
                return false; // Gaps between vowels -> Invalid (e.g. a-d-u)
            }
        }

        return true;
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        setTimeout(() => {
            errorMsg.textContent = '';
        }, 3000);
    }
});
