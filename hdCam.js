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

    console.log('[DK 4K8M] 🚀 Loaded');

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
                        ideal: TARGET_WIDTH,
                        max: TARGET_WIDTH
                    },

                    height: {
                        ideal: TARGET_HEIGHT,
                        max: TARGET_HEIGHT
                    },

                    frameRate: {
                        ideal: TARGET_FPS,
                        max: TARGET_FPS
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

                encoding.maxFramerate =
                    TARGET_FPS;

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


    console.log(
        '[DK 4K8M] ✅ All hooks installed'
    );

})();
