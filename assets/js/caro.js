document.addEventListener('DOMContentLoaded', () => {
    Auth.requireAuth();

    const currentUser = Auth.getCurrentUser();
    const gameType = 'caro';
    const cells = document.querySelectorAll('.cell');
    const statusEl = document.getElementById('game-status');
    const currentTurnNameEl = document.getElementById('current-turn-name');
    const currentSymbolEl = document.getElementById('current-symbol');
    const playerXEl = document.getElementById('player-x');
    const playerOEl = document.getElementById('player-o');
    const nameXEl = document.getElementById('name-x');
    const nameOEl = document.getElementById('name-o');
    const scoreXEl = document.getElementById('score-x');
    const scoreOEl = document.getElementById('score-o');
    const btnReset = document.getElementById('btn-reset-game');
    const userCoinsEl = document.getElementById('user-coins');
    
    // Betting Controls (Modal)
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

    // Get Room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const isSpectateMode = urlParams.get('spectate') === '1';
    const isRoomMode = !!roomId;
    const activeRoomId = roomId;
    
    // Live Stats Elements
    const bettingCountEl = document.getElementById('betting-count');
    const watchViewersEl = document.getElementById('watch-viewers');
    const specInfo = document.getElementById('spectator-info');
    
    let showSpecBetting = null; // To be defined later

    // Random Live Stats Logic
    let currentBettors = Math.floor(Math.random() * 50) + 10; // 10-60
    let currentViewers = currentBettors + Math.floor(Math.random() * 100) + 20; // Viewers > Bettors

    function updateLiveStats() {
        const betChange = Math.floor(Math.random() * 5) - 2;
        currentBettors = Math.max(5, currentBettors + betChange);
        const viewChange = Math.floor(Math.random() * 10) - 3;
        currentViewers = Math.max(currentBettors + 5, currentViewers + viewChange);
        if (bettingCountEl) bettingCountEl.textContent = currentBettors.toLocaleString();
        if (watchViewersEl) watchViewersEl.textContent = currentViewers.toLocaleString();
    }

    if (specInfo) specInfo.style.display = 'block';
    updateLiveStats();
    setInterval(updateLiveStats, 4000);

    // Track whether bet has been confirmed this session
    let betConfirmed = false;
    let isCountingDown = false; // New flag for 5s countdown

    const countdownOverlay = document.getElementById('game-countdown-overlay');
    const countdownNumberEl = document.getElementById('countdown-number');
    const cornerCountdown = document.getElementById('corner-countdown');
    const cornerCountdownNumber = document.getElementById('corner-countdown-number');

    function startBettingCountdown(callback) {
        if (isCountingDown) return;
        isCountingDown = true;
        
        let timeLeft = 10;
        
        // 1. Hiện số đếm ngược ở góc TRƯỚC
        if (cornerCountdown) cornerCountdown.style.display = 'flex';
        if (cornerCountdownNumber) cornerCountdownNumber.textContent = timeLeft;
        
        // Hide big win if visible
        const bigWin = document.getElementById('big-win-display');
        if (bigWin) bigWin.style.display = 'none';
        
        // 2. Sau 500ms mới mở khung đặt cược (để người dùng thấy số đếm trước)
        if (isSpectateMode) {
            setTimeout(() => {
                if (typeof showSpecBetting === 'function') {
                    showSpecBetting();
                } else {
                    const specOverlayEl = document.getElementById('spec-bet-overlay');
                    if (specOverlayEl) specOverlayEl.style.display = 'flex';
                }
            }, 500);
        }

        const timer = setInterval(() => {
            timeLeft--;
            if (cornerCountdownNumber) cornerCountdownNumber.textContent = timeLeft;

            if (timeLeft <= 0) {
                clearInterval(timer);
                isCountingDown = false;
                if (cornerCountdown) cornerCountdown.style.display = 'none';
                
                // Hết giờ → ẩn khung cược
                const specOverlayEl = document.getElementById('spec-bet-overlay');
                if (isSpectateMode && specOverlayEl) {
                    specOverlayEl.style.display = 'none';
                }
                
                if (callback) callback();
            }
        }, 1000);
    }
    if (isSpectateMode) {
        betConfirmed = true;
        if (bettingOverlay) bettingOverlay.classList.add('hidden');
        if (btnReset) btnReset.style.display = 'none';
    }

    let gameData = isRoomMode ? DB.getRoomGameData(activeRoomId) : DB.getGameData(currentUser.uid, gameType);
    let mySymbol = 'X'; 
    let lastWinner = null;
    let roomInfo = isRoomMode ? DB.getRoom(activeRoomId) : null;
    let spectateBotInterval = null;

    // Polling
    setInterval(() => {
        const newData = isRoomMode ? DB.getRoomGameData(activeRoomId) : DB.getGameData(currentUser.uid, gameType);
        
        if (newData && JSON.stringify(newData) !== JSON.stringify(gameData)) {
            gameData = newData;
            renderGame();
        }
    }, 1000); 

    initGame();

    function initGame() {
        // Initialize caro game data structure if missing or incomplete
        if (!gameData || !gameData.board) {
            const partner = DB.getLinkedPartner(currentUser.uid);
            
            if (isRoomMode) {
                // Room mode - should have been initialized by lobby
                if (!gameData) {
                    alert('Không tìm thấy dữ liệu phòng chơi!');
                    window.location.href = 'lobby.html';
                    return;
                }
            } else {
                // Legacy couple mode - initialize proper caro data
                const opponentUid = partner ? partner.uid : 'bot';
                gameData = {
                    board: Array(9).fill(null),
                    turn: 'X',
                    players: { X: currentUser.uid, O: opponentUid },
                    winner: null,
                    winningLine: [],
                    scores: { X: 0, O: 0 },
                    betAmount: 0,
                    betConfirmed: false
                };
                DB.saveGameData(currentUser.uid, gameType, gameData);
            }
        }

        // Ensure all required fields exist (for older saved data)
        if (!gameData.players) gameData.players = { X: currentUser.uid, O: 'bot' };
        if (!gameData.scores) gameData.scores = { X: 0, O: 0 };
        if (!gameData.board) gameData.board = Array(9).fill(null);
        if (!gameData.turn) gameData.turn = 'X';
        if (gameData.winningLine === undefined) gameData.winningLine = [];
        if (gameData.betAmount === undefined) gameData.betAmount = 0;
        if (gameData.betConfirmed === undefined) gameData.betConfirmed = false;

        // Logic for Room Mode
        if (isRoomMode) {
            if (!roomInfo) {
                alert('Phòng không tồn tại hoặc đã bị xóa.');
                window.location.href = 'lobby.html';
                return;
            }

            const isBotMatch = roomInfo.isBotMatch === true;
            
            // Check if it's a new game to start countdown BEFORE bot logic
            const hasMovesOnLoad = gameData.board.some(cell => cell !== null);
            if (!hasMovesOnLoad && !gameData.winner) {
                startBettingCountdown();
            }

            if (isSpectateMode) {
                if (!isBotMatch) {
                    alert('Chỉ được xem các phòng Máy.');
                    window.location.href = 'lobby.html';
                    return;
                }
                mySymbol = 'SPECTATOR';
                betConfirmed = true;
                if (gameData) gameData.betConfirmed = true;
                if (bettingOverlay) bettingOverlay.classList.add('hidden');
                if (btnReset) btnReset.style.display = 'none';
                cells.forEach(cell => {
                    cell.style.pointerEvents = 'none';
                });

                if (!spectateBotInterval) {
                    let waitingForCountdown = false;

                    const tick = () => {
                        if (isCountingDown) return; // Bot chờ countdown xong mới đánh
                        if (waitingForCountdown) return; // Chờ countdown bắt đầu

                        const latest = DB.getRoomGameData(activeRoomId);
                        if (!latest || !Array.isArray(latest.board)) return;

                        // === Game vừa kết thúc ===
                        if (latest.winner) {
                            if (!latest.__resetAt) {
                                // Đợi 2.5s hiển thị kết quả trước khi reset
                                latest.__resetAt = Date.now() + 2500;
                                DB.saveRoomGameData(activeRoomId, latest);
                                return;
                            }
                            if (Date.now() >= latest.__resetAt) {
                                // Reset bàn cờ
                                latest.board = Array(9).fill(null);
                                latest.turn = 'X';
                                latest.winner = null;
                                latest.winningLine = [];
                                delete latest.__resetAt;
                                DB.saveRoomGameData(activeRoomId, latest);

                                // Bắt đầu countdown 10 giây để đặt cược
                                waitingForCountdown = true;
                                startBettingCountdown(() => {
                                    // Callback khi countdown xong → bot bắt đầu chơi lại
                                    waitingForCountdown = false;
                                });
                            }
                            return;
                        }

                        // === Bot đánh nước cờ ===
                        const sym = latest.turn;
                        const opp = sym === 'X' ? 'O' : 'X';
                        let move = -1;
                        
                        if (Math.random() > 0.3) {
                            move = findWinningMove(latest.board, sym);
                            if (move === -1) move = findWinningMove(latest.board, opp);
                            if (move === -1 && latest.board[4] === null) move = 4;
                        }

                        if (move === -1) {
                            const empty = latest.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
                            if (empty.length > 0) move = empty[Math.floor(Math.random() * empty.length)];
                        }
                        if (move === -1) return;

                        latest.board[move] = sym;
                        
                        const winPatterns = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
                        let winPattern = null;
                        for (let p of winPatterns) {
                            if (p.every(idx => latest.board[idx] === sym)) {
                                winPattern = p;
                                break;
                            }
                        }

                        if (winPattern) {
                            latest.winner = sym;
                            latest.winningLine = winPattern;
                            latest.scores = latest.scores || { X: 0, O: 0 };
                            latest.scores[sym] = (latest.scores[sym] || 0) + 1;
                        } else if (latest.board.every(cell => cell !== null)) {
                            latest.winner = 'draw';
                        } else {
                            latest.turn = sym === 'X' ? 'O' : 'X';
                        }

                        DB.saveRoomGameData(activeRoomId, latest);
                    };

                    tick();
                    spectateBotInterval = setInterval(tick, 1200);
                }
            }

            if (gameData.players) {
                if (gameData.players.X === currentUser.uid) mySymbol = 'X';
                else if (gameData.players.O === currentUser.uid) mySymbol = 'O';
                else {
                    if (!isSpectateMode) {
                        alert('Bạn không thuộc phòng này.');
                        window.location.href = 'lobby.html';
                        return;
                    }
                }
            }
            
            // Set initial bet from room info if new game
            if (roomInfo && (!gameData.betAmount || gameData.betAmount === 0)) {
                gameData.betAmount = roomInfo.bet;
                gameData.betConfirmed = true; // Room bet is pre-set
                betConfirmed = true;
                DB.saveRoomGameData(roomId, gameData);
            } else if (gameData.betAmount > 0) {
                betConfirmed = true;
                gameData.betConfirmed = true;
            }
        } else {
            // Legacy couple mode - check if bet was already confirmed
            if (gameData.betConfirmed) {
                betConfirmed = true;
            }
            
            // Check for new game in legacy mode too
            const hasMovesOnLoad = gameData.board.some(cell => cell !== null);
            if (!hasMovesOnLoad && !gameData.winner) {
                startBettingCountdown();
            }
        }
        
        lastWinner = gameData.winner;
        renderGame();
    }

    function renderGame() {
        // Check for Game Over transition (Sync for both players)
        if (gameData.winner) {
            if (lastWinner !== gameData.winner) {
                lastWinner = gameData.winner;
                if (!isSpectateMode) {
                    handleGameEnd(gameData.winner);
                }
            }
        } else {
            lastWinner = null;
        }

        const partner = DB.getLinkedPartner(currentUser.uid);

        // Update Coins
        const coins = DB.getCoins(currentUser.uid);
        if (userCoinsEl) userCoinsEl.textContent = coins;
        if (modalUserCoins) modalUserCoins.textContent = coins;

        // Show/Hide Betting Modal
        // Show modal only if bet has NOT been confirmed AND game is not over
        if (!betConfirmed && !gameData.betConfirmed && !gameData.winner && !isSpectateMode) {
            // New game, need bet
            if (bettingOverlay) bettingOverlay.classList.remove('hidden');
            if (ingameBetInfo) ingameBetInfo.style.display = 'none';
        } else {
            // Game started or ended, or watch mode
            if (bettingOverlay) bettingOverlay.classList.add('hidden');
            
            // Show small bet info
            const currentBet = parseInt(gameData.betAmount) || 0;
            if (ingameBetInfo) {
                ingameBetInfo.style.display = 'block';
                if (currentBetDisplay) currentBetDisplay.textContent = currentBet;
            }
        }

        // Update Player Names for Room Mode
        if (isRoomMode) {
            const currentData = gameData || {};
            const players = currentData.players || {};
            const xUid = players.X;
            const oUid = players.O;
            const isBotMatch = roomInfo && roomInfo.isBotMatch === true;
            const xUser = isBotMatch
                ? { username: roomInfo.botXName || 'Người chơi X', uid: xUid }
                : DB.findUserByUID(xUid);
            const oUser = isBotMatch
                ? { username: roomInfo.botOName || 'Người chơi O', uid: oUid }
                : (oUid === 'bot' ? { username: 'Máy', uid: 'bot' } : DB.findUserByUID(oUid));
            
            if (isSpectateMode) {
                nameXEl.textContent = xUser ? xUser.username : '...';
                nameOEl.textContent = oUser ? oUser.username : '...';
            } else {
                nameXEl.textContent = xUser ? (xUser.uid === currentUser.uid ? 'BẠN' : xUser.username) : '...';
                nameOEl.textContent = oUser ? (oUser.uid === currentUser.uid ? 'BẠN' : oUser.username) : '...';
            }

            if (xUid === currentUser.uid) mySymbol = 'X';
            else if (oUid === currentUser.uid) mySymbol = 'O';
        } else {
            // Legacy Player Info
            if (gameData.players && gameData.players.X) {
                const xUid = gameData.players.X;
                if (xUid === currentUser.uid) {
                    nameXEl.textContent = 'BẠN';
                    mySymbol = 'X';
                } else if (partner && xUid === partner.uid) {
                    nameXEl.textContent = partner.username;
                    mySymbol = 'O';
                }
            }
            
            if (gameData.players && gameData.players.O) {
                const oUid = gameData.players.O;
                if (oUid === currentUser.uid) {
                    nameOEl.textContent = 'BẠN';
                    mySymbol = 'O';
                } else if (partner && oUid === partner.uid) {
                    nameOEl.textContent = partner.username;
                    mySymbol = 'X';
                } else if (oUid === 'bot') {
                    nameOEl.textContent = 'Máy';
                }
            }
        }

        // Scores
        scoreXEl.textContent = (gameData.scores || {}).X || 0;
        scoreOEl.textContent = (gameData.scores || {}).O || 0;

        // Board
        cells.forEach((cell, index) => {
            cell.textContent = gameData.board[index] || '';
            cell.className = 'cell'; // reset
            if (gameData.board[index] === 'X') cell.classList.add('x');
            if (gameData.board[index] === 'O') cell.classList.add('o');
            
            if (gameData.winningLine && gameData.winningLine.includes(index)) {
                cell.classList.add('winning');
            }
        });

        // Turn Indicator
        if (gameData.winner) {
            if (gameData.winner === 'draw') {
                statusEl.textContent = 'Hòa!';
                currentTurnNameEl.textContent = '-';
            } else {
                const winnerName = gameData.winner === 'X' ? nameXEl.textContent : nameOEl.textContent;
                let statusMsg = `${winnerName} thắng! 🎉`;
                
                const bet = parseInt(gameData.betAmount) || 0;
                if (!isSpectateMode) {
                    if (gameData.winner === mySymbol) {
                         statusMsg += ` <span style="color: #ffd700;">(+${bet > 0 ? bet : 10} xu)</span>`;
                    } else if (bet > 0) {
                         statusMsg += ` <span style="color: #ff6b6b;">(-${bet} xu)</span>`;
                    }
                }

                statusEl.innerHTML = statusMsg;
                currentTurnNameEl.textContent = winnerName;
            }
        } else {
            statusEl.textContent = '';
            const turnName = gameData.turn === 'X' ? nameXEl.textContent : nameOEl.textContent;
            currentTurnNameEl.textContent = turnName;
            currentSymbolEl.textContent = gameData.turn;
            
            playerXEl.classList.toggle('active', gameData.turn === 'X');
            playerOEl.classList.toggle('active', gameData.turn === 'O');
        }
    }

    // Handle Click
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            const index = parseInt(cell.getAttribute('data-index'));
            handleMove(index);
        });
    });

    function handleMove(index) {
        if (isSpectateMode || isCountingDown) return;
        if (gameData.winner || gameData.board[index]) return;

        // Check if bet has been confirmed
        if (!betConfirmed && !gameData.betConfirmed) {
            alert('Vui lòng đặt cược trước khi chơi!');
            return;
        }

        // Check balance for room mode
        if (isRoomMode && roomInfo && roomInfo.bet > 0) {
             const currentCoins = DB.getCoins(currentUser.uid);
             if (currentCoins < roomInfo.bet) {
                 alert('Bạn đã hết xu để tiếp tục chơi!');
                 return;
             }
        } else if (!isRoomMode) {
            // Legacy betting checks
            const bet = parseInt(gameData.betAmount) || 0;
            if (bet > 0) {
                const currentCoins = DB.getCoins(currentUser.uid);
                if (currentCoins < bet) {
                    alert(`Bạn không đủ xu để chơi với mức cược ${bet}!`);
                    return;
                }
            }
        }

        // Check turn
        if (isRoomMode) {
            if (roomInfo && roomInfo.mode === 'pve') {
                 if (gameData.turn !== 'X') return; // User is always X in PvE
            } else {
                 // PvP
                 if (gameData.turn !== mySymbol) {
                    statusEl.textContent = 'Chưa đến lượt của bạn!';
                    setTimeout(() => statusEl.textContent = '', 1000);
                    return;
                 }
            }
        } else {
            // Legacy Logic
            if (gameData.players.O !== 'bot') {
                // PvP
                if (gameData.turn !== mySymbol) {
                    statusEl.textContent = 'Chưa đến lượt của bạn!';
                    setTimeout(() => statusEl.textContent = '', 1000);
                    return;
                }
            } else {
                // PvE (Solo) - only allow X move
                if (gameData.turn !== 'X') return;
            }
        }

        // Make move
        gameData.board[index] = gameData.turn;
        
        // Check Win
        if (checkWin(gameData.board, gameData.turn)) {
            gameData.winner = gameData.turn;
            gameData.scores[gameData.turn]++;
        } else if (gameData.board.every(cell => cell !== null)) {
            gameData.winner = 'draw';
        } else {
            // Switch turn
            gameData.turn = gameData.turn === 'X' ? 'O' : 'X';
        }

        if (isRoomMode) {
            DB.saveRoomGameData(roomId, gameData);
        } else {
            DB.saveGameData(currentUser.uid, gameType, gameData);
        }
        renderGame();

        // Bot Move
        const isBotGame = (gameData.players.O === 'bot') || (roomInfo && roomInfo.mode === 'pve');
        
        if (!gameData.winner && isBotGame && gameData.turn === 'O') {
            setTimeout(makeBotMove, 500);
        }
    }

    function handleGameEnd(winner) {
        if (isSpectateMode) return;
        if (winner !== 'draw') {
            const bet = parseInt(gameData.betAmount) || 0;
            
            // Check if I won
            if (winner === mySymbol) {
                const earned = bet > 0 ? bet : 10;
                DB.addCoins(currentUser.uid, earned);
                
                // Show big win display for player
                const bigWinDisplay = document.getElementById('big-win-display');
                const bigWinAmountEl = document.getElementById('big-win-amount');
                if (bigWinDisplay && bigWinAmountEl) {
                    bigWinAmountEl.textContent = `+${earned}`;
                    bigWinDisplay.style.display = 'flex';
                    setTimeout(() => {
                        bigWinDisplay.style.display = 'none';
                    }, 4000);
                }
            } else {
                // I lost
                if (bet > 0) {
                    DB.addCoins(currentUser.uid, -bet);
                }
            }
        }
        
        // Update coins display immediately
        const coins = DB.getCoins(currentUser.uid);
        if (userCoinsEl) userCoinsEl.textContent = coins;

        // Auto reset and start betting window after 3s
        setTimeout(() => {
            resetGame();
            // startBettingCountdown is now called inside resetGame()
        }, 3000);
    }

    if (btnConfirmBet) {
        btnConfirmBet.addEventListener('click', (e) => {
            e.stopPropagation();
            const amount = parseInt(betInputLarge.value);
            if (isNaN(amount) || amount <= 0) {
                alert('Bạn phải đặt cược ít nhất 1 xu mới được chơi!');
                return;
            }
            
            // Check balance only if betting > 0
            if (amount > 0) {
                const currentCoins = DB.getCoins(currentUser.uid);
                if (amount > currentCoins) {
                    alert(`Bạn không đủ xu! Hiện có: ${currentCoins}`);
                    return;
                }
            }

            // Set bet and mark as confirmed
            gameData.betAmount = amount;
            gameData.betConfirmed = true;
            betConfirmed = true;
            gameData.board = Array(9).fill(null);
            gameData.winner = null;
            gameData.winningLine = [];
            gameData.turn = 'X'; 
            
            if (isRoomMode) {
                DB.saveRoomGameData(roomId, gameData);
            } else {
                DB.saveGameData(currentUser.uid, gameType, gameData);
            }
            
            if (bettingOverlay) bettingOverlay.classList.add('hidden');
            renderGame();
        });
    }

    if (btnBackBet) {
        btnBackBet.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'games.html';
        });
    }

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
            current += 10;
            betInputLarge.value = current;
        });
    }

    if (chipBtns) {
        chipBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = btn.getAttribute('data-val');
                if (val === 'All') {
                    const currentCoins = DB.getCoins(currentUser.uid);
                    betInputLarge.value = currentCoins;
                } else {
                    let current = parseInt(betInputLarge.value) || 0;
                    current += parseInt(val);
                    betInputLarge.value = current;
                }
            });
        });
    }

    function resetGame() {
        gameData.board = Array(9).fill(null);
        gameData.turn = 'X';
        gameData.winner = null;
        gameData.winningLine = [];
        
        // Reset bet for non-room mode (show betting modal again)
        if (!isRoomMode) {
            gameData.betAmount = 0;
            gameData.betConfirmed = false;
            betConfirmed = false;
            // Reset bet input
            if (betInputLarge) betInputLarge.value = 0;
        }
        
        if (isRoomMode) {
            DB.saveRoomGameData(roomId, gameData);
        } else {
            DB.saveGameData(currentUser.uid, gameType, gameData);
        }
        renderGame();
        
        // Start 5s betting window on reset
        startBettingCountdown();
    }

    function makeBotMove() {
        if (isCountingDown) return;
        const board = gameData.board;
        const mySym = 'O';
        const oppSym = 'X';

        // 1. Check if can win
        const winMove = findWinningMove(board, mySym);
        if (winMove !== -1) {
            executeMove(winMove);
            return;
        }

        // 2. Check if need to block
        const blockMove = findWinningMove(board, oppSym);
        if (blockMove !== -1) {
            executeMove(blockMove);
            return;
        }

        // 3. Take center if available
        if (board[4] === null) {
            executeMove(4);
            return;
        }

        // 4. Take corners if available
        const corners = [0, 2, 6, 8];
        const emptyCorners = corners.filter(i => board[i] === null);
        if (emptyCorners.length > 0) {
            const randomCorner = emptyCorners[Math.floor(Math.random() * emptyCorners.length)];
            executeMove(randomCorner);
            return;
        }

        // 5. Take random available
        const emptyIndices = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (emptyIndices.length > 0) {
            const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
            executeMove(randomIdx);
        }
    }

    function findWinningMove(board, sym) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        // Clone board to avoid mutation during check
        const testBoard = [...board];

        for (let i = 0; i < testBoard.length; i++) {
            if (testBoard[i] === null) {
                // Try move
                testBoard[i] = sym;
                let isWin = false;
                for (let pattern of winPatterns) {
                    if (pattern.every(idx => testBoard[idx] === sym)) {
                        isWin = true;
                        break;
                    }
                }
                // Undo move
                testBoard[i] = null;
                
                if (isWin) return i;
            }
        }
        return -1;
    }

    function executeMove(index) {
        gameData.board[index] = 'O';
        
        if (checkWin(gameData.board, 'O')) {
            gameData.winner = 'O';
            gameData.scores['O']++;
        } else if (gameData.board.every(cell => cell !== null)) {
            gameData.winner = 'draw';
        } else {
            gameData.turn = 'X';
        }
        
        if (isRoomMode) {
            DB.saveRoomGameData(roomId, gameData);
        } else {
            DB.saveGameData(currentUser.uid, gameType, gameData);
        }
        renderGame();
    }

    function checkWin(board, symbol) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        for (let pattern of winPatterns) {
            if (pattern.every(idx => board[idx] === symbol)) {
                gameData.winningLine = pattern;
                return true;
            }
        }
        return false;
    }

    btnReset.addEventListener('click', () => {
        if (confirm('Chơi ván mới?')) {
            resetGame();
        }
    });

    // ===== SPECTATOR BETTING (Tài / Xỉu / Hòa) =====
    if (isSpectateMode) {
        const specOverlay = document.getElementById('spec-bet-overlay');
        const specCoinsEl = document.getElementById('spec-coins');
        const specBetOptions = document.getElementById('spec-bet-options');
        const specAmountRow = document.getElementById('spec-bet-amount-row');
        const specSelectedLabel = document.getElementById('spec-bet-selected-label');
        const specBetInput = document.getElementById('spec-bet-input');
        const specConfirmBtn = document.getElementById('spec-confirm-bet');
        const specCancelBtn = document.getElementById('spec-cancel-bet');
        const specNoBetBtn = document.getElementById('spec-no-bet');
        const specInitialActions = document.getElementById('spec-initial-actions');
        const specCloseActive = document.getElementById('spec-close-active');
        const specCloseResult = document.getElementById('spec-close-result');
        const specMinusBtn = document.getElementById('spec-minus');
        const specPlusBtn = document.getElementById('spec-plus');
        const specActiveDiv = document.getElementById('spec-bet-active');
        const specActiveAmount = document.getElementById('spec-active-amount');
        const specActiveChoice = document.getElementById('spec-active-choice');
        const specPotentialWin = document.getElementById('spec-potential-win');
        const specResultDiv = document.getElementById('spec-bet-result');
        const specResultText = document.getElementById('spec-result-text');
        const taiNameEl = document.getElementById('tai-name');
        const xiuNameEl = document.getElementById('xiu-name');
        const bettingCountEl = document.getElementById('betting-count');
        const watchViewersEl = document.getElementById('watch-viewers');
        const bigWinDisplay = document.getElementById('big-win-display');
        const bigWinAmountEl = document.getElementById('big-win-amount');

        let specSelectedChoice = null; // 'tai', 'xiu', 'hoa'
        let specBetAmount = 0;
        let specBetPlaced = false;
        let specBetSettled = false;

        const RATE_TAI_XIU = 2; // x2
        const RATE_HOA = 5;     // x5

        // Random Live Stats Logic
        let currentBettors = Math.floor(Math.random() * 50) + 10; // 10-60
        let currentViewers = currentBettors + Math.floor(Math.random() * 100) + 20; // Viewers > Bettors

        function updateLiveStats() {
            const betChange = Math.floor(Math.random() * 5) - 2;
            currentBettors = Math.max(5, currentBettors + betChange);
            const viewChange = Math.floor(Math.random() * 10) - 3;
            currentViewers = Math.max(currentBettors + 5, currentViewers + viewChange);
            if (bettingCountEl) bettingCountEl.textContent = currentBettors.toLocaleString();
            if (watchViewersEl) watchViewersEl.textContent = currentViewers.toLocaleString();
        }

        updateLiveStats();
        setInterval(updateLiveStats, 4000);

        showSpecBetting = () => {
            if (isSpectateMode && !specBetPlaced && isCountingDown) {
                if (specOverlay) specOverlay.style.display = 'flex';
                updateSpecCoins();
                updateBotNames();
            }
        };

        // Close buttons
        [specCancelBtn, specCloseActive, specCloseResult].forEach(btn => {
            if (btn) btn.addEventListener('click', () => {
                if (specOverlay) specOverlay.style.display = 'none';
            });
        });

        // Click on coin display to show betting panel
        const specCoinContainer = document.querySelector('.spec-bet-coins');
        if (specCoinContainer) {
            specCoinContainer.style.cursor = 'pointer';
            specCoinContainer.addEventListener('click', () => {
                if(isCountingDown) showSpecBetting();
            });
        }
        
        // Also show when clicking the live info bar
        if (specInfo) {
            specInfo.style.cursor = 'pointer';
            specInfo.addEventListener('click', () => {
                if(isCountingDown) showSpecBetting();
            });
        }

        // Initial check to show betting panel if game hasn't started
        const hasMoves = gameData && gameData.board && gameData.board.some(cell => cell !== null);
        if (!hasMoves && !gameData.winner) {
            // Wait for countdown logic to handle showing the modal
        } else if (gameData && gameData.winner) {
            // If someone already won when we loaded, prepare result but don't show overlay automatically
            settleSpecBet(gameData.winner);
        }

        // Update coins display
        function updateSpecCoins() {
            const c = DB.getCoins(currentUser.uid);
            if (specCoinsEl) specCoinsEl.textContent = c;
            if (userCoinsEl) userCoinsEl.textContent = c;
        }
        updateSpecCoins();

        // Update bot names on buttons
        function updateBotNames() {
            if (roomInfo) {
                if (taiNameEl) taiNameEl.textContent = roomInfo.botXName || 'X thắng';
                if (xiuNameEl) xiuNameEl.textContent = roomInfo.botOName || 'O thắng';
            }
        }
        updateBotNames();

        // Click choice buttons
        document.querySelectorAll('.spec-bet-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                if (specBetPlaced) return; // Already placed

                // Toggle selection
                document.querySelectorAll('.spec-bet-choice').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                specSelectedChoice = btn.getAttribute('data-choice');

                const labels = { tai: 'TÀI', xiu: 'XỈU', hoa: 'HÒA' };
                specSelectedLabel.textContent = `Đã chọn: ${labels[specSelectedChoice]}`;
                specAmountRow.style.display = 'block';
                if (specInitialActions) specInitialActions.style.display = 'none';
            });
        });

        // +/- buttons
        if (specMinusBtn) {
            specMinusBtn.addEventListener('click', () => {
                let v = parseInt(specBetInput.value) || 0;
                v = Math.max(1, v - 10);
                specBetInput.value = v;
            });
        }
        if (specPlusBtn) {
            specPlusBtn.addEventListener('click', () => {
                let v = parseInt(specBetInput.value) || 0;
                v += 10;
                specBetInput.value = v;
            });
        }

        // Chip buttons
        document.querySelectorAll('.spec-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const val = chip.getAttribute('data-val');
                if (val === 'All') {
                    specBetInput.value = DB.getCoins(currentUser.uid);
                } else {
                    let cur = parseInt(specBetInput.value) || 0;
                    cur += parseInt(val);
                    specBetInput.value = cur;
                }
            });
        });

        // Cancel
        if (specCancelBtn) {
            specCancelBtn.addEventListener('click', () => {
                specSelectedChoice = null;
                document.querySelectorAll('.spec-bet-choice').forEach(b => b.classList.remove('selected'));
                specAmountRow.style.display = 'none';
                if (specInitialActions) specInitialActions.style.display = 'block';
                
                // If user resets choice, reset selection on UI
                document.querySelectorAll('.spec-bet-choice').forEach(b => b.classList.remove('selected'));
            });
        }

        if (specNoBetBtn) {
            specNoBetBtn.addEventListener('click', () => {
                if (specOverlay) specOverlay.style.display = 'none';
            });
        }

        // Confirm bet
        if (specConfirmBtn) {
            specConfirmBtn.addEventListener('click', () => {
                const amount = parseInt(specBetInput.value);
                if (!specSelectedChoice) { alert('Vui lòng chọn kèo!'); return; }
                if (isNaN(amount) || amount <= 0) { alert('Nhập số xu hợp lệ!'); return; }

                const coins = DB.getCoins(currentUser.uid);
                if (amount > coins) { alert(`Không đủ xu! Hiện có: ${coins}`); return; }

                specBetAmount = amount;
                specBetPlaced = true;
                specBetSettled = false;

                // Deduct coins immediately
                DB.addCoins(currentUser.uid, -amount);
                updateSpecCoins();

                // Hide modal options
                specBetOptions.style.display = 'none';
                specAmountRow.style.display = 'none';
                specActiveDiv.style.display = 'block';
                specResultDiv.style.display = 'none';

                const labels = { tai: 'TÀI', xiu: 'XỈU', hoa: 'HÒA' };
                const rate = specSelectedChoice === 'hoa' ? RATE_HOA : RATE_TAI_XIU;
                specActiveAmount.textContent = amount;
                specActiveChoice.textContent = labels[specSelectedChoice];
                specPotentialWin.textContent = `+${amount * rate} xu`;

                // Show onscreen bet display
                const onscreenBetContainer = document.getElementById('spectator-active-bet');
                const onscreenBetAmount = document.getElementById('spec-onscreen-amount');
                const onscreenBetChoice = document.getElementById('spec-onscreen-choice');
                if (onscreenBetContainer && onscreenBetAmount && onscreenBetChoice) {
                    onscreenBetAmount.textContent = amount;
                    onscreenBetChoice.textContent = labels[specSelectedChoice];
                    onscreenBetChoice.className = 'highlight-choice ' + specSelectedChoice;
                    onscreenBetContainer.style.display = 'block';
                }

                // Immediately hide modal
                if (specOverlay) {
                    specOverlay.style.display = 'none';
                }
            });
        }

        // Settle bet when game ends
        function settleSpecBet(winner) {
            if (!specBetPlaced || specBetSettled) return;
            specBetSettled = true;

            // hide onscreen bet
            const onscreenBetContainer = document.getElementById('spectator-active-bet');
            if (onscreenBetContainer) onscreenBetContainer.style.display = 'none';

            let result = null; // 'tai', 'xiu', 'hoa'
            if (winner === 'X') result = 'tai';
            else if (winner === 'O') result = 'xiu';
            else if (winner === 'draw') result = 'hoa';

            const rate = specSelectedChoice === 'hoa' ? RATE_HOA : RATE_TAI_XIU;
            const isWin = specSelectedChoice === result;

            if (isWin) {
                const winAmount = specBetAmount * rate;
                DB.addCoins(currentUser.uid, winAmount);
                
                // Show win display
                if (bigWinDisplay && bigWinAmountEl) {
                    const bigWinLabel = bigWinDisplay.querySelector('.big-win-label');
                    if (bigWinLabel) bigWinLabel.textContent = 'TRÚNG KÈO';
                    bigWinAmountEl.textContent = `+${winAmount}`;
                    bigWinAmountEl.style.color = '#000';
                    bigWinDisplay.style.background = 'radial-gradient(circle, rgba(255, 215, 0, 0.9) 0%, rgba(255, 170, 0, 0.95) 100%)';
                    bigWinDisplay.style.borderColor = '#fff';
                    bigWinDisplay.style.boxShadow = '0 0 50px rgba(255, 215, 0, 0.6), 0 0 100px rgba(255, 215, 0, 0.3)';
                    bigWinDisplay.style.display = 'flex';
                    setTimeout(() => {
                        bigWinDisplay.style.display = 'none';
                    }, 2000);
                }
            } else {
                // Show loss display
                if (bigWinDisplay && bigWinAmountEl) {
                    const bigWinLabel = bigWinDisplay.querySelector('.big-win-label');
                    if (bigWinLabel) bigWinLabel.textContent = 'TRƯỢT KÈO';
                    bigWinAmountEl.textContent = `-${specBetAmount}`;
                    bigWinAmountEl.style.color = '#fff';
                    bigWinDisplay.style.background = 'radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(185, 28, 28, 0.95) 100%)';
                    bigWinDisplay.style.borderColor = '#ffe4e6';
                    bigWinDisplay.style.boxShadow = '0 0 50px rgba(239, 68, 68, 0.6), 0 0 100px rgba(239, 68, 68, 0.3)';
                    bigWinDisplay.style.display = 'flex';
                    setTimeout(() => {
                        bigWinDisplay.style.display = 'none';
                    }, 2000);
                }
            }

            updateSpecCoins();
        }

        // Reset bet for next round
        function resetSpecBet() {
            specSelectedChoice = null;
            specBetAmount = 0;
            specBetPlaced = false;
            specBetSettled = false;

            const onscreenBetContainer = document.getElementById('spectator-active-bet');
            if (onscreenBetContainer) onscreenBetContainer.style.display = 'none';

            document.querySelectorAll('.spec-bet-choice').forEach(b => b.classList.remove('selected'));
            specBetOptions.style.display = 'flex';
            specAmountRow.style.display = 'none';
            specActiveDiv.style.display = 'none';
            specBetInput.value = 10;
            if (specInitialActions) specInitialActions.style.display = 'block';

            // Hide result after a delay
            setTimeout(() => {
                specResultDiv.style.display = 'none';
                specResultDiv.className = 'spec-bet-result';
            }, 500);

            updateSpecCoins();
        }

        // Watch for game state changes to settle/reset
        let prevSpecWinner = gameData ? gameData.winner : null;
        setInterval(() => {
            const latest = DB.getRoomGameData(activeRoomId);
            if (!latest) return;

            updateSpecCoins();

            // Game just ended → settle the bet
            if (latest.winner && latest.winner !== prevSpecWinner) {
                prevSpecWinner = latest.winner;
                settleSpecBet(latest.winner);
            }

            // Game just reset (new round) → reset bet state
            // The countdown + overlay showing is handled by the bot tick's startBettingCountdown
            if (!latest.winner && prevSpecWinner) {
                prevSpecWinner = null;
                resetSpecBet();
            }
        }, 800);
    }
});
