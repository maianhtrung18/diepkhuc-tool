// ==UserScript==
// @name         Diep Khuc - Force 4K + 8Mbps
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://www.diepkhuc.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_WIDTH = 3840;
    const TARGET_HEIGHT = 2160;
    const TARGET_FPS = 60;
    const TARGET_BITRATE = 12_000_000;

    const VIDEO_QUALITY_KEY = 'dk-video-quality';

    let currentWidth = TARGET_WIDTH;
    let currentHeight = TARGET_HEIGHT;
    let currentFps = TARGET_FPS;

    console.log('[DK 4K8M] 🚀 Loaded');

    function loadVideoQuality() {

        try {

            const saved =
                  JSON.parse(
                      localStorage.getItem(VIDEO_QUALITY_KEY)
                  );

            if (
                saved &&
                Number.isFinite(saved.width) &&
                Number.isFinite(saved.height) &&
                Number.isFinite(saved.fps)
            ) {
                currentWidth = saved.width;
                currentHeight = saved.height;
                currentFps = saved.fps;
            }

        } catch (err) {

            console.warn(
                '[DK 4K8M] ⚠️ Load video quality failed:',
                err
            );
        }

        console.log(
            '[DK 4K8M] 🎥 VIDEO CONFIG:',
            currentWidth,
            currentHeight,
            currentFps
        );
    }

    function saveVideoQuality() {

        localStorage.setItem(
            VIDEO_QUALITY_KEY,
            JSON.stringify({
                width: currentWidth,
                height: currentHeight,
                fps: currentFps
            })
        );
    }

    async function setVideoQuality(width, height, fps) {

        const pcs =
              window.__dkPeerConnections || [];

        for (const pc of pcs) {

            // Bỏ qua PeerConnection của room cũ
            if (pc.connectionState !== 'connected') {
                continue;
            }

            const sender =
                  pc.getSenders().find(
                      sender =>
                      sender.track &&
                      sender.track.kind === 'video' &&
                      sender.track.readyState === 'live'
                  );

            if (!sender) {
                continue;
            }

            const track = sender.track;

            try {

                await track.applyConstraints({

                    width: {
                        ideal: width,
                        max: width
                    },

                    height: {
                        ideal: height,
                        max: height
                    },

                    frameRate: {
                        ideal: fps,
                        max: fps
                    }

                });

                const params = sender.getParameters();

                if (params.encodings && params.encodings.length) {
                    for (const encoding of params.encodings) {
                        encoding.maxFramerate = fps;
                    }

                    await sender.setParameters(params);
                }

                const settings =
                      track.getSettings();

                console.log(
                    '[DK 4K8M] 🎥 VIDEO QUALITY:',
                    JSON.stringify({
                        requested: {
                            width,
                            height,
                            fps
                        },
                        actual: {
                            width: settings.width,
                            height: settings.height,
                            fps: settings.frameRate
                        }
                    }, null, 2)
                );

            } catch (err) {

                console.error(
                    '[DK 4K8M] ❌ setVideoQuality:',
                    err
                );

                // PC này lỗi → bỏ qua, thử PC tiếp theo
                continue;
            }

            return;
        }

        console.warn(
            '[DK 4K8M] ⚠️ No video sender found'
        );
    }

    // =========================================================
    // 1. FORCE Janus getUserMedia:
    // =========================================================

    const originalGUM =
          navigator.mediaDevices.getUserMedia.bind(
              navigator.mediaDevices
          );

    navigator.mediaDevices.getUserMedia = async function (constraints) {

        console.log(
            '[DK 4K8M] 📥 GUM ORIGINAL:',
            JSON.stringify(constraints, null, 2)
        );

        let modified = false;

        if (
            constraints &&
            constraints.video &&
            typeof constraints.video === 'object'
        ) {
            const video = constraints.video;

            constraints = {
                ...constraints,

                video: {
                    ...video,

                    width: {
                        ideal: currentWidth,
                        max: currentWidth
                    },

                    height: {
                        ideal: currentHeight,
                        max: currentHeight
                    },

                    frameRate: {
                        ideal: currentFps,
                        max: currentFps
                    }
                }
            };

            modified = true;

            console.log(
                '[DK 4K8M] 🔥 FORCE VIDEO → 3840x2160 @ 60 FPS'
            );

            console.log(
                '[DK 4K8M] 🔧 GUM MODIFIED:',
                JSON.stringify(constraints, null, 2)
            );

        }

        const stream =
              await originalGUM(constraints);

        for (const track of stream.getVideoTracks()) {

            const s = track.getSettings();

            console.log(
                '[DK 4K8M] 📤 GUM RESULT:',
                JSON.stringify({
                    id: track.id,
                    label: track.label,
                    width: s.width,
                    height: s.height,
                    frameRate: s.frameRate,
                    resizeMode: s.resizeMode
                }, null, 2)
            );
        }

        if (modified) {
            console.log(
                '[DK 4K8M] ✅ 4K source created'
            );
        }

        return stream;
    };


    // =========================================================
    // 2. FORCE WebRTC sender bitrate = TARGET_BITRATE Mbps
    // =========================================================

    const OriginalPC =
          window.RTCPeerConnection;

    function forceSenderBitrate(pc) {

        const videoSender =
              pc.getSenders().find(
                  sender =>
                  sender.track &&
                  sender.track.kind === 'video'
              );

        if (!videoSender) {
            return false;
        }

        try {

            const params =
                  videoSender.getParameters();

            if (!params.encodings ||
                !params.encodings.length) {

                params.encodings = [{}];
            }

            for (const encoding of params.encodings) {

                encoding.maxBitrate =
                    TARGET_BITRATE;

                encoding.maxFramerate = currentFps;

                encoding.scaleResolutionDownBy = 1;
            }

            params.degradationPreference =
                'maintain-resolution';

            videoSender.setParameters(params)
                .then(() => {

                console.log(
                    `[DK 4K8M] 🚀 SENDER BITRATE = ${TARGET_BITRATE} Mbps`
                );

                const verify =
                      videoSender.getParameters();

                console.log(
                    '[DK 4K8M] ⚙️ SENDER PARAMS:',
                    JSON.stringify({
                        degradationPreference:
                        verify.degradationPreference,
                        encodings:
                        verify.encodings
                    }, null, 2)
                );

            })
                .catch(err => {

                console.error(
                    '[DK 4K8M] ❌ setParameters:',
                    err
                );
            });

            return true;

        } catch (err) {

            console.error(
                '[DK 4K8M] ❌ Sender parameter error:',
                err
            );

            return false;
        }
    }

    function createVideoQualityUI() {

        if (document.querySelector('#dk-quality-panel')) {
            return;
        }

        const panel =
              document.createElement('div');

        panel.id = 'dk-quality-panel';

        panel.innerHTML = `
        <div class="dk-quality-row">

            <label>
                R
               <select id="dk-resolution">
    <option value="3840x2160">3840 × 2160</option>
    <option value="3200x1800">3200 × 1800</option>
    <option value="2560x1440">2560 × 1440</option>
    <option value="1920x1080">1920 × 1080</option>
    <option value="1600x900">1600 × 900</option>
    <option value="1280x720">1280 × 720</option>
    <option value="960x540">960 × 540</option>
    <option value="854x480">854 × 480</option>
    <option value="640x360">640 × 360</option>
    <option value="426x240">426 × 240</option>
    <option value="320x180">320 × 180</option>
    <option value="256x144">256 × 144</option>
    <option value="160x90">160 × 90</option>
</select>
            </label>

            <label>
                FPS
                <select id="dk-fps">
    <option value="60">60</option>
    <option value="50">50</option>
    <option value="40">40</option>
    <option value="30">30</option>
    <option value="25">25</option>
    <option value="24">24</option>
    <option value="20">20</option>
    <option value="15">15</option>
    <option value="10">10</option>
    <option value="5">5</option>
</select>
            </label>

            <div id="dk-limit-status">
                <span id="dk-limit-light"></span>
               
            </div>

        </div>
    `;

        const insertPanel = () => {

            const liveListener = document.querySelector(
                '[data-class="LiveListener"].live-listener'
            );

            if (!liveListener) {
                return false;
            }

            const videoContainer =
                  liveListener.querySelector('.overflow-hidden');


            if (!videoContainer) {
                return false;
            }

            videoContainer.insertAdjacentElement(
                'afterend',
                panel
            );

            return true;
        };


        const initVideoQualityControls = () => {

            const resolution =
                  panel.querySelector('#dk-resolution');

            const fps =
                  panel.querySelector('#dk-fps');

            if (!resolution || !fps) {
                return;
            }

            resolution.value =
                `${currentWidth}x${currentHeight}`;

            fps.value =
                String(currentFps);

            resolution.addEventListener('change', () => {

                const [width, height] =
                      resolution.value.split('x').map(Number);

                currentWidth = width;
                currentHeight = height;

                saveVideoQuality();

                setVideoQuality(
                    currentWidth,
                    currentHeight,
                    currentFps
                );
            });

            fps.addEventListener('change', () => {

                currentFps =
                    Number(fps.value);

                saveVideoQuality();

                setVideoQuality(
                    currentWidth,
                    currentHeight,
                    currentFps
                );
            });
        };


        if (!insertPanel()) {

            const observer = new MutationObserver(() => {

                if (insertPanel()) {

                    observer.disconnect();

                    initVideoQualityControls();
                }

            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        } else {

            initVideoQualityControls();
        }

        const style =
              document.createElement('style');

        style.textContent = `
#dk-quality-panel {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-size: 12px;
    border-radius: 6px;
}

        .dk-quality-row {
            display: flex;
            align-items: center;
            gap: 10px;
            white-space: nowrap;
        }

        .dk-quality-row label {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .dk-quality-row select {
            background: #222;
            color: white;
            border: 1px solid #555;
            border-radius: 4px;
            padding: 3px 5px;
        }

        #dk-limit-status {
            display: flex;
            align-items: center;
            gap: 5px;
            font-weight: bold;
        }

        #dk-limit-light {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            display: inline-block;
            background: #22c55e;
        }

        #dk-limit-light.limited {
            background: #ef4444;
            box-shadow: 0 0 7px #ef4444;
        }
    `;

        document.head.appendChild(style);

        const resolution =
              panel.querySelector('#dk-resolution');

        const fps =
              panel.querySelector('#dk-fps');

        // UI lấy từ local
        resolution.value =
            `${currentWidth}x${currentHeight}`;

        fps.value =
            String(currentFps);

        // Resolution thay đổi
        resolution.addEventListener(
            'change',
            () => {

                const [
                    width,
                    height
                ] = resolution.value
                .split('x')
                .map(Number);

                currentWidth = width;
                currentHeight = height;

                saveVideoQuality();

                setVideoQuality(
                    currentWidth,
                    currentHeight,
                    currentFps
                );
            }
        );

        // FPS thay đổi
        fps.addEventListener(
            'change',
            () => {

                currentFps =
                    Number(fps.value);

                saveVideoQuality();

                setVideoQuality(
                    currentWidth,
                    currentHeight,
                    currentFps
                );
            }
        );
    }

    function updateLimitLight(reason) {

        const light =
              document.querySelector(
                  '#dk-limit-light'
              );

        if (!light) {
            return;
        }

        light.classList.toggle(
            'limited',
            reason &&
            reason !== 'none'
        );
    }
    // =========================================================
    // 3. Trace addTrack + createOffer + setLocalDescription
    // =========================================================

    function tracePC(pc) {

        const originalAddTrack =
              pc.addTrack.bind(pc);

        const originalCreateOffer =
              pc.createOffer.bind(pc);

        const originalSetLocalDescription =
              pc.setLocalDescription.bind(pc);

        let hasVideo = false;

        pc.addTrack = function (track, ...streams) {

            if (track.kind === 'video') {

                hasVideo = true;

                const s =
                      track.getSettings();

                console.log(
                    '[DK 4K8M] 🎥 addTrack:',
                    JSON.stringify({
                        id: track.id,
                        label: track.label,
                        width: s.width,
                        height: s.height,
                        frameRate: s.frameRate,
                        resizeMode: s.resizeMode
                    }, null, 2)
                );
            }

            const sender =
                  originalAddTrack(track, ...streams);

            if (track.kind === 'video') {

                setTimeout(() => {

                    setVideoQuality(
                        currentWidth,
                        currentHeight,
                        currentFps
                    );

                }, 100);
            }

            if (track.kind === 'video') {

                console.log(
                    '[DK 4K8M] 🔧 Forcing sender parameters...'
                );

                forceSenderBitrate(pc);
            }

            return sender;
        };


        pc.createOffer = async function (...args) {

            if (hasVideo) {

                console.log(
                    '[DK 4K8M] 🔧 Re-applying TARGET_BITRATE Mbps before offer'
                );

                forceSenderBitrate(pc);

                const sender =
                      pc.getSenders().find(
                          s =>
                          s.track &&
                          s.track.kind === 'video'
                      );

                if (sender) {

                    const s =
                          sender.track.getSettings();

                    console.log(
                        '[DK 4K8M] 🎥 SOURCE AT OFFER:',
                        JSON.stringify({
                            width: s.width,
                            height: s.height,
                            frameRate: s.frameRate,
                            resizeMode: s.resizeMode
                        }, null, 2)
                    );
                }
            }

            const offer =
                  await originalCreateOffer(...args);

            return offer;
        };


        pc.setLocalDescription = async function (...args) {

            if (hasVideo) {

                console.log(
                    '[DK 4K8M] 🔧 Re-applying TARGET_BITRATE Mbps before SLD'
                );

                forceSenderBitrate(pc);
            }

            const result =
                  await originalSetLocalDescription(...args);

            if (hasVideo) {

                console.log(
                    '[DK 4K8M] 📡 setLocalDescription'
                );

                startStats(pc);
            }

            return result;
        };

        return pc;
    }


    // =========================================================
    // 4. OUTBOUND RTP STATS
    // =========================================================

    function startStats(pc) {

        if (pc.__dk4k8mStatsStarted) {
            return;
        }

        pc.__dk4k8mStatsStarted = true;

        let check = 0;

        const timer =
              setInterval(async () => {

                  if (
                      pc.connectionState === 'closed' ||
                      pc.iceConnectionState === 'closed'
                  ) {
                      clearInterval(timer);
                      return;
                  }

                  check++;

                  try {

                      const stats =
                            await pc.getStats();

                      stats.forEach(report => {

                          if (
                              report.type !== 'outbound-rtp' ||
                              report.kind !== 'video'
                          ) {
                              return;
                          }

                          // Tìm codec tương ứng với outbound RTP
                          const codec = report.codecId
                          ? stats.get(report.codecId)
                          : null;
                          updateLimitLight(
                              report.qualityLimitationReason
                          );
                          console.log(
                              '[DK 4K8M] 📊 OUTBOUND CHECK',
                              check,
                              JSON.stringify({
                                  // 🎥 VIDEO
                                  frameWidth: report.frameWidth,
                                  frameHeight: report.frameHeight,
                                  framesPerSecond: report.framesPerSecond,
                                  framesEncoded: report.framesEncoded,

                                  // 📡 BITRATE
                                  bytesSent: report.bytesSent,
                                  targetBitrate: report.targetBitrate,

                                  // ⚠️ LIMITATION
                                  qualityLimitationReason:
                                  report.qualityLimitationReason,

                                  qualityLimitationDurations:
                                  report.qualityLimitationDurations,

                                  // 🎞️ CODEC
                                  codecId: report.codecId,
                                  mimeType: codec?.mimeType,
                                  codecPayloadType: codec?.payloadType,
                                  sdpFmtpLine: codec?.sdpFmtpLine,

                                  // 🔀 SCALABILITY
                                  scalabilityMode: report.scalabilityMode

                              }, null, 2)
                          );
                      });

                  } catch (err) {

                      console.error(
                          '[DK 4K8M] ❌ Stats:',
                          err
                      );
                  }

              }, 1000);
    }


    // =========================================================
    // 5. PATCH RTCPeerConnection
    // =========================================================

    function DKPeerConnection(...args) {

        const pc =
              new OriginalPC(...args);

        if (!window.__dkPeerConnections) {
            window.__dkPeerConnections = [];
        }

        window.__dkPeerConnections.push(pc);

        return tracePC(pc);
    }

    DKPeerConnection.prototype =
        OriginalPC.prototype;

    Object.setPrototypeOf(
        DKPeerConnection,
        OriginalPC
    );

    window.RTCPeerConnection =
        DKPeerConnection;


    // =========================================================
    // 6. PATCH WebSocket bitrate message
    // =========================================================

    const OriginalWebSocket =
          window.WebSocket;

    const originalSend =
          OriginalWebSocket.prototype.send;

    OriginalWebSocket.prototype.send =
        function (data) {

        try {

            if (typeof data === 'string') {

                const msg =
                      JSON.parse(data);

                /*
                     * Janus publish/configure message.
                     * Chỉ nâng bitrate nếu message đã có
                     * trường body.bitrate.
                     */
                if (
                    msg &&
                    msg.body &&
                    typeof msg.body === 'object' &&
                    Object.prototype.hasOwnProperty.call(
                        msg.body,
                        'bitrate'
                    )
                ) {

                    const oldBitrate =
                          msg.body.bitrate;

                    msg.body.bitrate =
                        TARGET_BITRATE;

                    console.log(
                        '[DK 4K8M] 💥 JANUS BITRATE:',
                        oldBitrate,
                        '→',
                        TARGET_BITRATE
                    );

                    data =
                        JSON.stringify(msg);
                }
            }

        } catch (err) {
            // Không phải JSON / không phải Janus message
        }

        return originalSend.call(
            this,
            data
        );
    };

    loadVideoQuality();

    if (document.body) {

        createVideoQualityUI();

    } else {

        document.addEventListener(
            'DOMContentLoaded',
            createVideoQualityUI,
            { once: true }
        );
    }
    console.log(
        '[DK 4K8M] ✅ All hooks installed'
    );

})();
