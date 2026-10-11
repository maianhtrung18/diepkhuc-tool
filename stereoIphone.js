// ==UserScript==
// @name         Diep Khuc Audio v2.6.0 Stereo Test
// @namespace    diep-khuk-user-labels
// @version      2.6.0
// @description  Test stereo SDP answer on Safari without changing audio streams
// @match        https://diepkhuc.com/*
// @match        https://www.diepkhuc.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    if (window.__DK_AUDIO_STEREO_TEST_V260__) {
        return;
    }
    window.__DK_AUDIO_STEREO_TEST_V260__ = true;
    const logPrefix = '[DK Stereo v2.6.0]';
    function log(...args) {
        console.log(logPrefix, ...args);
    }
    function patchAnswerSdp(sdp) {
        if (typeof sdp !== 'string' || !sdp) {
            return { sdp, changed: false, reason: 'SDP không hợp lệ' };
        }
        const lines = sdp.split(/\r\n|\n/);
        let inAudio = false;
        let opusPayloads = [];
        let changed = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('m=')) {
                inAudio = line.startsWith('m=audio ');
                opusPayloads = [];
                if (inAudio) {
                    const parts = line.trim().split(/\s+/);
                    const payloads = parts.slice(3);
                    // Chỉ tìm payload Opus trong audio section này.
                    for (const payload of payloads) {
                        const rtpmap = new RegExp(
                            '^a=rtpmap:' + payload +
                            '\\s+opus/48000(?:/2)?\\s*$',
                            'i'
                        );
                        if (lines.some(s => rtpmap.test(s))) {
                            opusPayloads.push(payload);
                        }
                    }
                }
                continue;
            }
            if (!inAudio) continue;
            const match = line.match(/^a=fmtp:(\d+)\s+(.+)$/i);
            if (!match || !opusPayloads.includes(match[1])) continue;
            const payload = match[1];
            let params = match[2];
            if (/(?:^|;)\s*stereo\s*=/i.test(params)) {
                params = params.replace(
                    /(^|;)\s*stereo\s*=\s*[01]/i,
                    '$1stereo=1'
                );
            } else {
                params += ';stereo=1';
            }
            if (params !== match[2]) {
                lines[i] = `a=fmtp:${payload} ${params}`;
                changed = true;
                log('Đã cập nhật fmtp cho Opus payload', payload);
            }
        }
        // Không tự tạo fmtp mới nếu SDP answer không có dòng fmtp Opus.
        return {
            sdp: changed ? lines.join('\r\n') : sdp,
            changed,
            reason: changed
                ? 'Đã thêm stereo=1 vào SDP answer'
                : 'Không tìm thấy fmtp Opus phù hợp để sửa'
        };
    }
    function installPatch() {
        const proto = window.RTCPeerConnection &&
            window.RTCPeerConnection.prototype;
        if (!proto || typeof proto.setLocalDescription !== 'function') {
            log('Không tìm thấy RTCPeerConnection.setLocalDescription');
            return;
        }
        if (proto.setLocalDescription.__dkStereoPatched) {
            log('Patch đã được cài');
            return;
        }
        const original = proto.setLocalDescription;
        function patchedSetLocalDescription(description, ...args) {
            let desc = description;
            try {
                if (
                    desc &&
                    desc.type === 'answer' &&
                    typeof desc.sdp === 'string'
                ) {
                    const result = patchAnswerSdp(desc.sdp);
                    log('Kết quả:', result.reason);
                    if (result.changed) {
                        desc = new RTCSessionDescription({
                            type: desc.type,
                            sdp: result.sdp
                        });
                    }
                }
            } catch (error) {
                // Nếu patch lỗi, giữ nguyên mô tả ban đầu.
                log('Lỗi patch SDP; giữ nguyên mô tả:', error);
                desc = description;
            }
            return original.call(this, desc, ...args);
        }
        patchedSetLocalDescription.__dkStereoPatched = true;
        proto.setLocalDescription = patchedSetLocalDescription;
        log('Đã cài patch setLocalDescription');
    }
    installPatch();
    // Báo cáo nhanh trạng thái các kết nối WebRTC.
    function reportConnections() {
        const pcs = window.__dkStereoConnections || [];
        const result = {
            version: '2.6.0',
            userAgent: navigator.userAgent,
            peerConnectionCount: pcs.length,
            media: [],
            note: 'Mở Console để xem log patch SDP.'
        };
        document.querySelectorAll('video, audio').forEach((el, index) => {
            const stream = el.srcObject;
            result.media.push({
                index,
                tag: el.tagName.toLowerCase(),
                paused: el.paused,
                muted: el.muted,
                volume: el.volume,
                hasSrcObject: !!stream,
                audioTracks: stream
                    ? stream.getAudioTracks().map(track => ({
                        id: track.id,
                        enabled: track.enabled,
                        muted: track.muted,
                        readyState: track.readyState
                    }))
                    : []
            });
        });
        console.log(logPrefix, JSON.stringify(result, null, 2));
        return result;
    }
    // Ghi nhận các peer connection mới để tiện chẩn đoán.
    const OriginalPC = window.RTCPeerConnection;
    if (OriginalPC && !OriginalPC.__dkStereoTracker) {
        const tracked = [];
        function TrackedRTCPeerConnection(...args) {
            const pc = new OriginalPC(...args);
            tracked.push(pc);
            window.__dkStereoConnections = tracked;
            pc.addEventListener('connectionstatechange', () => {
                log('PeerConnection state:', pc.connectionState);
            });
            return pc;
        }
        TrackedRTCPeerConnection.prototype = OriginalPC.prototype;
        Object.setPrototypeOf(TrackedRTCPeerConnection, OriginalPC);
        TrackedRTCPeerConnection.__dkStereoTracker = true;
        window.RTCPeerConnection = TrackedRTCPeerConnection;
        window.__dkStereoConnections = tracked;
    }
    window.dkStereoReport = reportConnections;
    log('Script đã chạy. Gõ dkStereoReport() trong Console để xem báo cáo.');
})();
