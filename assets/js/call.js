/**
 * ============================================
 * CALL.JS - WebRTC Audio/Video Calling Logic
 * ============================================
 * Uses LocalStorage (via database.js) as the Signaling Server.
 * Works strictly between two tabs on the same browser/device.
 */

const Call = {
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    targetUid: null,
    pollInterval: null,
    callType: 'audio',
    isInitiator: false,
    callTimeout: null,
    candidateQueue: [],

    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    },

    CALL_TIMEOUT_MS: 30000,

    // ===== UI Elements =====
    elements() {
        return {
            incomingModal: document.getElementById('incoming-call-modal'),
            outgoingScreen: document.getElementById('outgoing-call-screen'),
            activeScreen: document.getElementById('active-call-screen'),
            localVideo: document.getElementById('local-video'),
            remoteVideo: document.getElementById('remote-video'),
            callerName: document.getElementById('caller-name'),
            callerAvt: document.getElementById('caller-avt'),
            callTypeText: document.getElementById('call-type-text'),
            statusText: document.getElementById('active-call-status'),
            ringtone: document.getElementById('ringtone-audio'),
            outgoingRingtone: document.getElementById('outgoing-ringtone'),
            outCallerName: document.getElementById('outgoing-caller-name'),
            outCallerAvt: document.getElementById('outgoing-caller-avt'),
            outCallType: document.getElementById('outgoing-call-type'),
            outStatus: document.getElementById('outgoing-status'),
            activeCallAvt: document.getElementById('active-call-avt'),
            activeCallName: document.getElementById('active-call-name')
        };
    },

    init() {
        this.startSignalingPolling();
    },

    // ===== SIGNALING POLLING =====
    startSignalingPolling() {
        setInterval(async () => {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) return;
            
            const signals = DB.getCallSignals(currentUser.uid);
            if (signals.length > 0) {
                console.log('[Call] Received', signals.length, 'signal(s):', signals.map(s => s.type));
                DB.clearCallSignals(currentUser.uid);
                // Xử lý tuần tự, đợi từng signal xong mới xử lý cái tiếp
                for (const signal of signals) {
                    await this.handleSignal(signal);
                }
            }
        }, 500);
    },

    async handleSignal(signal) {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) return;

        if (signal.type === 'offer') {
            this.targetUid = signal.callerId;
            this.callType = signal.isVideo ? 'video' : 'audio';
            this.showIncomingModal(signal.callerId, signal.isVideo);
            
            await this.setupPeerConnection();
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
            this.processQueuedCandidates();

        } else if (signal.type === 'answer') {
            if (this.peerConnection) {
                this.clearCallTimeout();
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                this.showActiveCallScreen();
                this.processQueuedCandidates();
            }
        } else if (signal.type === 'candidate') {
            if (this.peerConnection) {
                if (this.peerConnection.remoteDescription) {
                    try {
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
                    } catch (e) {
                        console.error('Error adding ICE candidate', e);
                    }
                } else {
                    this.candidateQueue.push(signal.data);
                }
            }
        } else if (signal.type === 'reject') {
            this.clearCallTimeout();
            this.endCall(false);
            alert("Người dùng đã từ chối cuộc gọi.");
        } else if (signal.type === 'hangup') {
            this.clearCallTimeout();
            this.endCall(false);
        }
    },

    async processQueuedCandidates() {
        while (this.candidateQueue.length > 0) {
            const candidate = this.candidateQueue.shift();
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('Error adding queued ICE candidate', e);
            }
        }
    },

    sendSignal(targetId, type, data, isVideo = false) {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) return;
        
        DB.pushCallSignal(targetId, {
            callerId: currentUser.uid,
            type: type,
            data: data,
            isVideo: isVideo
        });
    },

    // ===== CORE WEBRTC =====
    async setupPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.config);
        this.candidateQueue = [];

        // Gửi ICE candidate qua localStorage queue - không cần delay nữa
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(this.targetUid, 'candidate', event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            const els = this.elements();
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                els.remoteVideo.srcObject = this.remoteStream;
            }
            this.remoteStream.addTrack(event.track);
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            if (!this.peerConnection) return;
            const state = this.peerConnection.connectionState;
            const els = this.elements();
            
            if (state === 'connected') {
                this.startCallTimer();
            } else if (state === 'disconnected' || state === 'failed') {
                this.stopCallTimer();
                els.statusText.innerText = "Mất kết nối...";
                setTimeout(() => this.endCall(true), 3000);
            }
        };
    },

    async startLocalStream(isVideo) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: isVideo
            });
            const els = this.elements();
            els.localVideo.srcObject = this.localStream;
            els.localVideo.style.display = isVideo ? 'block' : 'none';

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            return true;
        } catch (e) {
            alert("Không thể truy cập camera/micro: " + e.message);
            this.endCall(false);
            return false;
        }
    },

    // ===== CALL ACTIONS =====
    async startCall(targetUid, isVideo) {
        if (!targetUid) {
            alert("Vui lòng chọn người để gọi!");
            return;
        }
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) {
            alert("Bạn cần đăng nhập để thực hiện cuộc gọi!");
            return;
        }
        if (targetUid === currentUser.uid) {
            alert("Bạn không thể tự gọi cho chính mình!");
            return;
        }
        if (this.peerConnection) {
            alert("Bạn đang trong một cuộc gọi khác!");
            return;
        }

        this.isInitiator = true;
        this.targetUid = targetUid;
        this.callType = isVideo ? 'video' : 'audio';

        // Hiển thị giao diện gọi đi
        this.showOutgoingScreen(targetUid, isVideo);

        await this.setupPeerConnection();
        const success = await this.startLocalStream(isVideo);
        if (!success) return;

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.sendSignal(this.targetUid, 'offer', offer, isVideo);
        
        this.callTimeout = setTimeout(() => {
            if (this.peerConnection && this.isInitiator) {
                this.endCall(true);
                alert("Người dùng không trả lời cuộc gọi.");
            }
        }, this.CALL_TIMEOUT_MS);
    },

    async acceptCall() {
        this.hideIncomingModal();
        this.showActiveCallScreen();

        const success = await this.startLocalStream(this.callType === 'video');
        if (!success) {
            this.sendSignal(this.targetUid, 'reject', null);
            return;
        }

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.sendSignal(this.targetUid, 'answer', answer);
    },

    declineCall() {
        this.hideIncomingModal();
        if (this.targetUid) {
            this.sendSignal(this.targetUid, 'reject', null);
        }
        this.cleanup();
    },

    toggleMic() {
        if (!this.localStream) return;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('btn-toggle-mic');
            if (btn) {
                if (!audioTrack.enabled) {
                    btn.classList.add('muted');
                    btn.innerHTML = '<span class="icon">🔇</span>';
                } else {
                    btn.classList.remove('muted');
                    btn.innerHTML = '<span class="icon">🎙️</span>';
                }
            }
        }
    },

    toggleVideo() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('btn-toggle-video');
            const localVideoEl = this.elements().localVideo;
            
            if (btn) {
                if (!videoTrack.enabled) {
                    btn.classList.add('muted');
                    btn.innerHTML = '<span class="icon">🚫</span>';
                    localVideoEl.style.opacity = '0'; // Ẩn hình ảnh camera nội bộ
                } else {
                    btn.classList.remove('muted');
                    btn.innerHTML = '<span class="icon">📹</span>';
                    localVideoEl.style.opacity = '1'; // Hiện hình ảnh camera
                }
            }
        } else {
            alert("Cuộc gọi này không có camera. Bạn cần gọi video để bật camera.");
        }
    },

    endCall(sendHangup = true) {
        this.clearCallTimeout();
        if (sendHangup && this.targetUid) {
            this.sendSignal(this.targetUid, 'hangup', null);
        }
        this.hideIncomingModal();
        this.hideOutgoingScreen();
        this.elements().activeScreen.style.display = 'none';
        this.cleanup();
    },

    clearCallTimeout() {
        if (this.callTimeout) {
            clearTimeout(this.callTimeout);
            this.callTimeout = null;
        }
    },

    cleanup() {
        this.clearCallTimeout();
        this.stopCallTimer();
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.remoteStream = null;
        this.targetUid = null;
        this.isInitiator = false;
        this.candidateQueue = [];
        
        // Reset UI
        const els = this.elements();
        els.localVideo.srcObject = null;
        els.remoteVideo.srcObject = null;
        
        const btnMic = document.getElementById('btn-toggle-mic');
        const btnVid = document.getElementById('btn-toggle-video');
        if (btnMic) { btnMic.classList.remove('muted'); btnMic.innerHTML = '<span class="icon">🎙️</span>'; }
        if (btnVid) { btnVid.classList.remove('muted'); }
    },

    startCallTimer() {
        this.stopCallTimer();
        let seconds = 0;
        const statusEl = this.elements().statusText;
        
        this.callDurationInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            statusEl.innerText = `${mins}:${secs}`;
        }, 1000);
    },

    stopCallTimer() {
        if (this.callDurationInterval) {
            clearInterval(this.callDurationInterval);
            this.callDurationInterval = null;
        }
    },

    // ===== UI: OUTGOING CALL SCREEN =====
    showOutgoingScreen(targetUid, isVideo) {
        const els = this.elements();
        const targetUser = DB.findUserByUID(targetUid);
        
        if (targetUser) {
            const avatar = typeof getRealAvatar === 'function' ? getRealAvatar(targetUser) : 'https://i.imgur.com/6VBx3io.png';
            els.outCallerName.innerText = targetUser.username;
            els.outCallerAvt.src = avatar;
        } else {
            els.outCallerName.innerText = 'Người dùng #' + targetUid;
        }
        
        els.outCallType.innerText = isVideo ? '📹 Cuộc gọi video' : '📞 Cuộc gọi thoại';
        els.outStatus.innerText = 'Đang đổ chuông...';
        els.outgoingScreen.style.display = 'flex';
        
        if (els.outgoingRingtone) {
            els.outgoingRingtone.play().catch(e => console.error("Outgoing audio play prevented:", e));
        }
    },

    hideOutgoingScreen() {
        const els = this.elements();
        els.outgoingScreen.style.display = 'none';
        if (els.outgoingRingtone) {
            els.outgoingRingtone.pause();
            els.outgoingRingtone.currentTime = 0;
        }
    },

    // ===== UI: ACTIVE CALL SCREEN =====
    showActiveCallScreen() {
        const els = this.elements();
        this.hideOutgoingScreen();
        
        const targetUser = DB.findUserByUID(this.targetUid);
        if (targetUser) {
            const avatar = typeof getRealAvatar === 'function' ? getRealAvatar(targetUser) : 'https://i.imgur.com/6VBx3io.png';
            if (els.activeCallAvt) els.activeCallAvt.src = avatar;
            if (els.activeCallName) els.activeCallName.innerText = targetUser.username;
        }
        
        els.statusText.innerText = "Đã kết nối ✓";
        els.activeScreen.style.display = 'flex';
    },

    // ===== UI: INCOMING MODAL =====
    showIncomingModal(callerId, isVideo) {
        const caller = DB.findUserByUID(callerId);
        const els = this.elements();
        
        if (caller) {
            els.callerName.innerText = caller.username;
            els.callerAvt.src = typeof getRealAvatar === 'function' ? getRealAvatar(caller) : 'https://i.imgur.com/6VBx3io.png';
        }
        
        els.callTypeText.innerText = isVideo ? "gọi video cho bạn" : "gọi thoại cho bạn";
        document.getElementById('accept-btn-icon').innerText = isVideo ? '📹' : '📞';
        
        els.incomingModal.style.display = 'flex';
        els.ringtone.play().catch(e => console.error("Audio play prevented:", e));
    },

    hideIncomingModal() {
        const els = this.elements();
        els.incomingModal.style.display = 'none';
        els.ringtone.pause();
        els.ringtone.currentTime = 0;
    }
};

setTimeout(() => Call.init(), 1000);
