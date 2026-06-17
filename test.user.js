// ==UserScript==
// @name         TapLayMa - UI Helper
// @namespace    taplayma-helper
// @version      0.9
// @description  Semi-auto human-interaction
// @author       Friczh
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      taplayma.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG ───────────────────────────────────────────────────────────────
    const BALLOON_SRC    = 'taplayma.com/media/svg/brand-logos/balloon.svg';
    const POLL_MS        = 800;
    const MAX_WAIT_MS    = 120000;
    const CLICK_DELAY_MS = 400;
    const IS_DASHBOARD   = location.hostname === 'taplayma.com' && location.pathname.startsWith('/link/');
    const IS_EXTERNAL    = !location.hostname.includes('taplayma.com');
    // ──────────────────────────────────────────────────────────────────────────

    function log(msg) {
        console.log(`[TapLayMa v5] ${msg}`);
    }

    function humanClick(el) {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            el.click();
        }, CLICK_DELAY_MS);
    }

    function showToast(msg, color = '#d4d4d4') {
        ensureTerminal();
        addLogLine(msg, color);
    }

    // ─── macOS Terminal — State ───────────────────────────────────────────────
    let winState = 'closed';
    let termEl   = null;
    let pillEl   = null;

    // ─── Drag state ──────────────────────────────────────────────────────────
    let isDragging = false, dragOffX = 0, dragOffY = 0;

    function getTimestamp() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function injectTerminalStyles() {
        if (document.getElementById('tpm-term-style')) return;
        const style = document.createElement('style');
        style.id = 'tpm-term-style';
        style.textContent = `
            /* ── Window ── */
            #tpm-term {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 380px;
                height: 300px;
                min-width: 260px;
                min-height: 160px;
                background: #1e1e1e;
                border-radius: 12px;
                box-shadow:
                    0 0 0 0.5px rgba(255,255,255,0.08),
                    0 2px 4px rgba(0,0,0,0.4),
                    0 12px 48px rgba(0,0,0,0.7);
                font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
                font-size: 12px;
                z-index: 2147483647;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                resize: both;
            }

            /* ── Title bar ── */
            #tpm-titlebar {
                background: linear-gradient(180deg, #323232 0%, #2a2a2a 100%);
                border-bottom: 1px solid #111;
                padding: 0 12px;
                height: 38px;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
                cursor: default;
                -webkit-user-select: none;
                user-select: none;
            }

            /* ── Traffic lights ── */
            .tpm-tl-group {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .tpm-tl {
                width: 13px;
                height: 13px;
                border-radius: 50%;
                cursor: pointer;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: filter 0.1s;
            }
            .tpm-tl.disabled {
                cursor: default;
                opacity: 0.35;
            }
            .tpm-tl-red    { background: #ff5f56; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0.5px 0 rgba(0,0,0,0.3); }
            .tpm-tl-yellow { background: #ffbd2e; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0.5px 0 rgba(0,0,0,0.3); }
            .tpm-tl-green  { background: #28c840; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.2), 0 0.5px 0 rgba(0,0,0,0.3); }

            /* Glyph on hover — macOS authentic */
            .tpm-tl-glyph {
                opacity: 0;
                font-size: 9px;
                font-weight: 700;
                line-height: 1;
                color: rgba(0,0,0,0.55);
                pointer-events: none;
                transition: opacity 0.1s;
                font-family: -apple-system, sans-serif;
            }
            .tpm-tl-group:hover .tpm-tl-glyph { opacity: 1; }
            .tpm-tl.disabled .tpm-tl-glyph { opacity: 0 !important; }

            /* ── Window title ── */
            #tpm-title {
                flex: 1;
                text-align: center;
                color: #9a9a9a;
                font-size: 12px;
                font-weight: 500;
                font-family: -apple-system, system-ui, sans-serif;
                letter-spacing: 0.01em;
                pointer-events: none;
                /* offset to visually center against the traffic light cluster */
                margin-right: 53px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* ── Tab bar (single tab style) ── */
            #tpm-tabbar {
                background: #252525;
                border-bottom: 1px solid #111;
                display: flex;
                align-items: center;
                padding: 0 12px;
                height: 30px;
                gap: 4px;
                flex-shrink: 0;
            }
            .tpm-tab {
                display: flex;
                align-items: center;
                gap: 6px;
                background: #1e1e1e;
                border: 1px solid #3a3a3a;
                border-bottom: 1px solid #1e1e1e;
                border-radius: 6px 6px 0 0;
                padding: 0 10px;
                height: 26px;
                color: #ccc;
                font-size: 11px;
                font-family: -apple-system, system-ui, sans-serif;
            }
            .tpm-tab-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #28c840;
                flex-shrink: 0;
            }
            .tpm-tab-dot.idle { background: #6a6a6a; }
            .tpm-tab-dot.busy { background: #ffbd2e; animation: tpm-pulse 1.2s ease-in-out infinite; }
            .tpm-tab-dot.done { background: #28c840; }
            .tpm-tab-dot.error { background: #ff5f56; }

            @keyframes tpm-pulse {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.35; }
            }

            /* ── Log body ── */
            #tpm-body {
                flex: 1;
                overflow-y: auto;
                padding: 10px 14px 12px;
                background: #1e1e1e;
                line-height: 1.65;
            }
            #tpm-body::-webkit-scrollbar        { width: 5px; }
            #tpm-body::-webkit-scrollbar-track  { background: transparent; }
            #tpm-body::-webkit-scrollbar-thumb  { background: #3a3a3a; border-radius: 4px; }
            #tpm-body::-webkit-scrollbar-thumb:hover { background: #505050; }

            /* ── Log lines ── */
            .tpm-line {
                display: flex;
                gap: 8px;
                margin-bottom: 2px;
                white-space: pre-wrap;
                word-break: break-word;
                align-items: baseline;
            }
            .tpm-line-ts {
                color: #4a4a4a;
                font-size: 10px;
                flex-shrink: 0;
                padding-top: 1px;
                user-select: none;
            }
            .tpm-line-prompt {
                color: #3d3d3d;
                flex-shrink: 0;
                user-select: none;
            }
            .tpm-line-msg {
                flex: 1;
            }

            /* ── Status bar ── */
            #tpm-statusbar {
                background: #252525;
                border-top: 1px solid #111;
                height: 22px;
                display: flex;
                align-items: center;
                padding: 0 12px;
                gap: 10px;
                flex-shrink: 0;
                color: #555;
                font-size: 10px;
                font-family: -apple-system, system-ui, sans-serif;
                user-select: none;
            }
            #tpm-statusbar .tpm-sb-item { display: flex; align-items: center; gap: 4px; }
            #tpm-sb-phase { color: #7a7a7a; margin-left: auto; }

            /* ── Minimized pill ── */
            #tpm-pill {
                position: fixed;
                top: 16px;
                right: 16px;
                height: 32px;
                padding: 0 14px 0 10px;
                border-radius: 16px;
                background: #2a2a2a;
                border: 0.5px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 14px rgba(0,0,0,0.5);
                z-index: 2147483647;
                display: none;
                align-items: center;
                gap: 8px;
                font-family: -apple-system, system-ui, sans-serif;
                cursor: default;
            }
            .tpm-pill-tl-group { display: flex; gap: 6px; align-items: center; }
            .tpm-pill-tl-group:hover .tpm-tl-glyph { opacity: 1; }

            #tpm-pill-label {
                color: #aaa;
                font-size: 12px;
                font-weight: 500;
                pointer-events: none;
            }
            #tpm-pill-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #28c840;
                margin-left: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    function buildTerminal() {
        // ── Main window ──
        termEl = document.createElement('div');
        termEl.id = 'tpm-term';
        termEl.innerHTML = `
            <div id="tpm-titlebar">
                <div class="tpm-tl-group">
                    <div class="tpm-tl tpm-tl-red" id="tpm-btn-close" title="Close">
                        <span class="tpm-tl-glyph">✕</span>
                    </div>
                    <div class="tpm-tl tpm-tl-yellow" id="tpm-btn-min" title="Minimize">
                        <span class="tpm-tl-glyph">−</span>
                    </div>
                    <div class="tpm-tl tpm-tl-green disabled" id="tpm-btn-max" title="Maximize">
                        <span class="tpm-tl-glyph">+</span>
                    </div>
                </div>
                <span id="tpm-title">taplayma-helper — bash</span>
            </div>
            <div id="tpm-tabbar">
                <div class="tpm-tab">
                    <div class="tpm-tab-dot idle" id="tpm-tab-dot"></div>
                    <span id="tpm-tab-label">bash</span>
                </div>
            </div>
            <div id="tpm-body"></div>
            <div id="tpm-statusbar">
                <span class="tpm-sb-item">taplayma.com</span>
                <span id="tpm-sb-phase">idle</span>
            </div>
        `;
        document.body.appendChild(termEl);

        // ── Pill (minimized) ──
        pillEl = document.createElement('div');
        pillEl.id = 'tpm-pill';
        pillEl.innerHTML = `
            <div class="tpm-pill-tl-group">
                <div class="tpm-tl tpm-tl-red" id="tpm-pill-close" title="Close">
                    <span class="tpm-tl-glyph">✕</span>
                </div>
                <div class="tpm-tl tpm-tl-yellow disabled" id="tpm-pill-min" title="Minimize">
                    <span class="tpm-tl-glyph">−</span>
                </div>
                <div class="tpm-tl tpm-tl-green" id="tpm-pill-max" title="Restore">
                    <span class="tpm-tl-glyph">+</span>
                </div>
            </div>
            <span id="tpm-pill-label">TapLayMa</span>
            <div id="tpm-pill-dot"></div>
        `;
        document.body.appendChild(pillEl);

        // ── Traffic light events ──
        termEl.querySelector('#tpm-btn-close').addEventListener('click', doClose);
        termEl.querySelector('#tpm-btn-min').addEventListener('click', doMinimize);
        pillEl.querySelector('#tpm-pill-close').addEventListener('click', doClose);
        pillEl.querySelector('#tpm-pill-max').addEventListener('click', doMaximize);

        // ── Drag ──
        const titlebar = termEl.querySelector('#tpm-titlebar');
        titlebar.addEventListener('mousedown', e => {
            if (e.target.classList.contains('tpm-tl')) return;
            isDragging = true;
            const rect = termEl.getBoundingClientRect();
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            termEl.style.transition = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const x = e.clientX - dragOffX;
            const y = e.clientY - dragOffY;
            // Clamp to viewport
            const maxX = window.innerWidth  - termEl.offsetWidth;
            const maxY = window.innerHeight - termEl.offsetHeight;
            termEl.style.left   = Math.max(0, Math.min(x, maxX)) + 'px';
            termEl.style.top    = Math.max(0, Math.min(y, maxY)) + 'px';
            termEl.style.right  = 'auto';
            termEl.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });
    }

    function doClose() {
        if (termEl) termEl.remove();
        if (pillEl) pillEl.remove();
        termEl = null; pillEl = null;
        winState = 'closed';
    }

    function doMinimize() {
        if (winState !== 'normal') return;
        termEl.style.display = 'none';
        pillEl.style.display = 'flex';
        winState = 'minimized';
    }

    function doMaximize() {
        if (winState !== 'minimized') return;
        pillEl.style.display = 'none';
        termEl.style.display = 'flex';
        winState = 'normal';
    }

    function ensureTerminal() {
        if (winState === 'closed') {
            injectTerminalStyles();
            buildTerminal();
            winState = 'normal';
        }
    }

    function setPhase(label, dotState = 'idle') {
        if (!termEl) return;
        const dot   = termEl.querySelector('#tpm-tab-dot');
        const phase = termEl.querySelector('#tpm-sb-phase');
        const tab   = termEl.querySelector('#tpm-tab-label');
        if (dot)   { dot.className = 'tpm-tab-dot ' + dotState; }
        if (phase) { phase.textContent = label; }
        if (tab)   { tab.textContent = label; }
    }

    function addLogLine(msg, color = '#d4d4d4') {
        if (!termEl) return;
        const body = termEl.querySelector('#tpm-body');
        const line = document.createElement('div');
        line.className = 'tpm-line';
        line.innerHTML = `
            <span class="tpm-line-ts">${getTimestamp()}</span>
            <span class="tpm-line-prompt">$</span>
            <span class="tpm-line-msg" style="color:${color}">${msg}</span>
        `;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;
    }

    // =========================================================================
    // DASHBOARD SIDE — taplayma.com/link/*
    // =========================================================================
    if (IS_DASHBOARD) {
        log('📋 Dashboard detected');

        function tryPasteCode() {
            const savedCode = GM_getValue('tpm_code', '');
            if (!savedCode) {
                log('No saved code found yet.');
                return;
            }

            const input     = document.querySelector('input[name="code"]');
            const submitBtn = document.querySelector('button[type="submit"]');

            if (!input || !submitBtn) {
                log('Input or button not found yet, retrying...');
                return false;
            }

            const nativeInputSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeInputSetter.call(input, savedCode);
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            log(`✅ Pasted code: ${savedCode}`);
            showToast(`✅ Đã nhập mã: ${savedCode}\nĐang xác nhận...`, '#28c840');
            GM_setValue('tpm_code', '');

            setTimeout(() => {
                submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                submitBtn.click();
                log('🚀 Submitted!');
            }, 800);

            return true;
        }

        setInterval(() => tryPasteCode(), 1000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                log('👀 Tab became visible — checking for new code...');
                tryPasteCode();
            }
        });

        window.addEventListener('focus', () => {
            log('🎯 Window focused — checking for new code...');
            tryPasteCode();
        });

        return;
    }

    // =========================================================================
    // EXTERNAL SITE — find widget, run full flow
    // =========================================================================
    if (!IS_EXTERNAL) return;

    function hasWidget() {
        for (const s of document.querySelectorAll('script[src]')) {
            if (s.src && s.src.includes('taplayma.com')) return true;
        }
        return false;
    }

    if (!hasWidget()) {
        log('No taplayma widget on this page. Exiting.');
        return;
    }

    log('🎯 Taplayma widget detected on external site');

    let state = 'SEARCHING_BALLOON';
    let elapsed = 0;
    let lastConfirmClickTime = 0;

    function findBalloonBtn() {
        for (const img of document.querySelectorAll('img')) {
            if (img.src && img.src.includes(BALLOON_SRC)) {
                const btn = img.closest('button');
                if (btn) return btn;
            }
        }
        return null;
    }

    function findWidgetDiv() {
        return document.querySelector('div[data-loading]') || null;
    }

    function findPinkConfirmBtn() {
        const div = findWidgetDiv();
        if (!div) return null;
        const btn = div.querySelector('button');
        if (!btn) return null;
        const bg = btn.style.background || btn.style.backgroundColor || '';
        if (bg.includes('244') && bg.includes('63') && bg.includes('143')) return btn;
        return null;
    }

    function isWidgetLoading() {
        const div = findWidgetDiv();
        if (!div) return false;
        return div.getAttribute('data-loading') === 'true';
    }

    function findCode() {
        if (isWidgetLoading()) return null;
        const div = findWidgetDiv();
        if (!div) return null;
        for (const el of div.querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const text = (el.innerText || el.textContent || '').trim();
            if (/^[A-Z0-9]{5,15}$/i.test(text)) return text;
        }
        const widgetText = div.innerText || '';
        const match = widgetText.match(/\b([A-Z0-9]{5,15})\b/i);
        return match ? match[1] : null;
    }

    // Color palette for phases
    const C = {
        info    : '#8ab4f8',  // soft blue
        success : '#28c840',  // green
        warn    : '#ffbd2e',  // yellow
        error   : '#ff5f56',  // red
        purple  : '#c792ea',  // purple
        orange  : '#f97316',  // orange
        muted   : '#6a6a6a',  // muted
    };

    // ─── MAIN POLL LOOP ───────────────────────────────────────────────────────
    const poll = setInterval(() => {
        elapsed += POLL_MS;

        if (elapsed > MAX_WAIT_MS) {
            clearInterval(poll);
            setPhase('timeout', 'error');
            showToast('⏱️ Timeout — max wait exceeded', C.error);
            return;
        }

        if (state === 'SEARCHING_BALLOON') {
            setPhase('searching…', 'busy');
            const btn = findBalloonBtn();
            if (btn) {
                state = 'CLICKING_CONFIRM1';
                log('🎈 Balloon → clicking');
                showToast('🎈 Đã nhấn balloon!', '#e91e8c');
                humanClick(btn);
            }
            return;
        }

        if (state === 'CLICKING_CONFIRM1') {
            setPhase('confirm #1', 'busy');
            const btn = findPinkConfirmBtn();
            if (btn) {
                state = 'WAITING_TIMER';
                lastConfirmClickTime = elapsed;
                log('👆 Confirm #1 → clicking (timer starts)');
                showToast('👆 Xác nhận #1 — đang đếm giờ…', C.purple);
                humanClick(btn);
            }
            return;
        }

        if (state === 'WAITING_TIMER') {
            setPhase('waiting timer…', 'busy');
            const cooldown = (elapsed - lastConfirmClickTime) > 4000;
            if (cooldown) {
                const btn = findPinkConfirmBtn();
                if (btn) {
                    state = 'CLICKING_CONFIRM2';
                    log('⏰ Timer done — confirm #2 appeared');
                    showToast('⏰ Timer xong! Xác nhận lần 2…', C.orange);
                }
            }
            return;
        }

        if (state === 'CLICKING_CONFIRM2') {
            setPhase('confirm #2', 'busy');
            const btn = findPinkConfirmBtn();
            if (btn) {
                state = 'FINDING_CODE';
                lastConfirmClickTime = elapsed;
                log('👆 Confirm #2 → clicking');
                humanClick(btn);
            }
            return;
        }

        if (state === 'FINDING_CODE') {
            setPhase('reading code…', 'busy');
            if ((elapsed - lastConfirmClickTime) < 1200) return;
            if (isWidgetLoading()) {
                log('⏳ Widget still loading code...');
                return;
            }

            const code = findCode();
            if (code) {
                state = 'DONE';
                clearInterval(poll);
                setPhase('done ✓', 'done');
                log(`🎉 Code found: ${code}`);
                GM_setValue('tpm_code', code);

                let clipboardOk = false;
                try {
                    GM_setClipboard(code, 'text');
                    clipboardOk = true;
                    log('📋 GM_setClipboard succeeded');
                } catch (e) {
                    log(`⚠️ GM_setClipboard failed: ${e.message}`);
                }

                if (clipboardOk) {
                    showToast(`✅ Mã: ${code}  (đã copy!)`, C.success);
                } else {
                    showToast(`✅ Mã: ${code}\n⚠️ Copy thủ công (auto-copy lỗi)`, C.warn);
                }

                log('💾 Code saved → go back to taplayma.com dashboard');
            } else {
                log('🔎 Waiting for code...');
            }
            return;
        }

    }, POLL_MS);

})();
