// ==UserScript==
// @name         Layma Helper
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Automates layma.net traffic tasks
// @author       user
// @match        https://layma.net/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── Constants ───────────────────────────────────────────────────────────────
    const STORAGE_CODE_KEY = 'layma_pending_code';
    const LOG_PREFIX = '[LaymaHelper]';

    // ─── Utilities ───────────────────────────────────────────────────────────────
    const log = (msg) => console.log(`${LOG_PREFIX} ${msg}`);

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const waitFor = (selectorOrFn, timeout = 20000, interval = 300) => new Promise((resolve, reject) => {
        const check = typeof selectorOrFn === 'function'
            ? selectorOrFn
            : () => document.querySelector(selectorOrFn);
        const found = check();
        if (found) return resolve(found);
        const timer = setInterval(() => {
            const el = check();
            if (el) { clearInterval(timer); clearTimeout(killer); resolve(el); }
        }, interval);
        const killer = setTimeout(() => { clearInterval(timer); reject(new Error(`Timeout: ${selectorOrFn}`)); }, timeout);
    });

    const humanClick = (el) => {
        ['mousedown', 'mouseup', 'click'].forEach(type =>
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
        );
    };

    const triggerTouch = () => {
        const evt = ('ontouchstart' in document.documentElement)
            ? new TouchEvent('touchstart', { bubbles: true, cancelable: true })
            : new MouseEvent('click', { bubbles: true, cancelable: true });
        window.dispatchEvent(evt);
    };

    // ─── Traffic key extraction ───────────────────────────────────────────────────
    const getTrafficKey = () => {
        const m = location.pathname.match(/\/Traffic\/Index\/([^/?#]+)/i);
        return m ? m[1] : null;
    };

    // ─── Task type detection ──────────────────────────────────────────────────────
    const getTaskType = (text) => {
        if (!text) return null;
        const t = text.trim();
        if (t.includes('facebook.com')) return 'facebook';
        if (/^https?:\/\//i.test(t)) return null; // full URL that's not facebook — unexpected, ignore
        // bare domain: letters/numbers/hyphens, a dot, TLD, no spaces
        if (/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(t)) return 'direct';
        return 'google'; // plain text/phrase
    };

    // ─── Fake visibility (prevent traffic_blurred from pausing timer) ─────────────
    const applyVisibilityFake = () => {
        try {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            ['mozHidden', 'webkitHidden', 'msHidden'].forEach(k => {
                try { Object.defineProperty(document, k, { get: () => false, configurable: true }); } catch (_) {}
            });
        } catch (_) {}
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('pageshow'));
    };

    const patchTrafficBlurred = () => {
        try { if (window.traffic_blurred === true) window.traffic_blurred = false; } catch (_) {}
    };

    // ════════════════════════════════════════════════════════════════════════════
    // DASHBOARD SIDE — layma.net
    // ════════════════════════════════════════════════════════════════════════════
    const runDashboard = async () => {
        log('Dashboard mode');

        // Paste pending code if one was saved by external site
        const pendingCode = GM_getValue(STORAGE_CODE_KEY, null);
        if (pendingCode) {
            log(`Pending code found: ${pendingCode}`);
            GM_deleteValue(STORAGE_CODE_KEY);
            try {
                const input = await waitFor('#codeInput', 8000);
                input.value = pendingCode;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                log('Code pasted. Waiting for user reCAPTCHA + confirm.');
            } catch (e) {
                log('Could not find #codeInput.');
            }
            return;
        }

        // Read task
        let linkEl;
        try {
            linkEl = await waitFor('#linkWeb', 12000);
        } catch (_) {
            log('No #linkWeb found.');
            return;
        }

        const raw = linkEl.innerText.trim();
        log(`Task text: "${raw}"`);

        const type = getTaskType(raw);
        log(`Task type: ${type}`);

        if (type !== 'direct') {
            log('Task ignored (facebook/google/unknown).');
            return;
        }

        const url = 'https://' + raw;
        log(`Opening: ${url}`);
        window.open(url, '_blank');
    };

    // ════════════════════════════════════════════════════════════════════════════
    // EXTERNAL SITE
    // ════════════════════════════════════════════════════════════════════════════
    const runExternalSite = async () => {
        const trafficKey = getTrafficKey();
        log(`External site mode. key=${trafficKey}`);

        // Apply visibility fake immediately and keep patching
        applyVisibilityFake();
        setInterval(applyVisibilityFake, 2000);
        setInterval(patchTrafficBlurred, 400);

        // Wait for LẤY MÃ button (div with id = trafficKey)
        log('Waiting for LẤY MÃ button...');
        let btn;
        try {
            btn = await waitFor(`#${trafficKey}`, 25000);
        } catch (_) {
            log('LẤY MÃ button not found within timeout.');
            return;
        }

        await sleep(800);
        log('Clicking LẤY MÃ...');
        humanClick(btn);

        // Start anti-AFK monitor
        monitorAntiAFK();
    };

    // ════════════════════════════════════════════════════════════════════════════
    // ANTI-AFK MONITOR
    // ════════════════════════════════════════════════════════════════════════════
    const monitorAntiAFK = () => {
        log('Anti-AFK monitor started.');

        // Track what we last responded to avoid duplicate triggers
        let lastHandled = '';
        let captchaPhase = false;
        let codeExtracted = false;

        const getMessage = () => document.querySelector('#message')?.innerText?.trim() ?? '';

        const isXacthucVisible = () => {
            const btn = document.querySelector('#xacthucButton');
            return btn && btn.style.display !== 'none';
        };

        const poll = setInterval(async () => {
            if (codeExtracted) { clearInterval(poll); return; }

            const msg = getMessage();

            // ── Phase: code already shown ──────────────────────────────────────
            if (msg.includes('Mã Code:')) {
                const match = msg.match(/Mã Code:\s*([A-Za-z0-9]+)/);
                if (match) {
                    const code = match[1].trim();
                    log(`Code extracted: ${code}`);
                    codeExtracted = true;
                    clearInterval(poll);
                    GM_setValue(STORAGE_CODE_KEY, code);
                    alert(`[LaymaHelper] Code: ${code}\n\nGo back to layma.net tab — it will be auto-pasted.`);
                }
                return;
            }

            // ── Phase: waiting for user to solve hCaptcha ──────────────────────
            // After user solves captcha, xacthucButton should still be visible.
            // We click it to retrieve the code.
            if (captchaPhase) {
                // hCaptcha sets a response token when solved — check for it
                const hcaptchaResponse = document.querySelector('[name="h-captcha-response"]');
                const solved = hcaptchaResponse && hcaptchaResponse.value && hcaptchaResponse.value.length > 0;
                if (solved && isXacthucVisible()) {
                    log('hCaptcha solved. Clicking xacthucButton to get code...');
                    captchaPhase = false;
                    await sleep(500);
                    humanClick(document.querySelector('#xacthucButton'));
                }
                return;
            }

            // ── Phase: countdown ended — xacthucButton auto-clicked by their script,
            //    hCaptcha modal now open. Switch to captcha phase. ───────────────
            if (isXacthucVisible() && msg === '') {
                if (lastHandled !== 'captchaWait') {
                    log('CAPTCHA modal detected. Waiting for user to solve hCaptcha...');
                    lastHandled = 'captchaWait';
                    captchaPhase = true;
                }
                return;
            }

            // ── Anti-AFK: scroll up ────────────────────────────────────────────
            if (msg.includes('cuộn lên') && lastHandled !== 'scrollUp') {
                log('Action: scroll up');
                lastHandled = 'scrollUp';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            // ── Anti-AFK: scroll down ──────────────────────────────────────────
            if (msg.includes('cuộn xuống') && lastHandled !== 'scrollDown') {
                log('Action: scroll down');
                lastHandled = 'scrollDown';
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                return;
            }

            // ── Anti-AFK: tap screen ───────────────────────────────────────────
            if (msg.includes('Chạm vào màn hình') && lastHandled !== 'tap') {
                log('Action: tap screen');
                lastHandled = 'tap';
                triggerTouch();
                return;
            }

            // ── Anti-AFK: click article ────────────────────────────────────────
            if (msg.includes('nhấn bài viết') && lastHandled !== 'article') {
                log('Action: click random article');
                lastHandled = 'article';
                await sleep(400);
                clickRandomArticle();
                return;
            }

            // Reset lastHandled when message changes to something unrelated
            if (msg && lastHandled) {
                const stillSame =
                    (lastHandled === 'scrollUp' && msg.includes('cuộn lên')) ||
                    (lastHandled === 'scrollDown' && msg.includes('cuộn xuống')) ||
                    (lastHandled === 'tap' && msg.includes('Chạm vào màn hình')) ||
                    (lastHandled === 'article' && msg.includes('nhấn bài viết')) ||
                    (lastHandled === 'captchaWait');
                if (!stillSame) lastHandled = '';
            }

        }, 600);
    };

    // ─── Click a random same-domain article link ──────────────────────────────────
    const clickRandomArticle = () => {
        const host = location.hostname;
        const candidates = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            try {
                const url = new URL(a.href);
                return (
                    url.hostname === host &&
                    url.href !== location.href &&
                    !a.href.startsWith('javascript:') &&
                    !a.href.includes('#') &&
                    !a.href.includes('layma.net') &&
                    !a.href.includes('api.layma')
                );
            } catch (_) { return false; }
        });

        if (!candidates.length) {
            log('No article candidates found.');
            return;
        }

        const target = candidates[Math.floor(Math.random() * candidates.length)];
        log(`Clicking article: ${target.href}`);
        humanClick(target);
    };

    // ════════════════════════════════════════════════════════════════════════════
    // ROUTER
    // ════════════════════════════════════════════════════════════════════════════
    const init = () => {
        const host = location.hostname.replace(/^www\./, '');

        if (host === 'layma.net') {
            runDashboard();
            return;
        }

        if (getTrafficKey()) {
            runExternalSite();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
