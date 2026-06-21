// ==UserScript==
// @name         NhapMa - UI Helper
// @namespace    nhapma-helper
// @version      1.0
// @description  Semi-auto human-interaction for nhapma.com
// @author       Friczh
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      nhapma.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const POLL_MS     = 800;
    const MAX_WAIT_MS = 120000;
    const CLICK_DELAY = 400;

    const IS_DASHBOARD = location.hostname === 'nhapma.com' && location.pathname.startsWith('/v/');
    const IS_EXTERNAL  = !location.hostname.includes('nhapma.com');

    const C = {
        info    : '#6fb3f7',
        success : '#30d158',
        warn    : '#ffd60a',
        error   : '#ff453a',
        purple  : '#bf5af2',
        orange  : '#ff9f0a',
        pink    : '#ff375f',
        muted   : '#6a6a6a',
    };

    let winState = 'closed';
    let termEl   = null;

    function ts() {
        const n = new Date();
        return [n.getHours(), n.getMinutes(), n.getSeconds()]
            .map(v => String(v).padStart(2, '0')).join(':');
    }

    function humanClick(el) {
        el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })), CLICK_DELAY);
    }

    function injectStyles() {
        if (document.getElementById('npm-style')) return;
        const s = document.createElement('style');
        s.id = 'npm-style';
        s.textContent = `
            #npm-win {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: min(680px, 92vw);
                aspect-ratio: 680 / 400;
                background: #1c1c1e;
                border-radius: 12px;
                box-shadow:
                    0 0 0 0.5px rgba(255,255,255,0.07),
                    0 8px 32px rgba(0,0,0,0.6),
                    0 2px 8px rgba(0,0,0,0.5);
                font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
                font-size: 12.5px;
                z-index: 2147483647;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                resize: both;
                min-width: 320px;
            }
            #npm-titlebar {
                background: linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 100%);
                border-bottom: 1px solid rgba(0,0,0,0.5);
                padding: 0 16px;
                height: 38px;
                display: flex;
                align-items: center;
                flex-shrink: 0;
                cursor: default;
                user-select: none;
                -webkit-user-select: none;
                position: relative;
            }
            .npm-lights {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-shrink: 0;
                z-index: 1;
            }
            .npm-tl {
                width: 13px;
                height: 13px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: filter 0.12s;
            }
            .npm-tl:hover { filter: brightness(1.15); }
            .npm-tl-red    { background: #ff5f57; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .npm-tl-yellow { background: #febc2e; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .npm-tl-green  { background: #28c840; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .npm-tl-gray   { background: #44444a; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.1),  0 0.5px 0 rgba(0,0,0,0.4); cursor: default; pointer-events: none; }
            .npm-glyph {
                opacity: 0;
                font-size: 9px;
                font-weight: 800;
                color: rgba(0,0,0,0.5);
                pointer-events: none;
                line-height: 1;
                font-family: -apple-system, sans-serif;
                transition: opacity 0.1s;
            }
            .npm-lights:hover .npm-glyph { opacity: 1; }
            .npm-tl-gray .npm-glyph { opacity: 0 !important; }
            #npm-title {
                position: absolute;
                left: 0; right: 0;
                text-align: center;
                color: #98989e;
                font-size: 12px;
                font-weight: 500;
                font-family: -apple-system, system-ui, sans-serif;
                letter-spacing: 0.01em;
                pointer-events: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 0 120px;
            }
            #npm-body {
                flex: 1;
                overflow-y: auto;
                padding: 10px 16px 14px;
                background: #1c1c1e;
                line-height: 1.7;
                max-height: 800px;
                opacity: 1;
                transition:
                    max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.22s ease,
                    padding-top 0.3s ease,
                    padding-bottom 0.3s ease;
            }
            #npm-body::-webkit-scrollbar       { width: 4px; }
            #npm-body::-webkit-scrollbar-track { background: transparent; }
            #npm-body::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 4px; }
            .npm-line {
                display: flex;
                gap: 8px;
                align-items: baseline;
                margin-bottom: 1px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .npm-ts     { color: #3a3a3c; font-size: 10px; flex-shrink: 0; user-select: none; }
            .npm-prompt { color: #48484a; flex-shrink: 0; user-select: none; }
            .npm-msg    { flex: 1; }
            #npm-win.minimized #npm-body {
                max-height: 0 !important;
                opacity: 0 !important;
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                overflow: hidden !important;
            }
            #npm-win.minimized {
                resize: none;
                aspect-ratio: auto !important;
                height: auto !important;
                min-height: unset !important;
            }
            #npm-win.minimized #npm-titlebar { border-bottom: none; }
        `;
        document.head.appendChild(s);
    }

    function setMinimized(val) {
        termEl.classList.toggle('minimized', val);
        winState = val ? 'minimized' : 'normal';
        const btnMin = termEl.querySelector('#npm-min');
        const btnMax = termEl.querySelector('#npm-max');
        btnMin.className = 'npm-tl ' + (val ? 'npm-tl-gray' : 'npm-tl-yellow');
        btnMax.className = 'npm-tl ' + (val ? 'npm-tl-green' : 'npm-tl-gray');
        btnMin.innerHTML = `<span class="npm-glyph">−</span>`;
        btnMax.innerHTML = `<span class="npm-glyph">+</span>`;
    }

    function buildTerminal() {
        termEl = document.createElement('div');
        termEl.id = 'npm-win';
        termEl.innerHTML = `
            <div id="npm-titlebar">
                <div class="npm-lights">
                    <div class="npm-tl npm-tl-red"    id="npm-close"><span class="npm-glyph">✕</span></div>
                    <div class="npm-tl npm-tl-yellow"  id="npm-min"  ><span class="npm-glyph">−</span></div>
                    <div class="npm-tl npm-tl-gray"    id="npm-max"  ><span class="npm-glyph">+</span></div>
                </div>
                <span id="npm-title">nhapma-helper — bash</span>
            </div>
            <div id="npm-body"></div>
        `;
        document.body.appendChild(termEl);

        termEl.querySelector('#npm-close').addEventListener('click', () => {
            termEl.remove();
            termEl = null;
            winState = 'closed';
        });
        termEl.querySelector('#npm-min').addEventListener('click', () => {
            if (winState === 'normal') setMinimized(true);
        });
        termEl.querySelector('#npm-max').addEventListener('click', () => {
            if (winState === 'minimized') setMinimized(false);
        });
    }

    function ensureTerminal() {
        if (winState === 'closed') {
            injectStyles();
            buildTerminal();
            winState = 'normal';
        }
    }

    function setTitle(text) {
        if (!termEl) return;
        termEl.querySelector('#npm-title').textContent = text;
    }

    function addLine(msg, color = '#d1d1d6') {
        ensureTerminal();
        if (winState === 'minimized') setMinimized(false);
        const body = termEl.querySelector('#npm-body');
        const line = document.createElement('div');
        line.className = 'npm-line';
        line.innerHTML = `<span class="npm-ts">${ts()}</span><span class="npm-prompt">$</span><span class="npm-msg" style="color:${color}">${msg}</span>`;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;
    }

    // ── DASHBOARD ────────────────────────────────────────────────────────────

    if (IS_DASHBOARD) {
        function tryPasteCode() {
            const savedCode = GM_getValue('npm_code', '');
            if (!savedCode) return;

            const input     = document.querySelector('input[name="code"]');
            const submitBtn = document.querySelector('button[type="submit"]');
            if (!input || !submitBtn) return;

            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, savedCode);
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            addLine(`✅ Đã nhập mã: ${savedCode} — đang xác nhận...`, C.success);
            GM_setValue('npm_code', '');

            setTimeout(() => submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })), 800);
        }

        setInterval(tryPasteCode, 1000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryPasteCode(); });
        window.addEventListener('focus', tryPasteCode);
        return;
    }

    // ── EXTERNAL ─────────────────────────────────────────────────────────────

    if (!IS_EXTERNAL) return;

    function hasWidget() {
        for (const s of document.querySelectorAll('script[src]'))
            if (s.src && s.src.includes('nhapma.com')) return true;
        return false;
    }

    if (!hasWidget()) return;

    let state         = 'SEARCHING_LOGO';
    let elapsed       = 0;
    let lastClickTime = 0;

    function findWidgetDiv() {
        return document.querySelector('div[data-loading]') || null;
    }

    function widgetText() {
        const div = findWidgetDiv();
        return div ? (div.innerText || div.textContent || '').toLowerCase() : '';
    }

    function isLoading() {
        const div = findWidgetDiv();
        return div ? div.getAttribute('data-loading') === 'true' : false;
    }

    function findLogoBtn() {
        for (const img of document.querySelectorAll('img'))
            if (img.src && img.src.includes('angular-icon.svg')) {
                const btn = img.closest('button');
                if (btn) return btn;
            }
        return null;
    }

    // Orange #FF6600 button — step button (has N/M text) or continue button (after timer)
    // Excludes fallback countdown buttons which show "sau N" and are non-interactive
    function findStepBtn() {
        const div = findWidgetDiv();
        if (!div) return null;
        const btn = div.querySelector('button');
        if (!btn || btn.disabled) return null;
        const bg = btn.style.background || btn.style.backgroundColor || '';
        const isOrange = bg === '#FF6600' || bg === '#ff6600' ||
                         bg.includes('255, 102, 0') || bg.includes('255,102,0');
        if (!isOrange) return null;
        // Fallback countdown buttons show "sau N" — they have no click handler, skip them
        const text = (btn.innerText || btn.textContent || '');
        return text.includes('sau') ? null : btn;
    }

    // Read remaining timer seconds from dataset (set by widget as i/1000)
    function getDataTime() {
        const div = findWidgetDiv();
        if (!div || div.dataset.time === undefined) return null;
        return parseFloat(div.dataset.time);
    }

    function findCode() {
        if (isLoading()) return null;
        const div = findWidgetDiv();
        if (!div || !div.dataset.loaded) return null;
        for (const el of div.querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (/^[A-Z0-9]{5,15}$/i.test(t)) return t;
        }
        return null;
    }

    ensureTerminal();
    setTitle('nhapma-helper — bash');
    addLine('🎯 Widget detected — starting...', C.info);

    const poll = setInterval(() => {
        elapsed += POLL_MS;

        if (elapsed > MAX_WAIT_MS) {
            clearInterval(poll);
            setTitle('nhapma-helper — timeout');
            addLine('⏱️ Timeout — max wait exceeded', C.error);
            return;
        }

        const wt = widgetText();

        // Hard error: 60s fallback expired (no valid step from server)
        if (wt.includes('có lỗi xảy ra') || wt.includes('truy cập lại nhapma')) {
            if (state !== 'SESSION_ERROR') {
                state = 'SESSION_ERROR';
                clearInterval(poll);
                setTitle('nhapma-helper — error');
                addLine('❌ Lỗi phiên — truy cập lại NhapMa.com', C.error);
            }
            return;
        }

        // Manual required: server signals user must click internal link first
        if (wt.includes('click vào link') || wt.includes('vui lòng click') || wt.includes('click vào các trang')) {
            if (state !== 'MANUAL_LINK') {
                state = 'MANUAL_LINK';
                setTitle('nhapma-helper — manual required');
                addLine('👆 Bước thủ công: click vào 1 bài viết bất kỳ trên trang này', C.warn);
                addLine('⏳ Script tự tiếp tục sau khi bạn thao tác...', C.muted);
            }
            return;
        }

        if (state === 'MANUAL_LINK') {
            state = 'SEARCHING_LOGO';
            elapsed = 0;
            setTitle('nhapma-helper — bash');
            addLine('✅ Tiếp tục tự động...', C.success);
        }

        // Step 1: find and click the transparent logo button
        if (state === 'SEARCHING_LOGO') {
            const btn = findLogoBtn();
            if (btn) {
                state = 'CLICKING_STEP';
                setTitle('nhapma-helper — step #1');
                addLine('🎯 Logo button found → clicking', C.info);
                humanClick(btn);
            }
            return;
        }

        // Step 2: wait for orange step button (POST /step response), click it to start countdown
        if (state === 'CLICKING_STEP') {
            if (isLoading()) return;
            const btn = findStepBtn();
            if (btn) {
                state = 'WAITING_TIMER';
                lastClickTime = elapsed;
                setTitle('nhapma-helper — countdown');
                addLine('🟠 Step button → clicking, starting countdown...', C.orange);
                humanClick(btn);
            }
            return;
        }

        // Step 3: wait for countdown to finish
        // Widget sets data-time (seconds remaining) during countdown
        // When countdown hits 0 → widget replaces timer div with clickable button
        if (state === 'WAITING_TIMER') {
            const t = getDataTime();
            if (t !== null && t > 0) {
                setTitle(`nhapma-helper — ${Math.ceil(t)}s remaining`);
            }
            // Timer done: orange clickable button reappears (no "sau" text)
            const btn = findStepBtn();
            if (btn) {
                state = 'CLICKING_CONFIRM';
                setTitle('nhapma-helper — confirm');
                addLine('⏰ Timer done — continue button found', C.purple);
            }
            return;
        }

        // Step 4: click the continue button (POST /continue → code or redirect)
        if (state === 'CLICKING_CONFIRM') {
            if (isLoading()) return;
            const btn = findStepBtn();
            if (btn) {
                state = 'EXTRACTING_CODE';
                lastClickTime = elapsed;
                setTitle('nhapma-helper — fetching code');
                addLine('✅ Confirm clicked — waiting for code...', C.purple);
                humanClick(btn);
            }
            return;
        }

        // Step 5: extract code after /continue response (dataset.loaded set by widget)
        if (state === 'EXTRACTING_CODE') {
            if ((elapsed - lastClickTime) < 1200 || isLoading()) return;
            const code = findCode();
            if (code) {
                state = 'DONE';
                clearInterval(poll);
                setTitle('nhapma-helper — done ✓');
                GM_setValue('npm_code', code);
                let clipOk = false;
                try { GM_setClipboard(code, 'text'); clipOk = true; } catch (e) {}
                addLine(`✅ Mã: ${code}${clipOk ? '  (copied!)' : '  ⚠️ copy thủ công'}`, C.success);
                addLine('💾 Saved → quay lại nhapma.com dashboard', C.info);
            }
            return;
        }

    }, POLL_MS);

})();
