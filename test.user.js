// ==UserScript==
// @name         TapLayMa - UI Helper
// @namespace    taplayma-helper
// @version      1.0
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
        console.log(`[TapLayMa] ${msg}`);
    }

    function humanClick(el) {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            el.click();
        }, CLICK_DELAY_MS);
    }

    // ─── State ────────────────────────────────────────────────────────────────
    let winState = 'closed';
    let termEl   = null;

    // ─── Drag ─────────────────────────────────────────────────────────────────
    let isDragging = false, dragOffX = 0, dragOffY = 0;

    function ts() {
        const n = new Date();
        return [n.getHours(), n.getMinutes(), n.getSeconds()]
            .map(v => String(v).padStart(2, '0')).join(':');
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
                min-height: 48px;
            }

            /* ── Titlebar ── */
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

            /* ── Traffic lights ── */
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
            .tpm-tl-gray   { background: #44444a; box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.1),  0 0.5px 0 rgba(0,0,0,0.4); cursor: default; }

            /* glyph on group hover */
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

            /* ── Centered title ── */
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

            /* ── Log body ── */
            #tpm-body {
                flex: 1;
                overflow-y: auto;
                padding: 10px 16px 14px;
                background: #1c1c1e;
                line-height: 1.7;
            }
            #tpm-body::-webkit-scrollbar       { width: 4px; }
            #tpm-body::-webkit-scrollbar-track { background: transparent; }
            #tpm-body::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 4px; }

            /* ── Log lines ── */
            .tpm-line {
                display: flex;
                gap: 8px;
                align-items: baseline;
                margin-bottom: 1px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .tpm-ts {
                color: #3a3a3c;
                font-size: 10px;
                flex-shrink: 0;
                user-select: none;
            }
            .tpm-prompt {
                color: #48484a;
                flex-shrink: 0;
                user-select: none;
            }
            .tpm-msg { flex: 1; }

            /* ── Minimized: only titlebar visible ── */
            #tpm-win.minimized #tpm-body { display: none; }
            #tpm-win.minimized {
                resize: none;
                min-height: unset;
                height: auto !important;
            }
            #tpm-win.minimized #tpm-titlebar {
                border-bottom: none;
            }
        `;
        document.head.appendChild(s);
    }

    function buildTerminal() {
        termEl = document.createElement('div');
        termEl.id = 'tpm-win';
        termEl.innerHTML = `
            <div id="tpm-titlebar">
                <div class="tpm-lights">
                    <div class="tpm-tl tpm-tl-red"    id="tpm-close"><span class="tpm-glyph">✕</span></div>
                    <div class="tpm-tl tpm-tl-yellow"  id="tpm-min"  ><span class="tpm-glyph">−</span></div>
                    <div class="tpm-tl tpm-tl-green"   id="tpm-max"  ><span class="tpm-glyph">+</span></div>
                </div>
                <span id="tpm-title">taplayma-helper — bash</span>
            </div>
            <div id="tpm-body"></div>
        `;
        document.body.appendChild(termEl);

        termEl.querySelector('#tpm-close').addEventListener('click', () => {
            termEl.remove(); termEl = null; winState = 'closed';
        });
        termEl.querySelector('#tpm-min').addEventListener('click', () => {
            termEl.classList.toggle('minimized');
            winState = termEl.classList.contains('minimized') ? 'minimized' : 'normal';
        });

        // drag
        const tb = termEl.querySelector('#tpm-titlebar');
        tb.addEventListener('mousedown', e => {
            if (e.target.classList.contains('tpm-tl')) return;
            isDragging = true;
            const r = termEl.getBoundingClientRect();
            dragOffX = e.clientX - r.left;
            dragOffY = e.clientY - r.top;
            termEl.style.transition = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const x = Math.max(0, Math.min(e.clientX - dragOffX, window.innerWidth  - termEl.offsetWidth));
            const y = Math.max(0, Math.min(e.clientY - dragOffY, window.innerHeight - termEl.offsetHeight));
            termEl.style.left      = x + 'px';
            termEl.style.top       = y + 'px';
            termEl.style.transform = 'none';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });
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
        if (termEl.classList.contains('minimized')) termEl.classList.remove('minimized');
        const body = termEl.querySelector('#tpm-body');
        const line = document.createElement('div');
        line.className = 'tpm-line';
        line.innerHTML = `<span class="tpm-ts">${ts()}</span><span class="tpm-prompt">$</span><span class="tpm-msg" style="color:${color}">${msg}</span>`;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;
    }

    const C = {
        info    : '#6fb3f7',
        success : '#30d158',
        warn    : '#ffd60a',
        error   : '#ff453a',
        purple  : '#bf5af2',
        orange  : '#ff9f0a',
        pink    : '#ff375f',
    };

    // =========================================================================
    // DASHBOARD SIDE
    // =========================================================================
    if (IS_DASHBOARD) {
        log('Dashboard detected');

        function tryPasteCode() {
            const savedCode = GM_getValue('tpm_code', '');
            if (!savedCode) return;

            const input     = document.querySelector('input[name="code"]');
            const submitBtn = document.querySelector('button[type="submit"]');
            if (!input || !submitBtn) return false;

            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, savedCode);
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            addLine(`✅ Đã nhập mã: ${savedCode} — đang xác nhận...`, C.success);
            GM_setValue('tpm_code', '');

            setTimeout(() => {
                submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                submitBtn.click();
            }, 800);
            return true;
        }

        setInterval(tryPasteCode, 1000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryPasteCode(); });
        window.addEventListener('focus', tryPasteCode);
        return;
    }

    // =========================================================================
    // EXTERNAL SITE
    // =========================================================================
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

    function findBalloonBtn() {
        for (const img of document.querySelectorAll('img'))
            if (img.src && img.src.includes(BALLOON_SRC)) {
                const btn = img.closest('button');
                if (btn) return btn;
            }
        return null;
    }

    function findWidgetDiv() {
        return document.querySelector('div[data-loading]') || null;
    }

    function findPinkBtn() {
        const div = findWidgetDiv();
        if (!div) return null;
        const btn = div.querySelector('button');
        if (!btn) return null;
        const bg = btn.style.background || btn.style.backgroundColor || '';
        return (bg.includes('244') && bg.includes('63') && bg.includes('143')) ? btn : null;
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
                addLine('👆 Confirm #1 clicked — waiting for timer...', C.purple);
                setTitle('taplayma-helper — waiting timer');
                humanClick(btn);
            }
            return;
        }

        if (state === 'WAITING_TIMER') {
            if ((elapsed - lastClickTime) > 4000) {
                const btn = findPinkBtn();
                if (btn) {
                    state = 'CLICKING_CONFIRM2';
                    addLine('⏰ Timer done! Confirm #2 appeared', C.orange);
                    setTitle('taplayma-helper — confirm #2');
                }
            }
            return;
        }

        if (state === 'CLICKING_CONFIRM2') {
            const btn = findPinkBtn();
            if (btn) {
                state = 'FINDING_CODE';
                lastClickTime = elapsed;
                addLine('👆 Confirm #2 clicked — reading code...', C.orange);
                setTitle('taplayma-helper — reading code');
                humanClick(btn);
            }
            return;
        }

        if (state === 'FINDING_CODE') {
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
