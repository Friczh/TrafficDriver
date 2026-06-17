// ==UserScript==
// @name         TapLayMa - UI Helper v5 (Final)
// @namespace    taplayma-helper
// @version      0.5
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

    function showToast(msg, color = '#222', duration = 3500) {
        const old = document.getElementById('tpm-toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = 'tpm-toast';
        toast.innerText = msg;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${color};
            color: #fff;
            padding: 12px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            pointer-events: none;
            opacity: 1;
            transition: opacity 0.5s;
            text-align: center;
            max-width: 85vw;
            white-space: pre-line;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, duration - 500);
        setTimeout(() => { toast.remove(); }, duration);
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

        // Poll until input is ready then paste
        let dashAttempts = 0;
        const dashPoll = setInterval(() => {
            dashAttempts++;
            if (dashAttempts > 20) {
                clearInterval(dashPoll);
                log('Dashboard paste timeout.');
                return;
            }
            const done = tryPasteCode();
            if (done) clearInterval(dashPoll);
        }, 600);

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

    // Code = short alphanumeric string inside or near widget div
    function findCode() {
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
