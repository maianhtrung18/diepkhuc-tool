// ==UserScript==
// @name         Mic Queue Pro DK
// @namespace    http://tampermonkey.net/
// @version      1.1
// @match        https://www.diepkhuc.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    //////////////////////////////////////////////////////
    // STATE
    //////////////////////////////////////////////////////

    let running = false;
    let botTask = null;
    let currentTimeout = null;
    let currentResolve = null;


    let autoCommentRunning = false;
    let autoCommentTask = null;
    let autoCommentMessage = "";

    let commentDelayInput = null;
    let commentTimeout = null;
    let commentResolve = null;

    let firstAutoComment = true;
    const YIELD_WAIT_MS = 30000;

    let autoYieldMic = false;
    let waitMode = false;
    let waitStart = 0;

    let chatTextarea = null;
    let chatForm = null;
    let sendButton = null;

    let mediaRecorder = null;
    let recordedChunks = [];
    let recordButton = null;
    let recordingNick = "";
    let recordingStartTime = null;


     // Audio control
    const originalPlay = HTMLMediaElement.prototype.play;

    HTMLMediaElement.prototype.play = function () {
        const src = this.src || "";

        if (src.includes("countdownbeep.mp3")) {
            this.volume = 0.01;
        }

        if (src.includes("next-in-line-chime.mp3")) {
            this.volume = 0.01;
        }

        return originalPlay.apply(this, arguments);
    };

    // ===============================
    // TOOLBOX KÉO RA / THU VÀO
    // ===============================

    const toolboxStyle = document.createElement('style');

    toolboxStyle.textContent = `
    #my-dkhd-toolbox {
        position: fixed;
        top: 400px;
        left: 0;
        z-index: 999999999;
        display: flex;
        align-items: stretch;
        transition: transform 0.25s ease;
        user-select: none;
    }

    /* Thu toolbox vào cạnh phải */
    #my-dkhd-toolbox.collapsed {
        transform: translateX(calc(-100% + 36px));
    }

    /* Phần thân toolbox */
    #my-dkhd-toolbox .toolbox-body {
        width: 220px;
        min-height: 120px;
        padding: 10px;
        box-sizing: border-box;

        background: rgba(30, 30, 30, 0.96);
        border: 1px solid rgba(255,255,255,0.15);
        border-right: none;
        border-radius: 10px 0 0 10px;

        color: white;
    }

    /* Chỗ để sau này nhét các nút */
   #my-dkhd-toolbox .toolbox-content {
    height: auto;
    min-height: 100px;
    padding: 8px;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 6px;

    border: 1px dashed rgba(255,255,255,0.25);
    border-radius: 6px;

    color: rgba(255,255,255,0.4);
    font-size: 16px;
    }

#my-dkhd-toolbox .toolbox-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
}

#my-dkhd-toolbox .toolbox-row label {
    flex: 1;
    color: white;
}

.toolbox-row .btn {
    font-size: 16px !important;
    padding: 4px 7px !important;
}

#my-dkhd-toolbox .toolbox-row button {
    flex: 0 0 auto;
}

#my-dkhd-toolbox .toolbox-row input[type="number"] {
    width: 55px !important;
    margin-left: auto;
}

    /* Nút kéo ra / thu vào */
    #my-dkhd-toolbox .toolbox-toggle {
        width: 36px;
        min-width: 36px;

        border: none;
        border-radius: 0 8px 8px 0;

        background: #222;
        color: white;

        cursor: pointer;
        font-size: 20px;
    }

    /* Thanh để kéo toolbox */
    #my-dkhd-toolbox .toolbox-drag {
        position: absolute;
        left: 0;
        right: 36px;
        top: 0;
        height: 20px;

        cursor: move;
    }
`;

    document.documentElement.appendChild(toolboxStyle);


    // Tạo toolbox
    const toolbox = document.createElement('div');

    toolbox.id = 'my-dkhd-toolbox';
    toolbox.className = '';

    toolbox.innerHTML = `
    <div class="toolbox-body">

        <div class="toolbox-drag"></div>

        <div class="toolbox-content" id="toolbox-content">
        </div>

    </div>

    <button class="toolbox-toggle" type="button">
        ‹
    </button>
`;


    // Chờ body rồi mới đưa toolbox vào
    function addToolbox() {

        if (!document.body) {
            setTimeout(addToolbox, 50);
            return;
        }

        if (document.getElementById('my-dkhd-toolbox')) {
            return;
        }

       const mainSection = document.querySelector('.main-section');

        if (mainSection) {
            mainSection.style.position = 'relative';
            mainSection.appendChild(toolbox);
        }
    }

    addToolbox();


    // ===============================
    // MỞ / THU
    // ===============================

    const toggle = toolbox.querySelector('.toolbox-toggle');

    toggle.addEventListener('click', function () {

        toolbox.classList.toggle('collapsed');

        if (toolbox.classList.contains('collapsed')) {
            toggle.textContent = '›';
        } else {
            toggle.textContent = '‹';
        }

    });


    // ===============================
    // KÉO TOOLBOX
    // ===============================

    const dragHandle = toolbox.querySelector('.toolbox-drag');

    let dragging = false;
    let startY = 0;
    let startTop = 0;

    dragHandle.addEventListener('pointerdown', function (e) {

        dragging = true;

        startY = e.clientY;
        startTop = toolbox.getBoundingClientRect().top;

        dragHandle.setPointerCapture(e.pointerId);

        e.preventDefault();

    });


    dragHandle.addEventListener('pointermove', function (e) {

        if (!dragging) return;

        const deltaY = e.clientY - startY;

        let newTop = startTop + deltaY;

        const maxTop = window.innerHeight - 70;

        newTop = Math.max(0, Math.min(maxTop, newTop));

        toolbox.style.top = newTop + 'px';

    });


    dragHandle.addEventListener('pointerup', function () {

        dragging = false;

    });


    dragHandle.addEventListener('pointercancel', function () {

        dragging = false;

    });

    //////////////////////////////////////////////////////
    // HELPERS
    //////////////////////////////////////////////////////

    function log(message) {
        console.debug(`[BOT] ${message}`);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

   function sleep(ms) {
       return new Promise(resolve => {
           currentResolve = resolve;
           currentTimeout = setTimeout(() => {
               currentTimeout = null;
               currentResolve = null;
               resolve();
           }, ms);
       });
   }

    function clearSleep() {
        if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
        }

        if (currentResolve) {
            currentResolve();
            currentResolve = null;
        }
    }

    function commentSleep(ms) {
        return new Promise(resolve => {
            commentResolve = resolve;
            commentTimeout = setTimeout(() => {
                commentTimeout = null;
                commentResolve = null;
                resolve();
            }, ms);
        });
    }

    function clearCommentSleep() {
        if (commentTimeout) {
            clearTimeout(commentTimeout);
            commentTimeout = null;
        }
        if (commentResolve) {
            commentResolve();
            commentResolve = null;
        }
    }

    function getRandomMessage(text) {
        const tokens = text.match(/\[[^\]]+\]/g) || [];
        if (tokens.length === 0) return "";

        const shuffled = [...tokens];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const count = 1 + Math.floor(Math.random() * Math.min(8, shuffled.length));
        return shuffled.slice(0, count).join("");
    }

    async function fastSend(message, restore = true) {
        const textarea = chatTextarea;
        const form = chatForm;
        const sendBtn = sendButton;

        if (!textarea || !sendBtn) return false;

        const oldValue = textarea.value;
        textarea.value = message;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        if (form) {
            form.requestSubmit();
        } else {
            sendBtn.click();
        }

        if (restore) {
            textarea.value = oldValue;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }

        return true;
    }

    async function waitForElement(selector, timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await delay(300);
        }
        throw new Error(`Element not found: ${selector}`);
    }

    async function waitButton(text, timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout && running) {
            const btn = [...document.querySelectorAll("button")].find(b =>
                b.innerText?.trim().includes(text)
            );
            if (btn) return btn;
            await delay(300);
        }
        throw new Error(`Button not found: ${text}`);
    }

    function getRoomItems() {
    return [...document.querySelectorAll(".user-list .item")];
    }

   function getMicUsers() {

       return getRoomItems().filter(item => item.querySelector(".info")?.innerText.trim() === "🎤")
                .map(item => item.querySelector(".nick").innerText.trim());
   }

    function getQueueUsers() {

        return getRoomItems().filter(item => /^\d+$/.test(item.querySelector(".info")?.innerText.trim() || ""))
                .map(item => item.querySelector(".nick").innerText.trim());
    }

    function getReturnMicButton() {
        return [...document.querySelectorAll("button")]
            .find(btn => btn.innerText.trim().startsWith("Trả Mic"));
    }


    //////////////////////////////////////////////////////
    // AUTO COMMENT
    //////////////////////////////////////////////////////

    async function autoCommentLoop() {
        while (autoCommentRunning) {
            try {
                if (!chatTextarea) {
                    await delay(1000);
                    continue;
                }

                // Kiểm tra có người đang ON MIC không
                const micUsers = getMicUsers();

                if (micUsers.length === 0) {
                    log("Không có người ON MIC -> chờ...");

                    // Không gửi comment, chỉ chờ rồi kiểm tra lại
                    await commentSleep(10000);

                    if (!autoCommentRunning) break;
                    continue;
                }

                const randomMessage = getRandomMessage(autoCommentMessage);

                await fastSend(randomMessage, true);
                log(`Auto Comment: ${randomMessage}`);

                const seconds = parseInt(commentDelayInput?.value, 10) || 90;
                const delayMs = seconds * 1000 * (0.6 + Math.random() * 0.8);

                log(`Comment tiếp theo sau ${Math.round(delayMs / 1000)} giây`);

                await commentSleep(delayMs);

                if (!autoCommentRunning) break;
            } catch (err) {
                console.error(err);
                await delay(1000);
            }
        }

        autoCommentTask = null;
    }

    //////////////////////////////////////////////////////
    // BOT LOOP
    //////////////////////////////////////////////////////

    async function startBotLoop() {
        log("Bot started");

        while (running) {
            try {

                const micUsers = getMicUsers();
                const queueUsers = getQueueUsers();

                if (waitMode) {
                    log(`waitMode=${waitMode}, autoYieldMic=${autoYieldMic}`);

                    if (micUsers.length > 0 || queueUsers.length > 0) {

                        waitStart = Date.now();

                    } else if (Date.now() - waitStart >= YIELD_WAIT_MS) {

                        waitMode = false;
                        log("Wait mode finished");
                    }

                    await sleep(500);
                    continue;
                }

                const returnBtn = getReturnMicButton();

                if (
                    autoYieldMic &&
                    !waitMode &&
                    returnBtn &&
                    queueUsers.length > 0
                ) {
                    log(`Có ${queueUsers.length} người xếp hàng -> Trả mic`);

                    returnBtn.click();

                    waitMode = true;
                    waitStart = Date.now();

                    await sleep(300);
                    continue;
                }


                const btnNhanMic =
                      [...document.querySelectorAll("button")]
                .find(b => b.innerText.trim().includes("Nhận Mic"));

                if (btnNhanMic) {
                    //await sleep(500);
                    btnNhanMic.click();
                    log("Clicked Nhận Mic");
                    //await waitButton("Trả Mic", 1000);

                    // Chờ nút Nhận Mic biến mất sau khi click
                    const start = Date.now();

                    while (Date.now() - start < 25000 && running) {
                        const stillThere = [...document.querySelectorAll("button")]
                        .find(b => b.innerText.trim().includes("Nhận Mic"));
                        if (!stillThere) break;
                        await delay(100);
                    }
                    continue;
                }


                const queueBtn =
                      [...document.querySelectorAll("button")]
                .find(b => b.innerText.trim().includes("Xếp hàng hát"));

                if (!queueBtn) {
                    await sleep(300);
                    continue;
                }

                queueBtn.click();
                log("Clicked Xếp hàng hát");

                const radio = await waitForElement("#methodRadio1", 5000);
                if (radio) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event("change", { bubbles: true }));
                    const form = radio.closest("form");
                    if (form) form.requestSubmit();
                    log("Submitted");
                } else {
                    log("Radio method not found");
                }

                const selectWebcam = await waitForElement('select[name="videoDeviceId"]',5000);
                if (selectWebcam) {
                    const webcamSelected = selectWebcam.options[selectWebcam.selectedIndex];
                    if (webcamSelected?.text.trim() === "Tự động") {
                        selectWebcam.value = "@off";
                        selectWebcam.dispatchEvent(new Event("change", { bubbles: true }));
                        log("Đã đổi webcam");
                    } else {
                        log("Webcam đã được chọn, bỏ qua");
                    }
                }

                const selectAudio = await waitForElement('select[name="audioDeviceId"]', 5000);
                if (selectAudio) {
                    const audioSelected = selectAudio.options[selectAudio.selectedIndex];
                    if (audioSelected?.text.trim() === "Tự động") {
                        const start = Date.now();
                        let option = null;
                        while (Date.now() - start < 5000) {
                            option = [...selectAudio.options]
                                .find(o => o.text.includes("CABLE Output"));

                            if (option) break;

                            await delay(100);
                        }
                        if (option) {
                            selectAudio.value = option.value;
                            selectAudio.dispatchEvent(new Event("change", { bubbles: true }));
                            log("Đã chọn CABLE Output");
                        }
                    } else {
                        log("Micro đã được chọn, bỏ qua");
                    }
                }

                const formViAu = selectAudio?.closest("form");
                if (formViAu) {
                    formViAu.requestSubmit();
                    log("Đã bấm OK");
                    const btnNhanMic = await waitButton("Nhận Mic", 1000);
                    //await delay(500);
                    btnNhanMic.click();
                    // Chờ nút Nhận Mic biến mất sau khi click
                    const start = Date.now();

                    while (Date.now() - start < 25000 && running) {
                        const stillThere = [...document.querySelectorAll("button")]
                        .find(b => b.innerText.trim().includes("Nhận Mic"));
                        if (!stillThere) break;
                        await delay(100);
                    }
                }


            } catch (err) {
                log(err?.message || String(err));
                await sleep(1000);
            }
        }

        log("Bot stopped");
    }

    //////////////////////////////////////////////////////
    // GREETING
    //////////////////////////////////////////////////////

    async function sendGreeting(users) {
        if (users.length === 0) {
            alert("Không tìm thấy user");
            return;
        }

        const MAX_LENGTH = 155;
        const prefix = (chatTextarea?.value || "").trim() || "hi";

        const messages = [];
        let current = "";

        for (const user of users) {
            const text = prefix.includes("@")
                ? prefix.replace(/@/g, user)
                : `${prefix} ${user}`;

            if (text.length > MAX_LENGTH) {
                alert("Nội dung quá dài!");
                return;
            }

            if (current === "") {
                current = text;
            } else if ((current + ", " + text).length <= MAX_LENGTH) {
                current += ", " + text;
            } else {
                messages.push(current);
                current = text;
            }
        }

        if (current) messages.push(current);

        for (const message of messages) {
            const ok = await fastSend(message, false);
            if (!ok) break;
            await sleep(5000);
        }
    }

    //////////////////////////////////////////////////////
    // RECORD
    //////////////////////////////////////////////////////

    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Unknown";
    }

    function getRecordingNick() {
        const micUsers = getMicUsers();

        if (micUsers.length > 0) {
            return micUsers[0];
        }

        return "Unknown";
    }

    function formatRecordingDate(date) {
        const pad = n => String(n).padStart(2, "0");

        return (
            `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}_` +
            `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
        );
    }

    async function startRecording() {
        const video = document.querySelector(".live-listener video");

        if (!video) {
            alert("Không tìm thấy video LiveListener!");
            return;
        }

        if (!video.srcObject || !video.srcObject.active) {
            alert("Chưa có người đang phát!");
            return;
        }

        if (!video.captureStream) {
            alert("Trình duyệt không hỗ trợ captureStream!");
            return;
        }

        // Lấy những gì LiveListener đang phát
        const capturedStream = video.captureStream();

        const videoTracks = capturedStream.getVideoTracks();
        const audioTracks = capturedStream.getAudioTracks();

        console.log("Record VIDEO tracks:", videoTracks);
        console.log("Record AUDIO tracks:", audioTracks);

        // Audio bắt buộc phải có
        if (audioTracks.length === 0) {
            alert("Không lấy được audio!");
            return;
        }

        // Có webcam thì có video, không có webcam thì chỉ audio
        const stream = new MediaStream([
            ...videoTracks,
            ...audioTracks
        ]);

        const mimeType = 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"';

        if (!MediaRecorder.isTypeSupported(mimeType)) {
            alert("Trình duyệt không hỗ trợ MP4!");
            return;
        }

        recordedChunks = [];

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType
        });

        // Lấy nickname người đang mic
        recordingNick = getRecordingNick();

        // Lưu thời điểm bắt đầu record
        recordingStartTime = new Date();

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, {
                type: "video/mp4"
            });

            const url = URL.createObjectURL(blob);

            const filename =
                  `${sanitizeFilename(recordingNick)}_` +
                  `${formatRecordingDate(recordingStartTime)}.mp4`;

            const a = document.createElement("a");
            a.href = url;
            a.download = filename;

            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);

            recordedChunks = [];
            mediaRecorder = null;

            if (recordButton) {
                recordButton.innerText = "🔴 Record";
                recordButton.style.background = "";
                recordButton.disabled = false;
            }

            log(`Recording saved: ${filename}`);
        };

        mediaRecorder.onerror = event => {
            console.error("MediaRecorder error:", event);
        };

        mediaRecorder.start();

        recordButton.innerText = "⏹ Stop Record";
        recordButton.style.background = "red";

        log(
            `Recording started: ${recordingNick} ` +
            `(video tracks: ${videoTracks.length}, audio tracks: ${audioTracks.length})`
        );
    }

    //////////////////////////////////////////////////////
    // UI
    //////////////////////////////////////////////////////

    async function createUI() {
        if (document.getElementById("mic-queue-pro-toolbar")) return;


        const target = await waitForElement('div[data-class="DynamicButton"]');

        // RECORD BUTTON
        const liveListener = document.querySelector('div[data-class="LiveListener"]');

        if (liveListener && !document.getElementById("dk-record-button")) {

            recordButton = document.createElement("button");

            recordButton.id = "dk-record-button";
            recordButton.type = "button";
            recordButton.innerText = "🔴 Record";

            recordButton.className = "btn btn-danger";

            recordButton.style.display = "block";
            recordButton.style.width = "100%";

            recordButton.onclick = () => {

                if (!mediaRecorder || mediaRecorder.state === "inactive") {
                    startRecording();
                } else if (mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            };

            const volumecontrols = liveListener.querySelector(".volume-controls");

            if (volumecontrols) {
                volumecontrols.insertAdjacentElement("afterend", recordButton);
            }
        }


        const form = await waitForElement("form.chat-input");

        chatForm = form;
        sendButton = chatForm.querySelector('button[type="submit"]');
        chatTextarea = document.querySelector('textarea[name="message"]');

        const botBtn = document.createElement("button");
        botBtn.type = "button";
        botBtn.className = "ms-1 btn btn-outline-secondary";
        botBtn.style.flex = "0 0 auto";
        botBtn.innerText = "Hi\nAll!";

        botBtn.onclick = async () => {
            const myNick = document.querySelector(".my-nick")?.innerText.trim();
            const users = [...document.querySelectorAll(".user-list .nick")]
                .map(e => e.innerText.trim())
                .filter(name => name && name !== myNick);

            await sendGreeting(users);
        };

        sendButton.insertAdjacentElement("afterend", botBtn);

        const hiChatBtn = document.createElement("button");
        hiChatBtn.type = "button";
        hiChatBtn.className = "ms-1 btn btn-outline-info";
        hiChatBtn.style.flex = "0 0 auto";
        hiChatBtn.innerText = "Hi!";

        hiChatBtn.onclick = async () => {
            const myNick = document.querySelector(".my-nick")?.innerText.trim();

            const roomUsers = new Set(
                [...document.querySelectorAll(".user-list .nick")]
                    .map(e => e.innerText.trim())
            );

            const chatUsers = [
                ...document.querySelectorAll(".chat-message:not(.mine) > span:first-child")
            ]
                .map(e => e.innerText.trim())
                .filter(name => roomUsers.has(name));

         //   const roomItems = [...document.querySelectorAll(".user-list .item")];
            const micUsers = getMicUsers();
            const queueUsers = getQueueUsers();

          

            const users = [...new Set([...micUsers, ...queueUsers, ...chatUsers])]
                .filter(name => name && name !== myNick);

            log(`Users: ${users.join(", ")}`);

            if (roomUsers.size > users.length + 1) users.push("all");

            await sendGreeting(users);
        };

        sendButton.insertAdjacentElement("afterend", hiChatBtn);


        const autoMicLabel = document.createElement("label");
        autoMicLabel.innerText = "Auto Mic";
        autoMicLabel.style.color = "white";
        autoMicLabel.style.marginRight = "5px";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary";
        btn.innerText = "Start";
        btn.style.background = "green";



        btn.onclick = async () => {
            running = !running;

            if (running) {
                btn.innerText = "Stop";
                btn.style.background = "red";

                console.log("running =", running, "botTask =", botTask);

                if (!botTask) {
                    botTask = startBotLoop().finally(() => {
                        botTask = null;
                    });
                }
            } else {
                // Dừng Bot
                clearSleep();

                // Reset trạng thái chờ
                waitMode = false;
                waitStart = 0;

                // ========================================
                // 1. NẾU ĐANG ON MIC -> TRẢ MIC
                // ========================================

                const returnMicBtn = getReturnMicButton();

                if (returnMicBtn) {
                    log("Stop -> Đang ON MIC -> Trả Mic");

                    returnMicBtn.click();

                    await delay(300);
                }

                // ========================================
                // 2. NẾU ĐANG XẾP HÀNG -> HỦY XẾP HÀNG
                // ========================================

                const cancelQueueBtn = [...document.querySelectorAll("button")]
                .find(btn =>
                      btn.innerText.trim().includes("Hủy xếp hàng")
                     );

                if (cancelQueueBtn) {
                    log("Stop -> Đang xếp hàng -> Hủy xếp hàng");

                    // Bấm nút Hủy xếp hàng
                    cancelQueueBtn.click();

                    // Chờ modal xác nhận xuất hiện
                    try {
                        const start = Date.now();
                        let modalOkBtn = null;

                        while (Date.now() - start < 2000) {
                            modalOkBtn = [...document.querySelectorAll(
                                ".modal-footer button.btn-primary"
                            )].find(btn => {
                                const text = btn.innerText.trim();
                                const style = window.getComputedStyle(btn);
                                return (
                                    text.includes("OK") &&
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    btn.offsetParent !== null
                                );
                            });
                            if (modalOkBtn) {
                                break;
                            }
                            await delay(30);
                        }

                        if (modalOkBtn) {
                            log("Stop -> Tìm thấy OK -> Click OK");

                            modalOkBtn.click();

                            await delay(300);
                        } else {
                            log("Stop -> Không tìm thấy nút OK đang hiển thị");
                        }

                    } catch (err) {
                        log("Stop -> Lỗi khi tìm nút OK");
                        console.error(err);
                    }
                }

                // Đổi nút về Start
                btn.innerText = "Start";
                btn.style.background = "green";
            }
        };

        const autoCommentBtn = document.createElement("button");
        autoCommentBtn.type = "button";
        autoCommentBtn.className = "btn btn-warning";
        autoCommentBtn.innerText = "Auto Cmt OFF";
     //   autoCommentBtn.style.marginLeft = "5px";

        autoCommentBtn.onclick = () => {
            autoCommentRunning = !autoCommentRunning;

            if (autoCommentRunning) {
                firstAutoComment = true;
                autoCommentMessage = chatTextarea?.value.trim() || "";

                if (!autoCommentMessage) {
                    alert("Vui lòng nhập nội dung chat trước");
                    autoCommentRunning = false;
                    return;
                }

                // Lưu nội dung Auto Cmt xong → trả textarea cho người dùng
                chatTextarea.value = "";
                chatTextarea.dispatchEvent(new Event("input", { bubbles: true }));

                autoCommentBtn.innerText = "Auto Cmt ON";
                autoCommentBtn.style.background = "red";

                if (!autoCommentTask) {
                    autoCommentTask = autoCommentLoop().finally(() => {
                        autoCommentTask = null;
                    });
                }
            } else {
                autoCommentBtn.innerText = "Auto Cmt OFF";
                autoCommentBtn.style.background = "";

                clearCommentSleep();
            }
        };

        commentDelayInput = document.createElement("input");
        commentDelayInput.type = "number";
        commentDelayInput.value = "90";
        commentDelayInput.min = "1";
        commentDelayInput.style.width = "70px";
        commentDelayInput.style.marginLeft = "5px";
        commentDelayInput.title = "Khoảng cách comment (giây)";

        const toolboxContent = document.getElementById("toolbox-content");

        if (toolboxContent) {

            // Hàng 1: Auto Mic + Start
            const row1 = document.createElement("div");
            row1.className = "toolbox-row";

            row1.appendChild(autoMicLabel);
            row1.appendChild(btn);

            // Hàng 2: Auto Cmt + textbox
            const row2 = document.createElement("div");
            row2.className = "toolbox-row";

            row2.appendChild(autoCommentBtn);
            row2.appendChild(commentDelayInput);

            toolboxContent.appendChild(row1);
            toolboxContent.appendChild(row2);
        }

        const autoYieldCheckbox = document.createElement("input");

        autoYieldCheckbox.type = "checkbox";
        autoYieldCheckbox.checked = autoYieldMic;

        autoYieldCheckbox.onchange = () => {
            autoYieldMic = autoYieldCheckbox.checked;

            if (!autoYieldMic) {
                waitMode = false;
                log("Auto Yield OFF -> Exit wait mode");
            }
        };

        const autoYieldText = document.createElement("label");
        autoYieldText.innerText = "Buông mic";
        autoYieldText.style.color = "white";

        const row3 = document.createElement("div");
        row3.className = "toolbox-row";
        row3.appendChild(autoYieldText);
        row3.appendChild(autoYieldCheckbox);


        toolboxContent.appendChild(row3);

        const toolbar = document.createElement("div");
        toolbar.id = "mic-queue-pro-toolbar";
        toolbar.style.display = "flex";
        toolbar.style.alignItems = "center";
        toolbar.style.gap = "5px";

        target.parentElement?.before(toolbar);
        $(".volume-controls .ui-slider").slider("value", 0);
    }

    //////////////////////////////////////////////////////
    // INIT
    //////////////////////////////////////////////////////

    async function init() {
        try {
            await createUI();
        } catch (err) {
            console.error(err);
            setTimeout(init, 2000);
        }
    }

    init();
})();
