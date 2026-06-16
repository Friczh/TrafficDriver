// ==UserScript==
// @name         Layma Assistant 🤖
// @namespace    http://tampermonkey.net/
// @version      v0.5.0
// @description  Automates monetized traffic links
// @author       Friczh
// @match        https://layma.net/*
// @match        http://layma.net/*
// @match        https://*/*
// @match        http://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // CONSTANTS
    // ============================================================
    const LAYMA_API_DOMAIN = 'api.layma.net';
    const LAYMA_DOMAIN = 'layma.net';
    const STORAGE_KEY_CODE = '__layma_assistant_code__';
    const STORAGE_KEY_ORIGIN = '__layma_assistant_origin__';

    // ============================================================
    // UTILITIES
    // ============================================================

    const isLaymaPage = () => window.location.hostname.includes(LAYMA_DOMAIN);

    // Known WordPress/theme IDs to exclude from traffic_key detection
    const KNOWN_PAGE_IDS = new Set([
        'wrapper','header','top-bar','masthead','logo','main','content',
        'footer','sidebar','main-menu','wide-nav','top-link','readMoreBtn',
        's','tyle-iframe','showHideReadMore'
    ]);

    /**
     * Find the Layma injected container div
     * The traffic_key becomes the div ID e.g. #HOsQs8ehN
     * It's a short random alphanumeric string that doesn't match
     * any known WordPress/theme element ID
     */
    const findLaymaContainer = () => {
        const allDivs = document.querySelectorAll('div[id]');
        for (const div of allDivs) {
            const id = div.id;
            if (
                /^[A-Za-z0-9]{6,14}$/.test(id) &&
                !KNOWN_PAGE_IDS.has(id) &&
                !id.startsWith('custom_') &&
                !id.startsWith('custom-') &&
                !id.startsWith('menu-') &&
                !id.startsWith('text-') &&
                !id.startsWith('attachment') &&
                !id.startsWith('caption') &&
                !id.includes('css') &&
                !id.includes('js') &&
                !id.includes('flatsome') &&
                !id.includes('jquery') &&
                !id.includes('wp-')
            ) {
                log('Found Layma container: #' + id);
                return div;
            }
        }
        return null;
    };

    const isExternalTaskPage = () => {
        return !isLaymaPage() &&
            !!document.querySelector('script[src*="layma.net/Traffic/Index"]');
    };

    const log = (msg) => console.log(`[Layma Assistant] ${msg}`);

    // ============================================================
    // HUD - Floating helper UI injected on external pages
    // ============================================================

    let hud = null;
    let hudMinimized = false;

    function createHUD() {
        if (hud) return;

        const style = document.createElement('style');
        style.innerHTML = `
            * { box-sizing: border-box; }

            #__layma_hud__ {
                position: fixed;
                top: 0; left: 0; right: 0;
                z-index: 2147483647;
                font-family: 'Courier New', Courier, monospace;
                animation: __lma_drop__ 0.35s cubic-bezier(.22,1,.36,1);
                /* CRITICAL: pass all pointer events through to page underneath
                   so Layma never thinks the user left the page 👻 */
                pointer-events: none;
            }
            @keyframes __lma_drop__ {
                from { transform: translateY(-100%); opacity: 0; }
                to   { transform: translateY(0);     opacity: 1; }
            }

            /* ── Main bar — pointer-events none except buttons ── */
            #__layma_bar__ {
                display: flex;
                align-items: center;
                gap: 8px;
                height: 36px;
                padding: 0 10px;
                background: #0a0a0a;
                border-bottom: 1.5px solid #0bf405;
                box-shadow: 0 0 12px rgba(11,244,5,0.25);
                overflow: hidden;
                transition: height 0.25s ease, border-color 0.3s;
                pointer-events: none;
            }
            #__layma_bar__.code-found {
                border-color: #0bf405;
                box-shadow: 0 0 20px rgba(11,244,5,0.5);
                animation: __lma_pulse__ 1.2s ease infinite;
            }
            @keyframes __lma_pulse__ {
                0%,100% { box-shadow: 0 0 12px rgba(11,244,5,0.3); }
                50%      { box-shadow: 0 0 28px rgba(11,244,5,0.7); }
            }

            /* ── Minimized state ── */
            #__layma_hud__.minimized #__layma_bar__ {
                height: 0;
                border-bottom-width: 0;
                padding: 0;
            }
            #__layma_tab__ {
                display: none;
                position: fixed;
                top: 0; left: 50%;
                transform: translateX(-50%);
                z-index: 2147483647;
                background: #0a0a0a;
                border: 1.5px solid #0bf405;
                border-top: none;
                border-radius: 0 0 8px 8px;
                padding: 2px 14px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                color: #0bf405;
                letter-spacing: 1px;
                box-shadow: 0 4px 12px rgba(11,244,5,0.2);
                pointer-events: all; /* tab IS clickable */
            }
            #__layma_hud__.minimized #__layma_tab__ { display: block; }

            /* ── Label ── */
            #__layma_label__ {
                display: flex;
                align-items: center;
                gap: 5px;
                color: #0bf405;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1.5px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            #__layma_label__ .dot {
                width: 7px; height: 7px;
                background: #0bf405;
                border-radius: 50%;
                box-shadow: 0 0 6px #0bf405;
                animation: __lma_blink__ 2s ease infinite;
            }
            @keyframes __lma_blink__ {
                0%,100% { opacity: 1; }
                50%      { opacity: 0.3; }
            }

            .lma-sep {
                color: #333;
                font-size: 14px;
                flex-shrink: 0;
                user-select: none;
            }

            #__layma_hud_timer__ {
                color: #f0c040;
                font-size: 12px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                white-space: nowrap;
                flex-shrink: 0;
                min-width: 52px;
            }

            #__layma_hud_status__ {
                color: #aaa;
                font-size: 11px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex: 1;
            }

            #__layma_hud_code__ {
                display: none;
                background: rgba(11,244,5,0.12);
                border: 1px solid #0bf405;
                border-radius: 4px;
                padding: 1px 8px;
                color: #0bf405;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 2px;
                white-space: nowrap;
                flex-shrink: 0;
            }

            /* Buttons ARE pointer-events: all so they're tappable */
            #__layma_hud_copy__, #__layma_hud_min__ {
                pointer-events: all;
            }

            #__layma_hud_copy__ {
                display: none;
                background: #0bf405;
                color: #000;
                border: none;
                border-radius: 4px;
                padding: 3px 10px;
                font-size: 11px;
                font-weight: 700;
                font-family: 'Courier New', monospace;
                cursor: pointer;
                white-space: nowrap;
                flex-shrink: 0;
                transition: background 0.15s, transform 0.1s;
                letter-spacing: 0.5px;
            }
            #__layma_hud_copy__:active { transform: scale(0.95); background: #08c804; }

            #__layma_hud_min__ {
                background: none;
                border: 1px solid #333;
                border-radius: 3px;
                color: #555;
                font-size: 11px;
                width: 20px; height: 20px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                flex-shrink: 0;
                transition: border-color 0.2s, color 0.2s;
                line-height: 1;
                padding: 0;
                font-family: monospace;
            }
            #__layma_hud_min__:active { border-color: #0bf405; color: #0bf405; }
        `;
        document.head.appendChild(style);

        hud = document.createElement('div');
        hud.id = '__layma_hud__';
        hud.innerHTML = `
            <div id="__layma_bar__">
                <div id="__layma_label__">
                    <span class="dot"></span>
                    LAYMA
                </div>
                <span class="lma-sep">›</span>
                <div id="__layma_hud_timer__"></div>
                <span class="lma-sep">|</span>
                <div id="__layma_hud_status__">Initializing...</div>
                <div id="__layma_hud_code__"></div>
                <button id="__layma_hud_copy__">📋 COPY</button>
                <button id="__layma_hud_min__" title="Minimize">_</button>
            </div>
            <div id="__layma_tab__" title="Restore Layma Assistant">▲ LAYMA</div>
        `;

        document.body.appendChild(hud);

        // Minimize / restore toggle
        document.getElementById('__layma_hud_min__').addEventListener('click', () => {
            hudMinimized = true;
            hud.classList.add('minimized');
        });
        document.getElementById('__layma_tab__').addEventListener('click', () => {
            hudMinimized = false;
            hud.classList.remove('minimized');
        });

        // Copy button
        document.getElementById('__layma_hud_copy__').addEventListener('click', () => {
            const code = document.getElementById('__layma_hud_code__').textContent.trim();
            if (code) {
                GM_setClipboard(code);
                GM_setValue(STORAGE_KEY_CODE, code);
                GM_setValue(STORAGE_KEY_ORIGIN, window.location.href);
                setHUDStatus('✅ Copied! Go back to Layma.net');
                document.getElementById('__layma_hud_copy__').textContent = '✅ DONE';
            }
        });

        log('HUD created (terminal bar)');
    }

    function setHUDStatus(msg) {
        const el = document.getElementById('__layma_hud_status__');
        if (el) el.textContent = msg;
    }

    function setHUDTimer(seconds) {
        const el = document.getElementById('__layma_hud_timer__');
        if (!el) return;
        el.textContent = seconds > 0 ? `⏱ ${seconds}s` : '';
    }

    // hint is now just part of status in the slim bar
    function setHUDHint(msg) { setHUDStatus(msg); }

    function showHUDCode(code) {
        const codeEl  = document.getElementById('__layma_hud_code__');
        const copyBtn = document.getElementById('__layma_hud_copy__');
        const bar     = document.getElementById('__layma_bar__');
        if (codeEl)  { codeEl.textContent = code; codeEl.style.display = 'block'; }
        if (copyBtn) copyBtn.style.display = 'block';
        if (bar)     bar.classList.add('code-found');
        setHUDTimer(0);
        setHUDStatus('🎉 Code ready!');
        // Auto-restore if minimized so user sees the code
        if (hudMinimized) {
            hudMinimized = false;
            hud.classList.remove('minimized');
        }
        GM_notification({ title: '🤖 Layma Assistant', text: `Mã: ${code}`, timeout: 5000 });
    }

    // ============================================================
    // OBSERVER - Watch for code appearing in trackingMessageContainer
    // ============================================================

    function watchForCode() {
        const observer = new MutationObserver(() => {
            // The code appears inside the trackingMessageContainer div
            // which Layma injects dynamically. It contains "Mã Code: XXXX"
            const msgEl = document.getElementById('message');
            if (msgEl) {
                const text = msgEl.textContent || msgEl.innerText || '';
                // Layma uses "Mã Code" as the prefix for the code line
                if (text.includes('Mã Code') || text.includes('Mã code')) {
                    // Extract the actual code - comes after "Mã Code: "
                    const match = text.match(/Mã [Cc]ode[:\s]+([A-Za-z0-9]+)/);
                    if (match && match[1]) {
                        const code = match[1].trim();
                        log('Code detected: ' + code);
                        showHUDCode(code);
                        observer.disconnect();
                    }
                }
            }

            // Also watch the xacthucButton visibility as a trigger
            // When it appears, remind user to solve hCaptcha
            const xacthucBtn = document.getElementById('xacthucButton');
            if (xacthucBtn && xacthucBtn.style.display !== 'none') {
                setHUDStatus('🔐 Giải hCaptcha rồi bấm "Xác thực và lấy mã"');
                setHUDHint('Script sẽ tự copy mã sau khi xuất hiện!');
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // ============================================================
    // HUMAN SIMULATION ENGINE 🧠
    // Think of this like a robot that learned how to act human
    // by watching too many people browse the internet 😄
    // ============================================================

    // Random number between min and max (inclusive)
    const randBetween = (min, max) => Math.random() * (max - min) + min;

    // Random delay — like a human pausing to read something
    const humanDelay = (minMs, maxMs) =>
        new Promise(res => setTimeout(res, randBetween(minMs, maxMs)));

    /**
     * Smooth scroll to a target Y position — like a human dragging their finger
     * Not an instant teleport (robots do that), but a natural glide 🏄
     */
    function smoothScrollTo(targetY, durationMs) {
        return new Promise(res => {
            const startY = window.scrollY;
            const distance = targetY - startY;
            const startTime = performance.now();

            // Ease in-out curve — slow start, fast middle, slow end
            // Just like how YOU scroll: hesitate → swipe → land
            const easeInOut = t => t < 0.5
                ? 2 * t * t
                : -1 + (4 - 2 * t) * t;

            const step = (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / durationMs, 1);
                const easedProgress = easeInOut(progress);

                window.scrollTo(0, startY + distance * easedProgress);

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    res();
                }
            };

            requestAnimationFrame(step);
        });
    }

    /**
     * Simulate a human scrolling UP to the top of the page
     * - Random speed (some people scroll fast, some slow)
     * - Small overshoot then correct (very human 😄)
     */
    async function humanScrollToTop() {
        setHUDStatus('⬆️ Auto-scrolling to top...');
        setHUDHint('Simulating human scroll ↑');

        await humanDelay(300, 800); // think before acting

        const duration = randBetween(600, 1400); // random scroll speed
        await smoothScrollTo(0, duration);

        // Tiny overshoot correction — humans always do this lol
        await humanDelay(100, 300);
        await smoothScrollTo(randBetween(0, 5), 150);

        log('Scrolled to top');
        setHUDStatus('✅ Scrolled to top!');
    }

    /**
     * Simulate a human scrolling DOWN to the bottom
     * - Randomized speed
     * - Slight pause mid-scroll (like reading something)
     */
    async function humanScrollToBottom() {
        setHUDStatus('⬇️ Auto-scrolling to bottom...');
        setHUDHint('Simulating human scroll ↓');

        await humanDelay(300, 800);

        const pageHeight = document.body.scrollHeight;
        const midPoint = pageHeight * randBetween(0.4, 0.6);

        // Scroll to middle first (human reads on the way down)
        await smoothScrollTo(midPoint, randBetween(500, 900));
        await humanDelay(200, 600); // pause mid-page

        // Then continue to bottom
        await smoothScrollTo(pageHeight, randBetween(400, 800));

        // Tiny bounce at the bottom — phones do this, feels natural
        await humanDelay(100, 200);
        await smoothScrollTo(pageHeight - randBetween(2, 8), 100);

        log('Scrolled to bottom');
        setHUDStatus('✅ Scrolled to bottom!');
    }

    /**
     * Simulate a human tapping/clicking the screen
     * - Random position (not always dead center — robots do that)
     * - Fires real pointer + mouse + click events so Layma's listener catches it
     */
    async function humanTouchScreen() {
        setHUDStatus('👆 Auto-tapping screen...');
        setHUDHint('Simulating human tap');

        await humanDelay(400, 1000); // reaction time delay

        // Pick a random spot in the middle-ish area of the viewport
        // Humans don't click corners or perfect center
        const x = window.innerWidth  * randBetween(0.25, 0.75);
        const y = window.innerHeight * randBetween(0.25, 0.75);

        const target = document.elementFromPoint(x, y) || document.body;

        // Fire the full chain of events Layma listens for
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
        };

        // touchstart (mobile detection)
        const touchObj = new Touch({
            identifier: Date.now(),
            target,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            pageX: x + window.scrollX,
            pageY: y + window.scrollY,
            radiusX: randBetween(10, 20), // finger size varies 😄
            radiusY: randBetween(10, 20),
            rotationAngle: 0,
            force: randBetween(0.5, 1.0),
        });

        try {
            target.dispatchEvent(new TouchEvent('touchstart', {
                bubbles: true, cancelable: true,
                touches: [touchObj],
                targetTouches: [touchObj],
                changedTouches: [touchObj],
            }));
            await humanDelay(50, 150); // finger press duration
            target.dispatchEvent(new TouchEvent('touchend', {
                bubbles: true, cancelable: true,
                touches: [],
                targetTouches: [],
                changedTouches: [touchObj],
            }));
        } catch(e) {
            // TouchEvent not supported (desktop) — fall back to mouse click
        }

        // Also fire mouse events (desktop fallback + extra coverage)
      
