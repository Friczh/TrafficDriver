// ==UserScript==
// @name         TapLayMa - UI Helper
// @namespace    taplayma-helper
// @version      1.4
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

    const BALLOON_SRC    = 'taplayma.com/media/svg/brand-logos/balloon.svg';
    const POLL_MS        = 800;
    const MAX_WAIT_MS    = 120000;
    const CLICK_DELAY_MS = 400;
    const IS_DASHBOARD   = location.hostname === 'taplayma.com' && location.pathname.startsWith('/link/');
    const IS_EXTERNAL    = !location.hostname.includes('taplayma.com');

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
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })), CLICK_DELAY_MS);
    }

    function injectStyles() {
        if (document.getElementById('tpm-style')) return;
        const s = document.createElement('style');
        s.id = 'tpm-style';
        s.textContent = `
            #tpm-win {
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
            #tpm-titlebar {
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
            .tpm-lights {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-shrink: 0;
                z-index: 1;
            }
            .tpm-tl {
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
            .tpm-tl:hover { filter: brightness(1.15); }
            .tpm-tl-red    { background: #ff5f57; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .tpm-tl-yellow { background: #febc2e; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .tpm-tl-green  { background: #28c840; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25), 0 0.5px 0 rgba(0,0,0,0.4); }
            .tpm-tl-gray   { background: #44444a; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.1), 0 0.5px 0 rgba(0,0,0,0.4); cursor: default; pointer-events: none; }
            .tpm-glyph {
                opacity: 0;
                font-size: 9px;
                font-weight: 800;
                color: rgba(0,0,0,0.5);
                pointer-events: none;
                line-height: 1;
                font-family: -apple-system, sans-serif;
                transition: opacity 0.1s;
            }
            .tpm-lights:hover .tpm-glyph { opacity: 1; }
            .tpm-tl-gray .tpm-glyph { opacity: 0 !important; }
            #tpm-title {
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
            #tpm-body {
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
            #tpm-body::-webkit-scrollbar       { width: 4px; }
            #tpm-body::-webkit-scrollbar-track { background: transparent; }
            #tpm-body::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 4px; }
            .tpm-line {
                display: flex;
                gap: 8px;
                align-items: baseline;
                margin-bottom: 1px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .tpm-ts     { color: #3a3a3c; font-size: 10px; flex-shrink: 0; user-select: none; }
            .tpm-prompt { color: #48484a; flex-shrink: 0; user-select: none; }
            .tpm-msg    { flex: 1; }
            #tpm-win.minimized #tpm-body {
                max-height: 0 !important;
                opacity: 0 !important;
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                overflow: hidden !important;
            }
            #tpm-win.minimized {
                resize: none;
                aspect-ratio: auto !important;
                height: auto !important;
                min-height: unset !important;
            }
            #tpm-win.minimized #tpm-titlebar { border-bottom: none; }
        `;
        document.head.appendChild(s);
    }

    function setMinimized(val) {
        termEl.classList.toggle('minimized', val);
        winState = val ? 'minimized' : 'normal';
        const btnMin = termEl.querySelector('#tpm-min');
        const btnMax = termEl.querySelector('#tpm-max');
        btnMin.className = 'tpm-tl ' + (val ? 'tpm-tl-gray' : 'tpm-tl-yellow');
        btnMax.className = 'tpm-tl ' + (val ? 'tpm-tl-green' : 'tpm-tl-gray');
        btnMin.innerHTML = `<span class="tpm-glyph">−</span>`;
        btnMax.innerHTML = `<span class="tpm-glyph">+</span>`;
    }

    function buildTerminal() {
        termEl = document.createElement('div');
        termEl.id = 'tpm-win';
        termEl.innerHTML = `
            <div id="tpm-titlebar">
                <div class="tpm-lights">
                    <div class="tpm-tl tpm-tl-red"    id="tpm-close"><span class="tpm-glyph">✕</span></div>
                    <div class="tpm-tl tpm-tl-yellow"  id="tpm-min"  ><span class="tpm-glyph">−</span></div>
                    <div class="tpm-tl tpm-tl-gray"    id="tpm-max"  ><span class="tpm-glyph">+</span></div>
                </div>
                <span id="tpm-title">taplayma-helper — bash</span>
            </div>
            <div id="tpm-body"></div>
        `;
        document.body.appendChild(termEl);

        termEl.querySelector('#tpm-close').addEventListener('click', () => {
            termEl.remove();
            termEl = null;
            winState = 'closed';
        });
        termEl.querySelector('#tpm-min').addEventListener('click', () => {
            if (winState === 'normal') setMinimized(true);
        });
        termEl.querySelector('#tpm-max').addEventListener('click', () => {
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
        termEl.querySelector('#tpm-title').textContent = text;
    }

    function addLine(msg, color = '#d1d1d6') {
        ensureTerminal();
        if (winState === 'minimized') setMinimized(false);
        const body = termEl.querySelector('#tpm-body');
        const line = document.createElement('div');
        line.className = 'tpm-line';
        line.innerHTML = `<span class="tpm-ts">${ts()}</span><span class="tpm-prompt">$</span><span class="tpm-msg" style="color:${color}">${msg}</span>`;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;
    }

    if (IS_DASHBOARD) {
        function tryPasteCode() {
            const savedCode = GM_getValue('tpm_code', '');
            if (!savedCode) return;

            const input     = document.querySelector('input[name="code"]');
            const submitBtn = document.querySelector('button[type="submit"]');
            if (!input || !submitBtn) return;

            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, savedCode);
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            addLine(`✅ Đã nhập mã: ${savedCode} — đang xác nhận...`, C.success);
            GM_setValue('tpm_code', '');

            setTimeout(() => submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })), 800);
        }

        setInterval(tryPasteCode, 1000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryPasteCode(); });
        window.addEventListener('focus', tryPasteCode);
        return;
    }

    if (!IS_EXTERNAL) return;

    function hasWidget() {
        for (const s of document.querySelectorAll('script[src]'))
            if (s.src && s.src.includes('taplayma.com')) return true;
        return false;
    }

    if (!hasWidget()) return;

    let state = 'SEARCHING_BALLOON';
    let elapsed = 0;
    let lastClickTime = 0;

    function findWidgetDiv() {
        return document.querySelector('div[data-loading]') || null;
    }

    function widgetText() {
        const div = findWidgetDiv();
        return div ? (div.innerText || div.textContent || '').toLowerCase() : '';
    }

    function findBalloonBtn() {
        for (const img of document.querySelectorAll('img'))
            if (img.src && img.src.includes(BALLOON_SRC)) {
                const btn = img.closest('button');
                if (btn) return btn;
            }
        return null;
    }

    function findPinkBtn() {
        const div = findWidgetDiv();
        if (!div) return null;
        const btn = div.querySelector('button');
        if (!btn || btn.disabled) return null;
        const bg = btn.style.background || btn.style.backgroundColor || '';
        return (bg.includes('244') && bg.includes('63') && bg.includes('143')) ? btn : null;
    }

    function findCountdown() {
        const div = findWidgetDiv();
        if (!div) return -1;
        for (const el of div.querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (/^\d+$/.test(t) && t.length <= 3) return parseInt(t);
        }
        return -1;
    }

    function isLoading() {
        const div = findWidgetDiv();
        return div ? div.getAttribute('data-loading') === 'true' : false;
    }

    function findCode() {
        if (isLoading()) return null;
        const div = findWidgetDiv();
        if (!div) return null;
        for (const el of div.querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (/^[A-Z0-9]{5,15}$/i.test(t)) return t;
        }
        const m = (div.innerText || '').match(/\b([A-Z0-9]{5,15})\b/i);
        return m ? m[1] : null;
    }

    ensureTerminal();
    setTitle('taplayma-helper — bash');
    addLine('🎯 Widget detected — starting...', C.info);

    const poll = setInterval(() => {
        elapsed += POLL_MS;

        if (elapsed > MAX_WAIT_MS) {
            clearInterval(poll);
            setTitle('taplayma-helper — timeout');
            addLine('⏱️ Timeout — max wait exceeded', C.error);
            return;
        }

        const wt = widgetText();

        if (wt.includes('đúng web') || wt.includes('không đổi ip') || wt.includes('không đổi trình duyệt')) {
            if (state !== 'SESSION_ERROR') {
                state = 'SESSION_ERROR';
                clearInterval(poll);
                setTitle('taplayma-helper — blocked');
                addLine('❌ Lỗi phiên: vào đúng web, không đổi IP/trình duyệt', C.error);
            }
            return;
        }

        if (wt.includes('click vào link') || wt.includes('click vào các trang')) {
            if (state !== 'MANUAL_LINK') {
                state = 'MANUAL_LINK';
                setTitle('taplayma-helper — manual required');
                addLine('👆 Bước thủ công: click vào 1 bài viết bất kỳ trên trang này', C.warn);
                addLine('⏳ Script tự tiếp tục sau khi bạn thao tác...', C.muted);
            }
            return;
        }

        if (state === 'MANUAL_LINK') {
            state = 'SEARCHING_BALLOON';
            elapsed = 0;
            setTitle('taplayma-helper — bash');
            addLine('✅ Tiếp tục tự động...', C.success);
        }

        if (state === 'SEARCHING_BALLOON') {
            const btn = findBalloonBtn();
            if (btn) {
                state = 'CLICKING_CONFIRM1';
                setTitle('taplayma-helper — confirm #1');
                addLine('🎈 Balloon found → clicking', C.pink);
                humanClick(btn);
            }
            return;
        }

        if (state === 'CLICKING_CONFIRM1') {
            const btn = findPinkBtn();
            if (btn) {
                state = 'WAITING_TIMER';
                lastClickTime = elapsed;
                setTitle('taplayma-helper — waiting timer');
                addLine('👆 Confirm #1 clicked — waiting for timer...', C.purple);
                humanClick(btn);
            }
            return;
        }

        if (state === 'WAITING_TIMER') {
            const n = findCountdown();
            const timerDone = (n === 0) || (n === -1 && (elapsed - lastClickTime) > 5000);
            if (timerDone) {
                const btn = findPinkBtn();
                if (btn) {
                    state = 'CLICKING_CONFIRM2';
                    lastClickTime = elapsed;
                    setTitle('taplayma-helper — confirm #2');
                    addLine('⏰ Timer done — confirm #2 appeared', C.orange);
                    humanClick(btn);
                }
            }
            return;
        }

        if (state === 'CLICKING_CONFIRM2') {
            if ((elapsed - lastClickTime) < 1200 || isLoading()) return;
            const code = findCode();
            if (code) {
                state = 'DONE';
                clearInterval(poll);
                setTitle('taplayma-helper — done ✓');
                GM_setValue('tpm_code', code);
                let clipOk = false;
                try { GM_setClipboard(code, 'text'); clipOk = true; } catch (e) {}
                addLine(`✅ Mã: ${code}${clipOk ? '  (copied!)' : '  ⚠️ copy thủ công'}`, C.success);
                addLine('💾 Saved → quay lại taplayma.com dashboard', C.info);
            }
            return;
        }

    }, POLL_MS);

})();
