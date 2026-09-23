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
    let autoCommentStyle = "off";
    let autoCommentMin = 1;
    let autoCommentMax = 3;

    let commentDelayInput = null;
    let commentTimeout = null;
    let commentResolve = null;

    const YIELD_WAIT_MS = 30000;

    let autoYieldMic = false;
    let waitMode = false;
    let waitStart = 0;

    let chatTextarea = null;
    let chatForm = null;
    let sendButton = null;
    let dkManualChatSending = false;
    let rainbowChatEnabled = false;
    let rainbowChatStyle = "random";
    let customColors = [];

    let mediaRecorder = null;
    let recordedChunks = [];
    let recordButton = null;
    let recordingNick = "";
    let recordingStartTime = null;



    // Audio control
    let audioControlEnabled = false;

    const originalPlay = HTMLMediaElement.prototype.play;

    HTMLMediaElement.prototype.play = function () {
        const src = this.src || "";

        if (
            src.includes("countdownbeep.mp3") ||
            src.includes("next-in-line-chime.mp3") ||
            src.includes("squeal3.mp3") ||
            src.includes("snort.mp3") ||
            src.includes("cardslap.mp3") ||
            src.includes("caro-1.mp3") ||
            src.includes("caro-2.mp3")
        ) {
            this.volume = audioControlEnabled ? 0.2 : 0;
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
            width: max-content;
            min-width: 220px;
            max-width: 500px;
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
    width: max-content;
    min-width: 100%;
    box-sizing: border-box;

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
    width: max-content;
    min-width: 100%;
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
        .audio-switch {
            position: relative;
            width: 38px;
            height: 20px;
            padding: 0;
            margin-left: auto;
            border: none;
            border-radius: 20px;
            background: #555;
            cursor: pointer;
            flex: 0 0 38px;
        }

        .audio-switch::before {
            content: "";
            position: absolute;
            width: 16px;
            height: 16px;
            left: 2px;
            top: 2px;
            background: white;
            border-radius: 50%;
            transition: transform 0.2s;
        }

        .audio-switch.on {
            background: #198754;
        }

        .audio-switch.on::before {
            transform: translateX(18px);
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

        // OFF → gửi nguyên văn
        if (autoCommentStyle === "off") {
            return text;
        }

        if (tokens.length === 0) {
            return "";
        }

        const min = Math.min(autoCommentMin, autoCommentMax);
        const max = Math.max(autoCommentMin, autoCommentMax);

        const count =
              min + Math.floor(
                  Math.random() * (max - min + 1)
              );


        // ==========================================
        // RANDOM
        // Shuffle token → lấy Min đến Max
        // ==========================================

        if (autoCommentStyle === "random") {

            const shuffled = [...tokens];

            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));

                [shuffled[i], shuffled[j]] =
                    [shuffled[j], shuffled[i]];
            }

            const actualCount =
                  Math.min(count, shuffled.length);

            return shuffled
                .slice(0, actualCount)
                .join("");
        }


        // ==========================================
        // SEQUENTIAL
        // Không shuffle
        // ==========================================

        if (autoCommentStyle === "sequential") {

            // Tạo index nếu chưa có
            if (typeof getRandomMessage.sequentialIndex !== "number") {
                getRandomMessage.sequentialIndex = 0;
            }

            const result = [];

            for (let i = 0; i < count; i++) {

                result.push(
                    tokens[
                        getRandomMessage.sequentialIndex
                        % tokens.length
                    ]
                );

                getRandomMessage.sequentialIndex++;
            }

            return result.join("");
        }


        // ==========================================
        // REPEAT
        // Chọn 1 token → lặp Min đến Max
        // ==========================================

        if (autoCommentStyle === "repeat") {

            const token =
                  tokens[
                      Math.floor(Math.random() * tokens.length)
                  ];

            return token.repeat(count);
        }


        // Fallback
        return text;
    }


    //////////////////////////////////////////////////////
    // 🌈 RAINBOW COLORS
    //////////////////////////////////////////////////////

    //////////////////////////////////////////////////////
    // 🌈 RAINBOW COLORS
    //////////////////////////////////////////////////////


    function createMultiGradientPalette(keyColors, totalCount = 32) {

        const parseColor = color =>
        color
        .replace("#", "")
        .split("")
        .map(x => parseInt(x, 16));

        const formatColor = rgb =>
        rgb.map(x => x.toString(16)).join("");

        const colors = keyColors.map(parseColor);

        if (colors.length === 0) return [];
        if (colors.length === 1) {
            return [formatColor(colors[0])];
        }

        const segmentCount = colors.length - 1;
        const totalSteps = totalCount - 1;

        // ==========================================
        // Tính khoảng cách RGB từng đoạn
        // ==========================================

        const distances = [];

        for (let i = 0; i < segmentCount; i++) {

            const a = colors[i];
            const b = colors[i + 1];

            const distance =
                  Math.abs(b[0] - a[0]) +
                  Math.abs(b[1] - a[1]) +
                  Math.abs(b[2] - a[2]);

            distances.push(distance);
        }

        const totalDistance =
              distances.reduce((sum, d) => sum + d, 0);


        // ==========================================
        // Phân bổ tổng 31 bước cho các segment
        // ==========================================

        const segmentSteps = new Array(segmentCount).fill(1);

        if (totalSteps >= segmentCount) {

            // Mỗi segment tối thiểu 1 bước
            let remaining = totalSteps - segmentCount;

            const allocation = distances.map((distance, index) => {

                const exact =
                      remaining * distance / totalDistance;

                return {
                    index,
                    base: Math.floor(exact),
                    fraction: exact - Math.floor(exact)
                };
            });

            // Cộng phần nguyên
            for (const item of allocation) {
                segmentSteps[item.index] += item.base;
            }

            let allocated =
                segmentSteps.reduce((sum, n) => sum + n, 0);

            let left = totalSteps - allocated;

            // Phần dư lớn nhất nhận thêm step
            allocation.sort(
                (a, b) => b.fraction - a.fraction
            );

            let i = 0;

            while (left > 0) {

                segmentSteps[
                    allocation[i % allocation.length].index
                ]++;

                left--;
                i++;
            }
        }


        // ==========================================
        // Tạo màu bằng RGB path
        // ==========================================

        const result = [];

        // Màu đầu tiên
        result.push(formatColor(colors[0]));


        for (let segment = 0; segment < segmentCount; segment++) {

            const start = colors[segment];
            const end = colors[segment + 1];

            const steps = segmentSteps[segment];

            if (steps <= 0) continue;


            // --------------------------------------
            // Khoảng thay đổi của từng channel
            // --------------------------------------

            const dr = end[0] - start[0];
            const dg = end[1] - start[1];
            const db = end[2] - start[2];


            // --------------------------------------
            // Tạo từng bước.
            //
            // Mỗi channel thay đổi đều theo hướng
            // của nó.
            // --------------------------------------

            let previous = [...start];

            for (let step = 1; step <= steps; step++) {

                const ratio = step / steps;

                let r =
                    start[0] +
                    Math.round(dr * ratio);

                let g =
                    start[1] +
                    Math.round(dg * ratio);

                let b =
                    start[2] +
                    Math.round(db * ratio);


                // ----------------------------------
                // Không cho channel đi ngược hướng
                // ----------------------------------

                if (dr > 0) {
                    r = Math.max(previous[0], r);
                    r = Math.min(end[0], r);
                } else if (dr < 0) {
                    r = Math.min(previous[0], r);
                    r = Math.max(end[0], r);
                } else {
                    r = end[0];
                }


                if (dg > 0) {
                    g = Math.max(previous[1], g);
                    g = Math.min(end[1], g);
                } else if (dg < 0) {
                    g = Math.min(previous[1], g);
                    g = Math.max(end[1], g);
                } else {
                    g = end[1];
                }


                if (db > 0) {
                    b = Math.max(previous[2], b);
                    b = Math.min(end[2], b);
                } else if (db < 0) {
                    b = Math.min(previous[2], b);
                    b = Math.max(end[2], b);
                } else {
                    b = end[2];
                }


                const current = [r, g, b];

                result.push(formatColor(current));

                previous = current;
            }
        }


        // ==========================================
        // Đảm bảo đúng số lượng màu yêu cầu
        // ==========================================

        if (result.length > totalCount) {
            result.length = totalCount;
        }

        // Nếu thiếu thì thêm màu cuối
        while (result.length < totalCount) {
            result.push(
                formatColor(colors[colors.length - 1])
            );
        }

        // Luôn đảm bảo màu cuối là key color cuối
        result[result.length - 1] =
            formatColor(colors[colors.length - 1]);

        return result;
    }


    const COLOR_STYLES = {

        classic: createMultiGradientPalette(
            [
                "f04",
                "ff0",
                "0f0",
                "0ff",
                "00f",
                "f0f",
                "f04"
            ],
            24
        ),

        fire: createMultiGradientPalette(
            [
                "f00",
                "f60",
                "ff0"
            ],
            24
        ),

        ocean: createMultiGradientPalette(
            [
                "00f",
                "0ff",
                "0af"
            ],
            24
        ),

        forest: createMultiGradientPalette(
            [
                "0f0",
                "0a0",
                "050"
            ],
            24
        ),

        sunset: createMultiGradientPalette(
            [
                "f0f",
                "f04",
                "f80",
                "ff0"
            ],
            24
        ),

        neon: createMultiGradientPalette(
            [
                "f0f",
                "00f",
                "0ff",
                "0f0"
            ],
            24
        ),
        custom: createMultiGradientPalette([], 24)

    };

    //////////////////////////////////////////////////////
    // ✨ FANCY TEXT
    //////////////////////////////////////////////////////

    const FANCY_TEXT_STYLES = {

        // ==================================================
        // BOLD
        // ==================================================
        bold: {
            name: "𝐁𝐨𝐥𝐝",
            upper: "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙",
            lower: "𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳",
            digits: "𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗"
        },

        // ==================================================
        // ITALIC
        // ==================================================
        italic: {
            name: "𝘐𝘵𝘢𝘭𝘪𝘤",
            upper: "𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡",
            lower: "𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻",
            digits: null
        },

        // ==================================================
        // BOLD ITALIC
        // ==================================================
        boldItalic: {
            name: "𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄",
            upper: "𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁",
            lower: "𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛",
            digits: "𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗"
        },

        // ==================================================
        // SCRIPT
        // ==================================================
        script: {
            name: "𝓢𝓬𝓻𝓲𝓹𝓽",
            upper: "𝒜𝐵𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵",
            lower: "𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏",
            digits: null
        },

        // ==================================================
        // BOLD SCRIPT
        // ==================================================
        boldScript: {
            name: "𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽",
            upper: "𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩",
            lower: "𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃",
            digits: null
        },

        // ==================================================
        // FRAKTUR
        // ==================================================
        fraktur: {
            name: "𝔉𝔯𝔞𝔨𝔱𝔲𝔯",
            upper: "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ",
            lower: "𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷",
            digits: null
        },

        // ==================================================
        // BOLD FRAKTUR
        // ==================================================
        boldFraktur: {
            name: "𝕭𝖔𝖑𝖉 𝕱𝖗𝖆𝖐𝖙𝖚𝖗",
            upper: "𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅",
            lower: "𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟",
            digits: null
        },

        // ==================================================
        // DOUBLE STRUCK
        // ==================================================
        double: {
            name: "𝔻𝕠𝕦𝕓𝕝𝕖",
            upper: "𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ",
            lower: "𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫",
            digits: "𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡"
        },

        // ==================================================
        // SANS
        // ==================================================
        sans: {
            name: "𝖲𝖺𝗇𝗌",
            upper: "𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹",
            lower: "𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓",
            digits: "𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫"
        },

        // ==================================================
        // SANS BOLD
        // ==================================================
        sansBold: {
            name: "𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱",
            upper: "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭",
            lower: "𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇",
            digits: "𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵"
        },

        // ==================================================
        // SANS ITALIC
        // ==================================================
        sansItalic: {
            name: "𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘤",
            upper: "𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡",
            lower: "𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻",
            digits: null
        },

        // ==================================================
        // SANS BOLD ITALIC
        // ==================================================
        sansBoldItalic: {
            name: "𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘",
            upper: "𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕",
            lower: "𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯",
            digits: "𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵"
        },

        // ==================================================
        // MONOSPACE
        // ==================================================
        monospace: {
            name: "𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎",
            upper: "𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉",
            lower: "𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣",
            digits: "𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿"
        },

        // ==================================================
        // FULLWIDTH
        // ==================================================
        fullwidth: {
            name: "Ｆｕｌｌｗｉｄｔｈ",
            upper: "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ",
            lower: "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ",
            digits: "０１２３４５６７８９"
        }
    };


    function buildFancyMap(style) {

        const map = new Map();

        const addRange = (source, target) => {

            if (!source || !target) return;

            const sourceChars = [...source];
            const targetChars = [...target];

            for (let i = 0; i < Math.min(sourceChars.length, targetChars.length); i++) {
                map.set(sourceChars[i], targetChars[i]);
            }
        };

        addRange(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            style.upper
        );

        addRange(
            "abcdefghijklmnopqrstuvwxyz",
            style.lower
        );

        addRange(
            "0123456789",
            style.digits
        );

        return map;
    }


    const FANCY_TEXT_MAPS = Object.fromEntries(
        Object.entries(FANCY_TEXT_STYLES)
        .map(([key, style]) => [
            key,
            buildFancyMap(style)
        ])
    );


    function fancyTextEncode(text, styleName = "bold") {

        const map = FANCY_TEXT_MAPS[styleName];

        if (!map) return text;

        let result = "";

        for (const char of text) {

            // Không có mapping → giữ nguyên
            result += map.get(char) ?? char;
        }

        return result;
    }



    window.fancyTextEncode = fancyTextEncode;

    function rainbowEncodeUserChat(text) {

        text = text.trim();
        // Xóa các mã màu cũ nếu text đã được rainbow encode
        text = text.replace(/\[[0-9a-fA-F]{3}\]/g, '');
        // 🌈 RAINBOW OFF → dùng màu chat mặc định của trang
        if (!rainbowChatEnabled) {
            const colorInput = document.querySelector(
                'input[type="color"]:not(#my-dkhd-toolbox input[type="color"])'
            );

            if (colorInput?.value) {
                const hex = colorInput.value.replace("#", "");

                const color3 =
                      hex[0] +
                      hex[2] +
                      hex[4];

                return `[${color3}]${text}`;
            }
            console.debug("Trung", text)
            return text;
        }


        // Canvas để đo độ rộng text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Lấy font thực tế của ô chat
        if (chatTextarea) {
            const style = getComputedStyle(chatTextarea);
            ctx.font = style.font;
        } else {
            ctx.font = '16px Arial';
        }

        const textLength = [...text].length;
        const textWidth = ctx.measureText(text).width;

        const MAX_CHAT_LENGTH = 160;
        const COLOR_CODE_LENGTH = 5;

        const availableChars = MAX_CHAT_LENGTH - textLength;

        const maxColorPoints = Math.floor(
            availableChars / COLOR_CODE_LENGTH
        );

        const MAX_WIDTH =
              maxColorPoints > 0
        ? Math.ceil(textWidth / maxColorPoints) +5
        : textWidth;

        console.log("========== RAINBOW DEBUG ==========");
        console.log("TEXT:", text);
        console.log("FONT:", ctx.font);
        console.log("TEXT LENGTH:", textLength);
        console.log("TEXT WIDTH:", textWidth);
        console.log("AVAILABLE CHARS:", availableChars);
        console.log("MAX COLOR POINTS:", maxColorPoints);
        console.log("MAX WIDTH:", MAX_WIDTH);
        console.log("CHAR WIDTH:", ctx.measureText("1").width);

        let result = '';
        let currentText = '';
        let pendingSpaces = '';

        const styleNames = Object.keys(COLOR_STYLES)
        .filter(name => COLOR_STYLES[name]?.length > 0);

        const selectedStyle =
              rainbowChatStyle === "random"
        ? styleNames[Math.floor(Math.random() * styleNames.length)]
        : rainbowChatStyle;

        const colors = COLOR_STYLES[selectedStyle];

        if (!colors || colors.length === 0) {
            return text;
        }

        let colorIndex = 0;
        let currentColor = null;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Icon [...] = một block nguyên vẹn, giống như space
            const iconMatch = text.slice(i).match(/^\[[^\]]*\]/);

            if (iconMatch) {
                const icon = iconMatch[0];

                currentText += pendingSpaces + icon;
                pendingSpaces = '';

                i += icon.length - 1;
                continue;
            }

            if (char === '\n') {

                if (currentText || pendingSpaces) {

                    const color = colors[colorIndex];
                    const segmentText = currentText + pendingSpaces;

                    const segmentWidth = ctx.measureText(
                        currentText.replace(/ /g, '').replace(/\[[^\]]*\]/g, '')
                    ).width;

                    console.log(
                        `>>> CHỐT SEGMENT NEWLINE: "${segmentText}"`,
                        `WIDTH=${segmentWidth.toFixed(2)}px`,
                        `MAX_WIDTH=${MAX_WIDTH.toFixed(2)}px`,
                        `REMAINING=${(MAX_WIDTH - segmentWidth).toFixed(2)}px`,
                        `COLOR=#${color}`
                    );

                    if (color !== currentColor) {
                        result += `[${color}]`;
                        currentColor = color;
                    }

                    result += segmentText;

                    colorIndex = Math.min(colorIndex + 1, colors.length - 1);
                }

                result += '\n';

                currentText = '';
                pendingSpaces = '';

                continue;
            }

            // Space đang chờ sẽ thuộc segment hiện tại
            const candidate =
                  currentText + pendingSpaces + char;

            const testWidth = ctx.measureText(
                candidate.replace(/ /g, '')
            ).width;

            console.log(
                `TEST: "${candidate}"`,
                `=> ${testWidth.toFixed(2)}px`,
                testWidth > MAX_WIDTH ? "❌ VƯỢT" : "✅ OK"
            );

            if (currentText && testWidth > MAX_WIDTH) {

                const color = colors[colorIndex];

                const segmentText =
                      currentText + pendingSpaces;

                const segmentWidth = ctx.measureText(
                    segmentText.replace(/ /g, '')
                ).width;

                console.log(
                    `>>> CHỐT SEGMENT: "${segmentText}"`,
                    `WIDTH=${segmentWidth.toFixed(2)}px`,
                    `MAX_WIDTH=${MAX_WIDTH.toFixed(2)}px`,
                    `REMAINING=${(MAX_WIDTH - segmentWidth).toFixed(2)}px`,
                    `COLOR=#${color}`
                );

                if (color !== currentColor) {
                    result += `[${color}]`;
                    currentColor = color;
                }

                // Space gắn vào segment trước
                result += segmentText;

                console.log(
                    "APPEND:",
                    JSON.stringify(segmentText),
                    "RESULT:",
                    result
                );

                colorIndex = Math.min(colorIndex + 1, colors.length - 1);

                // Ký tự hiện tại bắt đầu segment mới
                currentText = char;
                pendingSpaces = '';

            } else {

                // Có thể thêm vào segment hiện tại
                currentText += pendingSpaces + char;
                pendingSpaces = '';
            }
        }

        // ==========================================
        // SEGMENT CUỐI
        // ==========================================

        if (currentText || pendingSpaces) {

            const color = colors[colorIndex];

            // Space cuối cũng gắn vào segment cuối
            const finalText = currentText + pendingSpaces;

            const segmentWidth = ctx.measureText(
                currentText.replace(/ /g, '')
            ).width;

            console.log(
                `>>> CHỐT SEGMENT: "${finalText}"`,
                `WIDTH=${segmentWidth.toFixed(2)}px`,
                `MAX_WIDTH=${MAX_WIDTH.toFixed(2)}px`,
                `REMAINING=${(MAX_WIDTH - segmentWidth).toFixed(2)}px`,
                segmentWidth <= MAX_WIDTH ? "✅ OK" : "❌ VƯỢT",
                `COLOR=#${color}`
            );

            if (color !== currentColor) {
                result += `[${color}]`;
            }

            result += finalText;
        }

        console.log("===================================");
        console.log("🌈 RAINBOW RESULT:", result);
        console.log("===================================");

        return result;
    }


    // ==================== PUBLIC CHAT QUEUE ====================

    const botSendQueue = [];
    let botSendRunning = false;

    async function processBotSendQueue() {
        if (botSendRunning) return;

        botSendRunning = true;

        while (botSendQueue.length > 0) {
            const item = botSendQueue[0]; // KHÔNG shift ở đây

            try {
                const sendMessage = rainbowEncodeUserChat(item.message);

                console.log("📤 PUBLIC CHAT SEND:", sendMessage);

                const result = await window.chat.rpc("chatMessage", [
                    sendMessage
                ]);

                // Server đang bắt spam → giữ nguyên item để retry
                if (result?.errorCode === "SPAMMING") {
                    console.warn("⏳ PUBLIC SPAMMING → retry...");
                    await sleep(1000);
                    continue;
                }

                // Gửi xong mới lấy khỏi queue
                botSendQueue.shift();

                if (result?.errorCode) {
                    console.warn(
                        "❌ PUBLIC CHAT ERROR:",
                        result.errorCode,
                        result
                    );

                    item.resolve(false);
                    continue;
                }

                console.log("✅ PUBLIC CHAT SENT:", sendMessage);

                item.resolve(true);

            } catch (err) {
                botSendQueue.shift();

                console.error("❌ Public chat error:", err);

                item.resolve(false);
            }
        }

        botSendRunning = false;
    }
    async function fastSend(message) {
        if (!message) return false;

        return new Promise((resolve, reject) => {
            botSendQueue.push({
                message,
                resolve,
                reject
            });

            console.log(
                `📥 PUBLIC QUEUE: ${botSendQueue.length}`,
                message
            );

            processBotSendQueue();
        });
    }
    // ==================== MANUAL PUBLIC CHAT QUEUE ====================

    const manualSendQueue = [];
    let manualSendRunning = false;

    async function processManualSendQueue() {
        if (manualSendRunning) return;

        manualSendRunning = true;

        while (manualSendQueue.length > 0) {

            const item = manualSendQueue[0];

            try {

                // Rainbow chỉ encode ngay trước khi gửi
                const sendMessage = rainbowEncodeUserChat(item.message);

                console.log(
                    "📤 MANUAL PUBLIC SEND:",
                    sendMessage
                );

                const result = await window.chat.rpc(
                    "chatMessage",
                    [sendMessage]
                );

                // Server đang bắt spam
                // → KHÔNG shift → giữ nguyên message để retry
                if (result?.errorCode === "SPAMMING") {

                    console.warn(
                        "⏳ MANUAL PUBLIC SPAMMING → retry..."
                    );

                    await delay(1000);
                    continue;
                }

                // Gửi xong mới lấy khỏi queue
                manualSendQueue.shift();

                if (result?.errorCode) {

                    console.warn(
                        "❌ MANUAL PUBLIC ERROR:",
                        result.errorCode,
                        result
                    );

                    item.resolve(false);
                    continue;
                }

                console.log(
                    "✅ MANUAL PUBLIC SENT:",
                    sendMessage
                );

                item.resolve(true);

                // Cho message tiếp theo đi từ từ
                if (manualSendQueue.length > 0) {
                    await delay(1000);
                }

            } catch (err) {

                manualSendQueue.shift();

                console.error(
                    "❌ MANUAL PUBLIC ERROR:",
                    err
                );

                item.resolve(false);
            }
        }

        manualSendRunning = false;
    }


    function manualPublicSend(message) {

        if (!message) return false;

        return new Promise((resolve, reject) => {

            manualSendQueue.push({
                message,
                resolve,
                reject
            });

            console.log(
                `📥 MANUAL PUBLIC QUEUE: ${manualSendQueue.length}`,
                message
            );

            processManualSendQueue();
        });
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

    // ===============================
    // NEW USER GREETING
    // ===============================

    let previousRoomUsers = new Set();
    let newUserGreetingReady = false;
    let newUserGreetingTimer = null;
    let newUserGreetingEnabled = false;

    // Queue Welcome New Member
    let newUserGreetingQueue = [];
    let newUserGreetingQueueTimer = null;
    let newUserGreetingRunning = false;

    // Câu chào — muốn đổi chỉ sửa dòng này
    const NEW_USER_GREETING_PREFIX = "hi";

    function mediaElementToToken(media) {
        const src = media.currentSrc || media.src;
        if (!src) return null;

        const match = src.match(
            /\/smileys\/([^/]+)\/(\d+)(\.[^/?#]+)/
        );

        if (!match) return null;

        const [, name, file, ext] = match;

        const iconSet = Object.values(window.iconSets || {})
        .find(x => x.name === name);

        if (!iconSet) return null;

        const type = ext.toLowerCase() === ".mp4" ? "v" : "i";

        return `[${type}:${iconSet.id},${file},0]`;
    }

    function getFullNickToken(nickEl) {
        if (!nickEl) return "";

        let result = "";

        for (const node of nickEl.childNodes) {

            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
                continue;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }

            if (node.matches("img, video")) {
                const token = mediaElementToToken(node);

                if (token) {
                    result += token;
                }

                continue;
            }

            result += getFullNickToken(node);
        }

        return result.trim();
    }

    function findUserNickElement(nick) {
        if (!nick) return null;

        const target = String(nick).trim();

        return [...document.querySelectorAll(".user-list .item .nick")]
            .find(el => el.textContent.trim() === target) || null;
    }

    function getCurrentRoomUsers() {
        return new Set(
            getRoomItems()
            .map(item => item.querySelector(".nick")?.innerText.trim())
            .filter(Boolean)
        );
    }


    async function checkNewRoomUsers() {

        const currentUsers = getCurrentRoomUsers();

        // Lần đầu: chỉ ghi nhận người đang có trong room
        if (!newUserGreetingReady) {
            previousRoomUsers = currentUsers;
            newUserGreetingReady = true;
            return;
        }

        // OFF → vẫn cập nhật danh sách user, nhưng không chào
        if (!newUserGreetingEnabled) {
            previousRoomUsers = currentUsers;
            return;
        }

        // Tìm user mới
        const newUsers = [...currentUsers].filter(
            nick => !previousRoomUsers.has(nick)
        );

        previousRoomUsers = currentUsers;

        if (newUsers.length === 0) {
            return;
        }

        // User mới → push vào queue
        for (const nick of newUsers) {

            if (!newUserGreetingQueue.includes(nick)) {
                newUserGreetingQueue.push(nick);
            }
        }

        console.log(
            "👋 New User Greeting Queue:",
            [...newUserGreetingQueue]
        );

        // Đang xử lý queue → chỉ push, không tạo thêm process
        if (newUserGreetingRunning) {
            return;
        }

        // Queue có user → bắt đầu đợi 5 giây
        if (!newUserGreetingQueueTimer) {

            newUserGreetingQueueTimer = setTimeout(
                processNewUserGreetingQueue,
                1000
            );
        }
    }


    async function processNewUserGreetingQueue() {

        newUserGreetingQueueTimer = null;

        if (
            !newUserGreetingEnabled ||
            newUserGreetingQueue.length === 0
        ) {
            newUserGreetingRunning = false;
            return;
        }

        newUserGreetingRunning = true;

        // Lấy snapshot queue hiện tại
        const users = [...newUserGreetingQueue];


        // sendGreeting() tự xử lý:
        // - ≤155 ký tự
        // - chia message
        // - 5 giây giữa các message
        // New Member Greeting dùng prefix riêng
        // Không đọc / không sửa textarea
        await sendGreeting(users, NEW_USER_GREETING_PREFIX);

        // Remove đúng batch vừa xử lý
        newUserGreetingQueue.splice(0, users.length);

        // Nếu trong lúc send có user mới vào
        // thì queue sẽ còn user
        if (
            newUserGreetingEnabled &&
            newUserGreetingQueue.length > 0
        ) {

            newUserGreetingQueueTimer = setTimeout(
                processNewUserGreetingQueue,
                1000
            );

        } else {

            newUserGreetingRunning = false;
        }
    }


    function initNewUserGreeting() {

        const userList = document.querySelector(".user-list");

        if (!userList) {
            console.warn("⚠️ Không tìm thấy .user-list");
            return;
        }

        // Ghi nhận danh sách ban đầu
        checkNewRoomUsers();

        const observer = new MutationObserver(() => {

            clearTimeout(newUserGreetingTimer);

            newUserGreetingTimer = setTimeout(() => {
                checkNewRoomUsers();
            }, 150);
        });

        observer.observe(userList, {
            childList: true,
            subtree: true
        });

        console.log("👋 New User Greeting ready");
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

                await fastSend(randomMessage);
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

    async function sendGreeting(users, greetingPrefix = null) {
        if (users.length === 0) {
            alert("Không tìm thấy user");
            return;
        }

        // Giới hạn thực tế của message sau khi thêm mã màu
        const MAX_LENGTH = 160;

        const prefix =
              greetingPrefix !== null
        ? greetingPrefix.trim() || "hi"
        : (chatTextarea?.value || "").trim() || "hi";

        const messages = [];
        let current = "";

        // --------------------------------------------------
        // Kiểm tra độ dài THỰC TẾ sau khi Rainbow encode
        // --------------------------------------------------
        function getSendLength(text) {
            if (!rainbowChatEnabled) {
                return text.length;
            }

            const encoded = rainbowEncodeUserChat(text);

            return encoded.length;
        }

        for (const user of users) {

            const nickEl = findUserNickElement(user);

            const fullNick = nickEl
            ? getFullNickToken(nickEl)
            : user;

            console.log("👋 GREETING USER:", {
                nick: user,
                nickEl,
                fullNick
            });

            const text = prefix.includes("@")
            ? prefix.replace(/@/g, fullNick)
            : `${prefix} ${fullNick}`;

            // Kiểm tra riêng nickname này
            const singleLength = getSendLength(text);

            if (singleLength > MAX_LENGTH) {
                alert(`Nội dung quá dài: ${text}`);
                return;
            }

            // Message đầu tiên
            if (current === "") {
                current = text;
                continue;
            }

            // Thử thêm nickname vào message hiện tại
            const candidate = current + ", " + text;

            // Quan trọng:
            // candidate vẫn là text sạch, chưa có mã màu.
            // Rainbow chỉ được encode để PREVIEW độ dài.
            const candidateLength = getSendLength(candidate);

            if (candidateLength <= MAX_LENGTH) {

                // Vẫn đủ chỗ → nhận nickname
                current = candidate;

            } else {

                // Vượt 155 → chốt message hiện tại
                messages.push(current);

                // Nickname này chuyển sang message kế
                current = text;
            }
        }

        if (current) {
            messages.push(current);
        }

        // --------------------------------------------------
        // Đẩy text SẠCH vào fastSend()
        // Rainbow + default color sẽ được xử lý ở send layer
        // --------------------------------------------------
        for (const message of messages) {

            console.log(
                "👋 GREETING QUEUE:",
                message,
                "length:",
                message.length
            );

            const ok = await fastSend(message);

            if (!ok) break;
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

        // ============================================================
        // FANCY TEXT FONT SELECT
        // ============================================================

        const fancyTextBar = document.createElement("div");

        fancyTextBar.style.display = "flex";
        fancyTextBar.style.alignItems = "center";
        fancyTextBar.style.gap = "5px";
        fancyTextBar.style.padding = "3px 0";

        const fancyTextLabel = document.createElement("span");

        fancyTextLabel.innerText = "Font:";
        fancyTextLabel.style.color = "white";
        fancyTextLabel.style.fontSize = "13px";

        const fancyTextStyleSelect = document.createElement("select");

        fancyTextStyleSelect.id = "dk-fancy-text-style";
        fancyTextStyleSelect.className = "form-select form-select-sm";

        fancyTextStyleSelect.style.width = "160px";
        fancyTextStyleSelect.style.flex = "0 0 auto";

        fancyTextStyleSelect.innerHTML = `
    <option value="off">OFF</option>
    <option value="bold">𝐁𝐨𝐥𝐝</option>
    <option value="italic">𝘐𝘵𝘢𝘭𝘪𝘤</option>
    <option value="boldItalic">𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄</option>
    <option value="script">𝓢𝓬𝓻𝓲𝓹𝓽</option>
    <option value="boldScript">𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽</option>
    <option value="fraktur">𝔉𝔯𝔞𝔨𝔱𝔲𝔯</option>
    <option value="boldFraktur">𝕭𝖔𝖑𝖉 𝕱𝖗𝖆𝖐𝖙𝖚𝖗</option>
    <option value="double">𝔻𝕠𝕦𝕓𝕝𝕖</option>
    <option value="sans">𝖲𝖺𝗇𝗌</option>
    <option value="sansBold">𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱</option>
    <option value="sansItalic">𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘤</option>
    <option value="sansBoldItalic">𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘</option>
    <option value="monospace">𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎</option>
    <option value="fullwidth">Ｆｕｌｌｗｉｄｔｈ</option>
`;

        fancyTextBar.append(
            fancyTextLabel,
            fancyTextStyleSelect
        );

        // Chèn NGAY PHÍA TRÊN form chat
        form.parentElement.insertBefore(fancyTextBar, form);

        // ============================================================
        // MANUAL CHAT
        // Public  -> Rainbow -> Public Queue
        // Private -> Rainbow -> Private RPC
        // ============================================================
        async function handleManualSend() {
            const message = chatTextarea?.value?.trim();
            if (!message) return;

            const selectedTab = window.chatWindow?.selectedTab ?? 0;

            console.log("🌈 MANUAL SEND", {
                message,
                selectedTab
            });

            // PUBLIC
            if (selectedTab === 0) {
                console.log("🌐 MANUAL PUBLIC");

                // Vào queue ngay, không chờ gửi xong
                manualPublicSend(message);

                // Xóa ô nhập ngay
                chatTextarea.value = "";
                chatTextarea.dispatchEvent(
                    new Event("input", { bubbles: true })
                );

                return;
            }

            // PRIVATE
            const tab = window.chatWindow?.tabs?.[selectedTab];

            if (!tab?.userInfo?.userId) {
                console.warn("❌ MANUAL PRIVATE: Không tìm thấy userId");
                return;
            }

            const userId = String(tab.userInfo.userId);
            const encodedMessage = rainbowEncodeUserChat(message);

            console.log("🔒 MANUAL PRIVATE SEND:", {
                userId,
                message,
                encodedMessage
            });

            try {
                const result = await window.chat.rpc(
                    "privateMessage",
                    [userId, encodedMessage]
                );

                if (result?.errorCode) {
                    console.warn(
                        "❌ MANUAL PRIVATE ERROR:",
                        result.errorCode,
                        result
                    );
                    return;
                }

                tab.appendChatLog({
                    userInfo: window.me,
                    message: encodedMessage
                });

                chatTextarea.value = "";
                chatTextarea.dispatchEvent(
                    new Event("input", { bubbles: true })
                );

                console.log(
                    "✅ MANUAL PRIVATE SENT:",
                    encodedMessage
                );

            } catch (error) {
                console.error(
                    "❌ MANUAL PRIVATE RPC ERROR:",
                    error
                );
            }
        }
        chatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            handleManualSend();
        }, true);

        chatTextarea.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.keyCode !== 13 || e.shiftKey) return;


            e.preventDefault();
            e.stopImmediatePropagation();

            console.log("⌨️ MANUAL ENTER");

            handleManualSend();
        }, true);


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

        const newUserGreetingBtn = document.createElement("button");
        newUserGreetingBtn.type = "button";
        newUserGreetingBtn.className = "audio-switch";

        newUserGreetingBtn.onclick = () => {
            newUserGreetingEnabled = !newUserGreetingEnabled;

            newUserGreetingBtn.classList.toggle(
                "on",
                newUserGreetingEnabled
            );

            console.log(
                "New User Greeting:",
                newUserGreetingEnabled ? "ON" : "OFF"
            );
        };

        // Mặc định OFF
        newUserGreetingBtn.classList.remove("on");

        const autoCommentBtn = document.createElement("button");
        autoCommentBtn.type = "button";
        autoCommentBtn.className = "btn btn-warning";
        autoCommentBtn.innerText = "Auto Cmt OFF";

        autoCommentBtn.onclick = () => {
            autoCommentRunning = !autoCommentRunning;

            if (autoCommentRunning) {
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
        const autoCommentStyleSelect = document.createElement("select");

        autoCommentStyleSelect.style.width = "90px";
        autoCommentStyleSelect.style.marginLeft = "5px";

        autoCommentStyleSelect.innerHTML = `
    <option value="off">OFF</option>
    <option value="random">Random</option>
    <option value="sequential">Sequential</option>
    <option value="repeat">Repeat</option>
`;

        autoCommentStyleSelect.value = autoCommentStyle;


        const autoCommentMinInput = document.createElement("input");

        autoCommentMinInput.type = "number";
        autoCommentMinInput.min = "1";
        autoCommentMinInput.max = "8";
        autoCommentMinInput.value = autoCommentMin;
        autoCommentMinInput.style.width = "45px";
        autoCommentMinInput.title = "Số token tối thiểu";


        const autoCommentMaxInput = document.createElement("input");

        autoCommentMaxInput.type = "number";
        autoCommentMaxInput.min = "1";
        autoCommentMaxInput.max = "8";
        autoCommentMaxInput.value = autoCommentMax;
        autoCommentMaxInput.style.width = "45px";
        autoCommentMaxInput.title = "Số token tối đa";


        autoCommentStyleSelect.onchange = () => {
            autoCommentStyle = autoCommentStyleSelect.value;

            console.log(
                "Auto Comment Style:",
                autoCommentStyle
            );
        };


        autoCommentMinInput.onchange = () => {
            autoCommentMin = Math.min(
                8,
                Math.max(1, parseInt(autoCommentMinInput.value, 10) || 1)
            );

            if (autoCommentMin > autoCommentMax) {
                autoCommentMin = autoCommentMax;
                autoCommentMinInput.value = autoCommentMin;
            }

            console.log(
                "Auto Comment Min:",
                autoCommentMin
            );
        };


        autoCommentMaxInput.onchange = () => {
            autoCommentMax = Math.min(
                8,
                Math.max(1, parseInt(autoCommentMaxInput.value, 10) || 1)
            );

            if (autoCommentMax < autoCommentMin) {
                autoCommentMax = autoCommentMin;
                autoCommentMaxInput.value = autoCommentMax;
            }

            console.log(
                "Auto Comment Max:",
                autoCommentMax
            );
        };

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


            const row2Style = document.createElement("div");
            row2Style.className = "toolbox-row";

            row2Style.appendChild(autoCommentStyleSelect);
            row2Style.appendChild(autoCommentMinInput);
            row2Style.appendChild(autoCommentMaxInput);

            toolboxContent.appendChild(row1);
            toolboxContent.appendChild(row2);
            toolboxContent.appendChild(row2Style);


            const rainbowRow = document.createElement("div");
            rainbowRow.className = "toolbox-row";

            const rainbowLabel = document.createElement("label");
            rainbowLabel.innerText = "Rainbow Chat";
            rainbowLabel.style.color = "white";



            const rainbowStyleSelect = document.createElement("select");

            rainbowStyleSelect.style.width = "90px";
            rainbowStyleSelect.style.marginLeft = "5px";

            const customColorContainer = document.createElement("div");

            customColorContainer.style.display = "none";
            customColorContainer.style.alignItems = "center";
            customColorContainer.style.gap = "4px";
            customColorContainer.style.marginLeft = "5px";

            const addCustomColorButton = document.createElement("button");

            addCustomColorButton.type = "button";
            addCustomColorButton.innerText = "+";
            addCustomColorButton.title = "Thêm màu";
            addCustomColorButton.style.padding = "1px 6px";
            addCustomColorButton.style.cursor = "pointer";

            customColorContainer.appendChild(addCustomColorButton);

            function addCustomColorPicker() {

                const colorInput = document.createElement("input");

                colorInput.type = "color";
                colorInput.value = "#ff0000";

                colorInput.style.width = "28px";
                colorInput.style.height = "28px";
                colorInput.style.padding = "0";
                colorInput.style.border = "none";
                colorInput.style.cursor = "pointer";


                // ==============================
                // Thêm màu ban đầu
                // ==============================

                const hex = colorInput.value.replace("#", "");

                const color3 =
                      hex[0] +
                      hex[2] +
                      hex[4];

                customColors.push(color3);

                COLOR_STYLES.custom =
                    createMultiGradientPalette(
                    customColors,
                    24
                );


                // ==============================
                // Đổi màu
                // ==============================

                colorInput.onchange = () => {

                    const hex = colorInput.value.replace("#", "");

                    const color3 =
                          hex[0] +
                          hex[2] +
                          hex[4];

                    // Tìm vị trí hiện tại của input
                    const index =
                          [...customColorContainer.querySelectorAll('input[type="color"]')]
                    .indexOf(colorInput);

                    if (index !== -1) {

                        customColors[index] = color3;

                        COLOR_STYLES.custom =
                            createMultiGradientPalette(
                            customColors,
                            24
                        );
                    }

                    console.log(
                        "🎨 Custom Colors:",
                        customColors
                    );
                };


                // ==============================
                // Click phải = Xóa màu
                // ==============================

                colorInput.oncontextmenu = (e) => {

                    e.preventDefault();

                    const index =
                          [...customColorContainer.querySelectorAll('input[type="color"]')]
                    .indexOf(colorInput);

                    if (index !== -1) {

                        customColors.splice(index, 1);

                        COLOR_STYLES.custom =
                            createMultiGradientPalette(
                            customColors,
                            24
                        );

                        colorInput.remove();
                    }

                    console.log(
                        "🎨 Custom Colors:",
                        customColors
                    );
                };


                customColorContainer.insertBefore(
                    colorInput,
                    addCustomColorButton
                );
            }
            addCustomColorButton.onclick = () => {
                addCustomColorPicker();
            };

            rainbowStyleSelect.innerHTML = `
    <option value="off">🚫 OFF</option>
    <option value="random">🎲 Random</option>
    <option value="classic">🌈 Classic</option>
    <option value="fire">🔥 Fire</option>
    <option value="ocean">🌊 Ocean</option>
    <option value="forest">🌲 Forest</option>
    <option value="sunset">🌅 Sunset</option>
    <option value="neon">💜 Neon</option>
    <option value="custom">🎨 Custom</option>
`;

            rainbowStyleSelect.value =
                rainbowChatEnabled ? rainbowChatStyle : "off";

            rainbowStyleSelect.onchange = () => {
                const value = rainbowStyleSelect.value;

                if (value === "off") {
                    rainbowChatEnabled = false;
                } else {
                    rainbowChatEnabled = true;
                    rainbowChatStyle = value;
                }

                customColorContainer.style.display =
                    value === "custom" ? "flex" : "none";

                console.log(
                    "🌈 Rainbow:",
                    rainbowChatEnabled ? `ON - ${rainbowChatStyle}` : "OFF"
                );
            };

            rainbowRow.appendChild(rainbowLabel);
            rainbowRow.appendChild(rainbowStyleSelect);
            rainbowRow.appendChild(customColorContainer);

            toolboxContent.appendChild(rainbowRow);
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

        const audioRow = document.createElement("div");
        audioRow.className = "toolbox-row";

        const audioText = document.createElement("label");
        audioText.innerText = "Audio alert";
        audioText.style.color = "white";

        const audioSwitch = document.createElement("button");
        audioSwitch.type = "button";
        audioSwitch.className = "audio-switch";

        audioSwitch.classList.toggle("on", audioControlEnabled);

        audioSwitch.onclick = () => {
            audioControlEnabled = !audioControlEnabled;

            audioSwitch.classList.toggle("on", audioControlEnabled);

            log(`Audio Control ${audioControlEnabled ? "ON" : "OFF"}`);
        };

        audioRow.appendChild(audioText);
        audioRow.appendChild(audioSwitch);

        toolboxContent.appendChild(audioRow);

        const greetingRow = document.createElement("div");
        greetingRow.className = "toolbox-row";

        const greetingLabel = document.createElement("label");
        greetingLabel.innerText = "Welcome new member";
        greetingLabel.style.color = "white";

        greetingRow.appendChild(greetingLabel);
        greetingRow.appendChild(newUserGreetingBtn);

        toolboxContent.appendChild(greetingRow);


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
            initNewUserGreeting();
        } catch (err) {
            console.error(err);
            setTimeout(init, 2000);
        }
    }

    init();
})();
