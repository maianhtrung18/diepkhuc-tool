// ==UserScript==
// @name         Diep Khuc - Persistent User Labels
// @namespace    diep-khuk-user-labels
// @version      2.2.0
// @description  Persistent custom labels using userInfo.openId
// @match        https://diepkhuc.com/*
// @match        https://www.diepkhuc.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const STORAGE_KEY = "__dk_user_labels_openid_v2__";

    let records = loadRecords();

    // =========================================================
    // STORAGE
    // =========================================================

    function loadRecords() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return {};
            }

            const data = JSON.parse(raw);

            if (!data || typeof data !== "object") {
                return {};
            }

            return data;
        } catch (err) {
            console.error(
                "[DK Label] Failed to load records:",
                err
            );

            return {};
        }
    }

    function saveRecords() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(records)
            );
        } catch (err) {
            console.error(
                "[DK Label] Failed to save records:",
                err
            );
        }
    }

    // =========================================================
    // SYNC GIỮA CÁC TAB
    // =========================================================

    window.addEventListener("storage", function (e) {
        if (e.key !== STORAGE_KEY) {
            return;
        }

        records = loadRecords();

        console.log(
            "[DK Label] Synced from another tab"
        );

        applyAll();
    });

    // =========================================================
    // REACT FIBER
    // =========================================================

    function getFiberKey(el) {
        if (!el) {
            return null;
        }

        return Object.keys(el).find(
            key => key.startsWith("__reactFiber$")
        ) || null;
    }

    function getUserInfoFromElement(el) {
        if (!el) {
            return null;
        }

        const fiberKey = getFiberKey(el);

        if (!fiberKey) {
            return null;
        }

        let fiber = el[fiberKey];

        for (let i = 0; i < 50 && fiber; i++) {
            const props = fiber.memoizedProps;

            if (props?.userInfo?.userId) {
                return props.userInfo;
            }

            fiber = fiber.return;
        }

        return null;
    }

    // =========================================================
    // IDENTITY
    // =========================================================

    function getOpenId(userInfo) {
        if (!userInfo) {
            return null;
        }

        const value = userInfo.openId;

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return null;
        }

        return String(value);
    }

    // =========================================================
    // RECORD
    // =========================================================
    //
    // openId CHƯA CÓ:
    //     tạo record
    //     label = nickname hiện tại
    //
    // openId ĐÃ CÓ:
    //     giữ nguyên record
    //     KHÔNG overwrite label
    //     KHÔNG overwrite nick
    //
    // =========================================================

    function ensureRecord(userInfo) {
        const openId = getOpenId(userInfo);

        if (!openId) {
            return null;
        }

        // OpenId đã tồn tại
        // → lấy record cũ, tuyệt đối không sửa
        if (
            Object.prototype.hasOwnProperty.call(
                records,
                openId
            )
        ) {
            return records[openId];
        }

        // OpenId mới
        const currentNick = userInfo.nick || "";

        const record = {
            nick: currentNick,
            label: currentNick,
            updated: false
        };

        records[openId] = record;

        saveRecords();

        console.log(
            `[DK Label] New user saved: ${openId} → ${currentNick}`
        );

        return record;
    }

    // =========================================================
    // CREATE UI
    // =========================================================

    function createUI(item, userInfo, record) {
        if (!item || !userInfo || !record) {
            return;
        }

        const nickEl = item.querySelector(".nick");

        if (!nickEl) {
            return;
        }

        // UI đã tồn tại
        if (
            nickEl.parentElement?.querySelector(
                ".dk-user-label-wrap"
            )
        ) {
            return;
        }

        const openId = getOpenId(userInfo);

        if (!openId) {
            return;
        }

        // -----------------------------------------------------
        // Wrapper
        // -----------------------------------------------------

        const wrap = document.createElement("span");

        wrap.className = "dk-user-label-wrap";

        wrap.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-left: 6px;
            vertical-align: middle;
        `;

        // -----------------------------------------------------
        // Input
        // -----------------------------------------------------

        const input = document.createElement("input");

        input.className = "dk-user-label-input";
        input.type = "text";

        input.value = record.label || "";

        input.style.cssText = `
            width: 130px;
            height: 24px;
            padding: 0px 3px;
            box-sizing: border-box;
            border: 1px solid #aaa;
            border-radius: 3px;
            font-size: 18px;
            line-height: 20px;
            color: #222;
            background: #fff;
            outline: none;
        `;

        // -----------------------------------------------------
        // Khi gõ → lưu NGAY
        // -----------------------------------------------------

        input.addEventListener("input", function () {
            const currentRecord = records[openId];

            if (!currentRecord) {
                return;
            }

            currentRecord.label = input.value;
            currentRecord.updated = true;

            saveRecords();
            applyAll();
            console.log(
                `[DK Label] Saved: ${openId} → ${currentRecord.label}`
            );
        });

        // -----------------------------------------------------
        // Không cho click input trigger item
        // -----------------------------------------------------

        input.addEventListener("click", function (e) {
            e.stopPropagation();
        });

        input.addEventListener("mousedown", function (e) {
            e.stopPropagation();
        });

        input.addEventListener("mouseup", function (e) {
            e.stopPropagation();
        });

        input.addEventListener("keydown", function (e) {
            e.stopPropagation();
        });

        // -----------------------------------------------------
        // Append
        // -----------------------------------------------------

        wrap.appendChild(input);

        nickEl.append(wrap);
    }

    // =========================================================
    // UPDATE EXISTING UI
    // =========================================================
    //
    // Cực kỳ quan trọng:
    //
    // Nếu input đang focus → KHÔNG BAO GIỜ overwrite value.
    //
    // Nhờ vậy:
    //
    // gõ A
    // gõ AB
    // gõ ABC
    //
    // React re-render giữa chừng cũng không làm mất chữ.
    //
    // =========================================================

    function updateExistingUI(item, record) {
        if (!item || !record) {
            return;
        }

        const wrap =
            item.querySelector(
                ".dk-user-label-wrap"
            );

        if (!wrap) {
            return;
        }

        const input =
            wrap.querySelector(
                ".dk-user-label-input"
            );

        if (!input) {
            return;
        }

        // Đang gõ
        if (document.activeElement === input) {
            return;
        }

        // Không focus → sync từ storage
        const savedLabel = record.label || "";

        if (input.value !== savedLabel) {
            input.value = savedLabel;
        }
    }

    // =========================================================
    // PROCESS ITEM
    // =========================================================

    function processItem(item) {
        if (!item) {
            return;
        }

        if (!item.classList.contains("item")) {
            return;
        }

        const userInfo =
            getUserInfoFromElement(item);

        if (!userInfo) {
            return;
        }

        const openId =
            getOpenId(userInfo);

        if (!openId) {
            return;
        }

        const record =
            ensureRecord(userInfo);

        if (!record) {
            return;
        }

        createUI(
            item,
            userInfo,
            record
        );

        updateExistingUI(
            item,
            record
        );
    }

    // =========================================================
    // APPLY ALL
    // =========================================================

    function applyAll() {
        const items =
            document.querySelectorAll(
                ".user-list .item"
            );

        let applied = 0;

        items.forEach(item => {
            const existed =
                !!item.querySelector(
                    ".dk-user-label-wrap"
                );

            processItem(item);

            const existsNow =
                !!item.querySelector(
                    ".dk-user-label-wrap"
                );

            if (!existed && existsNow) {
                applied++;
            }
        });

        if (applied > 0) {
            console.log(
                `[DK Label] Applied: ${applied} items`
            );
        }
    }

    // =========================================================
    // OBSERVER
    // =========================================================

    function installObserver() {
        const userList =
            document.querySelector(
                ".user-list"
            );

        if (!userList) {
            setTimeout(
                installObserver,
                1000
            );

            return;
        }

        const observer =
            new MutationObserver(() => {
                applyAll();
            });

        observer.observe(
            userList,
            {
                childList: true,
                subtree: true
            }
        );

        console.log(
            "[DK Label] Observer installed"
        );
    }

    // =========================================================
    // START
    // =========================================================

    console.log(
        "[DK Label] READY v2.2.0"
    );

    console.log(
        "[DK Label] Identity key: userInfo.openId"
    );

    console.log(
        "[DK Label] Records:",
        records
    );

    applyAll();

    installObserver();

    // ---------------------------------------------------------
    // Periodic refresh
    // ---------------------------------------------------------
    //
    // Chỉ refresh UI.
    // Không thay đổi record nếu openId đã tồn tại.
    //
    // ---------------------------------------------------------

    setInterval(() => {
        applyAll();
    }, 5000);

})();

