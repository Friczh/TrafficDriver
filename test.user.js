// ==UserScript==
// @name         TapLayMa - UI Helper v8
// @namespace    taplayma-helper
// @version      0.8
// @description  Full automation: balloon → confirm1 → timer → confirm2 → code → auto-paste dashboard
// @author       You
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

    function showToast(msg, color = '#222', duration) {
        ensureTerminal();
        addLogLine(msg, color);
    }

    // ─── macOS TERMINAL.APP STYLE WINDOW ────────────────────────────────────
    // States: 'normal' (full window open) | 'minimized' (taskbar pill only) | 'closed'
    let winState = 'closed';
    let termEl = null;
    let pillEl = null;

    function injectTerminalStyles() {
        if (document.getElementById('tpm-term-style')) return;
        const style = document.createElement('style');
        style.id = 'tpm-term-style';
        style.textContent = `
            #tpm-term {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 340px;
                height: 280px;
                background: rgba(30, 30, 30, 0.97);
                border-radius: 10px;
                box-shadow: 0 12px 40px rgba(0,0,0,0.55);
                font-family: -apple-system, "SF Mono", Menlo, Consolas, monospace;
                z-index: 999999;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                border: 1px solid rgba(255,255,255,0.08);
            }
            #tpm-term-titlebar {
                background: linear-gradient(#3a3a3a, #2b2b2b);
                padding: 8px 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid rgba(0,0,0,0.4);
                flex-shrink: 0;
                -webkit-user-select: none;
                user-select: none;
            }
            .tpm-traffic {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                display: inline-block;
                cursor: pointer;
                position: relative;
                border: 0.5px solid rgba(0,0,0,0.15);
            }
            .tpm-traffic.disabled {
                cursor: default;
                opacity: 0.45;
            }
            .tpm-red    { background: #ff5f56; }
            .tpm-yellow { background: #ffbd2e; }
            .tpm-green  { background: #27c93f; }
            #tpm-term-title {
                flex: 1;
                text-align: center;
                color: #c7c7c7;
                font-size: 12.5px;
                font-weight: 600;
                margin-right: 52px;
                pointer-events: none;
            }
            #tpm-term-body {
                padding: 10px 12px;
                overflow-y: auto;
                flex: 1;
                font-size: 12px;
                line-height: 1.55;
                color: #d4d4d4;
                background: rgba(0,0,0,0.15);
            }
            #tpm-term-body::-webkit-scrollbar { width: 6px; }
            #tpm-term-body::-webkit-scrollbar-thumb { background: #4a4a4a; border-radius: 3px; }
            .tpm-log-line {
                margin-bottom: 4px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .tpm-log-line::before {
                content: "$ ";
                color: #6b6b6b;
            }

            /* Minimized floating taskbar bar — top, centered, almost full width */
            #tpm-pill {
                position: fixed;
                top: 14px;
                left: 50%;
                transform: translateX(-50%);
                width: calc(100% - 32px);
                max-width: 480px;
                height: 36px;
                padding: 0 14px;
                border-radius: 10px;
                background: rgba(40,40,40,0.95);
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 6px 18px rgba(0,0,0,0.45);
                z-index: 999999;
                display: none;
                align-items: center;
                gap: 8px;
                font-family: -apple-system, sans-serif;
                box-sizing: border-box;
            }
            #tpm-pill .tpm-traffic { width: 11px; height: 11px; }
            #tpm-pill-label {
                flex: 1;
                text-align: center;
                color: #ccc;
                font-size: 12px;
                font-weight: 600;
                margin-right: 38px;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    function buildTerminal() {
        termEl = document.createElement('div');
        termEl.id = 'tpm-term';
        termEl.innerHTML = `
            <div id="tpm-term-titlebar">
                <span class="tpm-traffic tpm-red" id="tpm-btn-close" title="Close"></span>
                <span class="tpm-traffic tpm-yellow" id="tpm-btn-min" title="Minimize"></span>
                <span class="tpm-traffic tpm-green disabled" id="tpm-btn-max" title="Maximize"></span>
                <span id="tpm-term-title">taplayma-helper — bash</span>
            </div>
            <div id="tpm-term-body"></div>
        `;
        document.body.appendChild(termEl);

        pillEl = document.createElement('div');
        pillEl.id = 'tpm-pill';
        pillEl.innerHTML = `
            <span class="tpm-traffic tpm-red" id="tpm-pill-close" title="Close"></span>
            <span class="tpm-traffic tpm-yellow disabled" id="tpm-pill-min" title="Minimize"></span>
            <span class="tpm-traffic tpm-green" id="tpm-pill-max" title="Maximize"></span>
            <span id="tpm-pill-label">TapLayMa</span>
        `;
        document.body.appendChild(pillEl);

        // ── Normal window buttons ──
        // Close: works in normal state
        termEl.querySelector('#tpm-btn-close').addEventListener('click', () => doClose());
        // Minimize: only works when in normal state (it always is, when this btn is visible/active)
        termEl.querySelector('#tpm-btn-min').addEventListener('click', () => doMinimize());
        // Maximize: disabled while already normal — no-op

        // ── Pill (minimized) buttons ──
        pillEl.querySelector('#tpm-pill-close').addEventListener('click', () => doClose());
        // Maximize: only works when minimized (it always is, when pill is visible)
        pillEl.querySelector('#tpm-pill-max').addEventListener('click', () => doMaximize());
        // Minimize: disabled while already minimized — no-op
    }

    function doClose() {
        if (termEl) termEl.remove();
        if (pillEl) pillEl.remove();
        termEl = null;
        pillEl = null;
        winState = 'closed';
    }

    function doMinimize() {
        if (winState !== 'normal') return; // guard: can't minimize unless currently open
        termEl.style.display = 'none';
        pillEl.style.display = 'flex';
        winState = 'minimized';
    }

    function doMaximize() {
        if (winState !== 'minimized') return; // guard: can't maximize unless currently minimized
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
        // If minimized, leave it minimized — new logs still get added to body underneath
    }

    function addLogLine(msg, color = '#d4d4d4') {
        if (!termEl) return;
        const body = termEl.querySelector('#tpm-term-body');
        const line = document.createElement('div');
        line.className = 'tpm-log-line';
        line.style.color = color;
        line.textContent = msg;
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

            const input = document.querySelector('input[name="code"]');
            const submitBtn = document.querySelector('button[type="submit"]');

            if (!input || !submitBtn) {
                log('Input or button not found yet, retrying...');
                return false;
            }

            // Vue.js requires native input setter to trigger reactivity
            const nativeInputSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeInputSetter.call(input, savedCode);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            log(`✅ Pasted code: ${savedCode}`);
            showToast(`✅ Đã nhập mã: ${savedCode}\nĐang xác nhận...`, '#16a34a', 4000);

            // Clear saved code
            GM_setValue('tpm_code', '');

            // Click submit after short delay
            setTimeout(() => {
                submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                submitBtn.click();
                log('🚀 Submitted!');
            }, 800);

            return true;
        }

        // Poll until input is ready AND a code is available, then paste.
        // Runs indefinitely (no timeout) since the user may switch tabs
        // back and forth before the code is ready — no refresh needed.
        const dashPoll = setInterval(() => {
            tryPasteCode();
        }, 1000);

        // Re-check immediately whenever this tab becomes visible again
        // (covers the case where code was saved while this tab was in background)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                log('👀 Tab became visible — checking for new code...');
                tryPasteCode();
            }
        });

        // Also check on window focus (extra safety net for some mobile browsers)
        window.addEventListener('focus', () => {
            log('🎯 Window focused — checking for new code...');
            tryPasteCode();
        });

        return; // Stop here for dashboard
    }

    // =========================================================================
    // EXTERNAL SITE — find widget, run full flow
    // =========================================================================
    if (!IS_EXTERNAL) return; // Only run on non-taplayma domains

    // Check if this page even has the taplayma widget script
    function hasWidget() {
        const scripts = document.querySelectorAll('script[src]');
        for (const s of scripts) {
            if (s.src && s.src.includes('taplayma.com')) return true;
        }
        return false;
    }

    if (!hasWidget()) {
        log('No taplayma widget on this page. Exiting.');
        return;
    }

    log('🎯 Taplayma widget detected on external site');

    // States: SEARCHING_BALLOON → CLICKING_CONFIRM1 → WAITING_TIMER → CLICKING_CONFIRM2 → FINDING_CODE → DONE
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

    // Pink confirm button = rgb(244, 63, 143) background inside widget div
    function findPinkConfirmBtn() {
        const div = findWidgetDiv();
        if (!div) return null;
        const btn = div.querySelector('button');
        if (!btn) return null;
        const bg = btn.style.background || btn.style.backgroundColor || '';
        if (bg.includes('244') && bg.includes('63') && bg.includes('143')) return btn;
        return null;
    }

    // Check if widget is currently in a loading state (brief flash after confirm2 click)
    function isWidgetLoading() {
        const div = findWidgetDiv();
        if (!div) return false;
        return div.getAttribute('data-loading') === 'true';
    }

    // Code = short alphanumeric string inside or near widget div
    // Only valid once data-loading has settled back to "false"
    function findCode() {
        if (isWidgetLoading()) return null; // still loading, don't read yet

        const div = findWidgetDiv();
        if (!div) return null;

        // Check all text nodes inside widget area
        const candidates = div.querySelectorAll('*');
        for (const el of candidates) {
            // Skip elements with children (want leaf text nodes)
            if (el.children.length > 0) continue;
            const text = (el.innerText || el.textContent || '').trim();
            if (/^[A-Z0-9]{5,15}$/i.test(text)) return text;
        }

        // Fallback: check whole widget text
        const widgetText = div.innerText || '';
        const match = widgetText.match(/\b([A-Z0-9]{5,15})\b/i);
        if (match) return match[1];

        return null;
    }

    // ─── MAIN POLL LOOP ───────────────────────────────────────────────────────
    const poll = setInterval(() => {
        elapsed += POLL_MS;

        if (elapsed > MAX_WAIT_MS) {
            clearInterval(poll);
            showToast('⏱️ Timeout', '#dc2626');
            return;
        }

        // PHASE 1: Find & click balloon
        if (state === 'SEARCHING_BALLOON') {
            const btn = findBalloonBtn();
            if (btn) {
                state = 'CLICKING_CONFIRM1';
                log('🎈 Balloon → clicking');
                showToast('🎈 Đã nhấn balloon!', '#e91e8c');
                humanClick(btn);
            }
            return;
        }

        // PHASE 2: Click first pink confirm (starts timer)
        if (state === 'CLICKING_CONFIRM1') {
            const btn = findPinkConfirmBtn();
            if (btn) {
                state = 'WAITING_TIMER';
                lastConfirmClickTime = elapsed;
                log('👆 Confirm #1 → clicking (timer starts)');
                showToast('👆 Xác nhận #1!\nĐang đếm giờ...', '#7c3aed');
                humanClick(btn);
            }
            return;
        }

        // PHASE 3: Wait for timer → pink button appears again
        if (state === 'WAITING_TIMER') {
            const cooldown = (elapsed - lastConfirmClickTime) > 4000;
            if (cooldown) {
                const btn = findPinkConfirmBtn();
                if (btn) {
                    state = 'CLICKING_CONFIRM2';
                    log('⏰ Timer done — confirm #2 appeared');
                    showToast('⏰ Timer xong!\nXác nhận lần 2...', '#f97316');
                }
            }
            return;
        }

        // PHASE 4: Click second pink confirm → code appears
        if (state === 'CLICKING_CONFIRM2') {
            const btn = findPinkConfirmBtn();
            if (btn) {
                state = 'FINDING_CODE';
                lastConfirmClickTime = elapsed;
                log('👆 Confirm #2 → clicking');
                humanClick(btn);
            }
            return;
        }

        // PHASE 5: Find code immediately after confirm #2
        if (state === 'FINDING_CODE') {
            // Small grace period for DOM to update after click
            if ((elapsed - lastConfirmClickTime) < 1200) return;

            if (isWidgetLoading()) {
                log('⏳ Widget still loading code...');
                return;
            }

            const code = findCode();
            if (code) {
                state = 'DONE';
                clearInterval(poll);
                log(`🎉 Code found: ${code}`);

                // Save code for dashboard
                GM_setValue('tpm_code', code);

                // Copy to clipboard — GM_setClipboard bypasses browser user-gesture
                // restrictions that block navigator.clipboard on mobile
                let clipboardOk = false;
                try {
                    GM_setClipboard(code, 'text');
                    clipboardOk = true;
                    log('📋 GM_setClipboard succeeded');
                } catch (e) {
                    log(`⚠️ GM_setClipboard failed: ${e.message}`);
                }

                if (clipboardOk) {
                    showToast(`✅ Mã: ${code}\n(đã copy vào clipboard!)`, '#16a34a', 6000);
                } else {
                    showToast(`✅ Mã: ${code}\n⚠️ Copy thủ công (auto-copy lỗi)`, '#ea580c', 8000);
                }
                log('💾 Code saved. Go back to taplayma.com dashboard — it will auto-paste!');
            } else {
                log('🔎 Waiting for code...');
            }
            return;
        }

    }, POLL_MS);

})();
