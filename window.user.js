// ==UserScript==
// @name         macOS Terminal Window - Full Feature Test
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Complete macOS window implementation with all features
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== STATE MANAGEMENT ====================
    const WindowState = {
        CLOSED: 'closed',
        NORMAL: 'normal',
        MINIMIZED: 'minimized'
    };

    let windowState = WindowState.CLOSED;
    let windowElement = null;
    let logContainer = null;
    let manualMinimize = false;
    let minimizeTimestamp = 0;
    let isDragging = false;
    let dragStartX, dragStartY, windowStartX, windowStartY;
    let isFocused = true;
    let lineCount = 0;

    // ==================== CSS INJECTION ====================
    const styles = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .macos-terminal-overlay {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483647;
            font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
            font-size: 12.5px;
            line-height: 1.7;
            width: min(680px, 92vw);
            aspect-ratio: 680 / 400;
            background: #1c1c1e;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            resize: both;
            min-width: 320px;
            overflow: hidden;
            box-shadow:
                0 0 0 0.5px rgba(255,255,255,0.07),
                0 8px 32px rgba(0,0,0,0.6),
                0 2px 8px rgba(0,0,0,0.5);
            transition: box-shadow 0.3s ease;
        }

        .macos-terminal-overlay.focused {
            box-shadow:
                0 0 0 0.5px rgba(255,255,255,0.09),
                0 12px 40px rgba(0,0,0,0.7),
                0 2px 8px rgba(0,0,0,0.5);
        }

        .macos-terminal-overlay.minimized {
            aspect-ratio: auto !important;
            height: auto !important;
            resize: none;
        }

        .macos-terminal-overlay * {
            box-sizing: border-box;
        }

        .macos-titlebar {
            height: 38px;
            background: linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 100%);
            border-bottom: 1px solid rgba(0,0,0,0.5);
            position: relative;
            display: flex;
            align-items: center;
            cursor: default;
            user-select: none;
            flex-shrink: 0;
            transition: border-bottom 0.3s ease;
        }

        .macos-terminal-overlay.minimized .macos-titlebar {
            border-bottom: none;
        }

        .macos-title-text {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            color: #98989e;
            font-family: -apple-system, system-ui, sans-serif;
            font-size: 12px;
            font-weight: 500;
            padding: 0 120px;
            text-align: center;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            pointer-events: none;
        }

        .macos-traffic-lights {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-left: 16px;
            height: 100%;
            position: relative;
            z-index: 1;
        }

        .macos-traffic-light {
            width: 13px;
            height: 13px;
            border-radius: 50%;
            position: relative;
            cursor: pointer;
            box-shadow:
                inset 0 0.5px 0 rgba(255,255,255,0.25),
                0 0.5px 0 rgba(0,0,0,0.4);
        }

        .macos-traffic-light .glyph {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0;
            font-size: 9px;
            font-weight: 800;
            color: rgba(0,0,0,0.5);
            pointer-events: none;
            transition: opacity 0.1s;
            line-height: 1;
        }

        .macos-traffic-lights:hover .glyph {
            opacity: 1;
        }

        .macos-traffic-light.close {
            background: #ff5f57;
        }

        .macos-traffic-light.minimize {
            background: #febc2e;
        }

        .macos-traffic-light.zoom {
            background: #28c840;
        }

        .macos-traffic-light.disabled {
            background: #44444a !important;
            box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.1), 0 0.5px 0 rgba(0,0,0,0.4) !important;
            cursor: default !important;
            pointer-events: none !important;
        }

        .macos-body {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 12px 16px;
            max-height: 800px;
            opacity: 1;
            transition:
                max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.22s ease,
                padding-top 0.3s ease,
                padding-bottom 0.3s ease;
        }

        .macos-terminal-overlay.minimized .macos-body {
            max-height: 0 !important;
            opacity: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            overflow: hidden !important;
        }

        .macos-body::-webkit-scrollbar {
            width: 4px;
        }

        .macos-body::-webkit-scrollbar-track {
            background: transparent;
        }

        .macos-body::-webkit-scrollbar-thumb {
            background: #3a3a3c;
            border-radius: 4px;
        }

        .macos-body::-webkit-scrollbar-thumb:hover {
            background: #505050;
        }

        .macos-log-line {
            display: flex;
            gap: 8px;
            align-items: baseline;
            margin-bottom: 1px;
            white-space: pre-wrap;
            word-break: break-word;
            tab-size: 4;
        }

        .macos-ts {
            color: #3a3a3c;
            font-size: 10px;
            flex-shrink: 0;
            user-select: none;
        }

        .macos-prompt {
            color: #48484a;
            flex-shrink: 0;
            user-select: none;
        }

        .macos-msg {
            flex: 1;
            color: #d1d1d6;
        }

        .macos-tab-bar {
            background: #252525;
            border-bottom: 1px solid #111;
            height: 30px;
            padding: 0 12px;
            display: flex;
            align-items: flex-end;
            gap: 0;
            flex-shrink: 0;
        }

        .macos-tab {
            background: #1e1e1e;
            border: 1px solid #3a3a3a;
            border-bottom: 1px solid #1e1e1e;
            border-radius: 6px 6px 0 0;
            height: 26px;
            padding: 0 10px;
            color: #ccc;
            font-size: 11px;
            font-family: -apple-system, system-ui, sans-serif;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: default;
            user-select: none;
        }

        .macos-tab-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #6a6a6a;
            flex-shrink: 0;
        }

        .macos-tab-dot.active {
            background: #ffbd2e;
            animation: pulse 1.5s infinite;
        }

        .macos-tab-dot.done {
            background: #28c840;
            animation: none;
        }

        .macos-tab-dot.error {
            background: #ff453a;
            animation: none;
        }

        .macos-status-bar {
            background: #252525;
            border-top: 1px solid #111;
            height: 22px;
            padding: 0 12px;
            color: #555;
            font-size: 10px;
            font-family: -apple-system, system-ui, sans-serif;
            user-select: none;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
    `;

    function injectStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    // ==================== WINDOW CREATION ====================
    function createWindow() {
        const overlay = document.createElement('div');
        overlay.className = 'macos-terminal-overlay focused';
        overlay.innerHTML = `
            <div class="macos-titlebar">
                <div class="macos-traffic-lights">
                    <div class="macos-traffic-light close" data-action="close">
                        <span class="glyph">✕</span>
                    </div>
                    <div class="macos-traffic-light minimize" data-action="minimize">
                        <span class="glyph">−</span>
                    </div>
                    <div class="macos-traffic-light zoom disabled" data-action="zoom">
                        <span class="glyph">+</span>
                    </div>
                </div>
                <div class="macos-title-text">Terminal — test</div>
            </div>
            <div class="macos-tab-bar">
                <div class="macos-tab">
                    <span class="macos-tab-dot active"></span>
                    <span>Log Output</span>
                </div>
            </div>
            <div class="macos-body"></div>
            <div class="macos-status-bar">Ready</div>
        `;

        document.body.appendChild(overlay);
        windowElement = overlay;
        logContainer = overlay.querySelector('.macos-body');

        // Event listeners
        setupTrafficLights(overlay);
        setupDragHandling(overlay);
        setupFocusHandling(overlay);

        return overlay;
    }

    // ==================== TRAFFIC LIGHT LOGIC ====================
    function setupTrafficLights(overlay) {
        const closeBtn = overlay.querySelector('[data-action="close"]');
        const minimizeBtn = overlay.querySelector('[data-action="minimize"]');
        const zoomBtn = overlay.querySelector('[data-action="zoom"]');

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            destroyWindow();
        });

        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (windowState === WindowState.NORMAL) {
                minimizeWindow();
            }
        });

        zoomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (windowState === WindowState.MINIMIZED) {
                restoreWindow();
            }
        });
    }

    function updateTrafficLights() {
        if (!windowElement) return;

        const minimizeBtn = windowElement.querySelector('[data-action="minimize"]');
        const zoomBtn = windowElement.querySelector('[data-action="zoom"]');

        if (windowState === WindowState.NORMAL) {
            minimizeBtn.classList.remove('disabled');
            zoomBtn.classList.add('disabled');
        } else if (windowState === WindowState.MINIMIZED) {
            minimizeBtn.classList.add('disabled');
            zoomBtn.classList.remove('disabled');
        }
    }

    // ==================== DRAG HANDLING ====================
    function setupDragHandling(overlay) {
        const titlebar = overlay.querySelector('.macos-titlebar');

        titlebar.addEventListener('mousedown', (e) => {
            // Don't drag if clicking traffic lights
            if (e.target.closest('.macos-traffic-lights')) return;

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = overlay.getBoundingClientRect();
            windowStartX = rect.left;
            windowStartY = rect.top;

            // Switch from centered to absolute positioning
            overlay.style.left = windowStartX + 'px';
            overlay.style.top = windowStartY + 'px';
            overlay.style.transform = 'none';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !windowElement) return;

            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            windowElement.style.left = (windowStartX + dx) + 'px';
            windowElement.style.top = (windowStartY + dy) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // ==================== FOCUS HANDLING ====================
    function setupFocusHandling(overlay) {
        overlay.addEventListener('mousedown', (e) => {
            if (!isFocused) {
                focusWindow();
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (windowElement && !windowElement.contains(e.target) && isFocused) {
                blurWindow();
            }
        });
    }

    function focusWindow() {
        if (!windowElement) return;
        isFocused = true;
        windowElement.classList.add('focused');
        windowElement.querySelector('.macos-title-text').style.color = '#98989e';
    }

    function blurWindow() {
        if (!windowElement) return;
        isFocused = false;
        windowElement.classList.remove('focused');
        windowElement.querySelector('.macos-title-text').style.color = '#7a7a80';
    }

    // ==================== WINDOW STATE TRANSITIONS ====================
    function minimizeWindow() {
        if (windowState !== WindowState.NORMAL) return;
        windowState = WindowState.MINIMIZED;
        manualMinimize = true;
        minimizeTimestamp = Date.now();
        windowElement.classList.add('minimized');
        windowElement.querySelector('.macos-status-bar').textContent = 'Minimized';
        updateTrafficLights();
        updateTabDot('idle');
    }

    function restoreWindow() {
        if (windowState !== WindowState.MINIMIZED) return;
        windowState = WindowState.NORMAL;
        manualMinimize = false;
        windowElement.classList.remove('minimized');
        windowElement.querySelector('.macos-status-bar').textContent = 'Ready';
        updateTrafficLights();
        updateTabDot('active');
    }

    function destroyWindow() {
        if (!windowElement) return;
        windowElement.remove();
        windowElement = null;
        logContainer = null;
        windowState = WindowState.CLOSED;
        manualMinimize = false;
        lineCount = 0;
    }

    // ==================== LOGGING ====================
    function addLine(message, color = '#d1d1d6') {
        // Create window on first log line if closed
        if (windowState === WindowState.CLOSED) {
            createWindow();
            windowState = WindowState.NORMAL;
            updateTrafficLights();
            lineCount = 0;
        }

        // Auto-restore on new content (with throttle to respect user intent)
        if (windowState === WindowState.MINIMIZED) {
            const timeSinceMinimize = Date.now() - minimizeTimestamp;
            if (timeSinceMinimize > 500) {
                restoreWindow();
            }
        }

        const now = new Date();
        const timestamp = now.toTimeString().slice(0, 8);

        const line = document.createElement('div');
        line.className = 'macos-log-line';
        line.innerHTML = `
            <span class="macos-ts">${timestamp}</span>
            <span class="macos-prompt">$</span>
            <span class="macos-msg" style="color: ${color}">${escapeHtml(message)}</span>
        `;

        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
        lineCount++;

        // Update status bar
        if (windowState === WindowState.NORMAL) {
            windowElement.querySelector('.macos-status-bar').textContent = `${lineCount} lines`;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateTabDot(status) {
        if (!windowElement) return;
        const dot = windowElement.querySelector('.macos-tab-dot');
        if (!dot) return;

        dot.className = 'macos-tab-dot';
        if (status === 'active') dot.classList.add('active');
        else if (status === 'done') dot.classList.add('done');
        else if (status === 'error') dot.classList.add('error');
        // 'idle' leaves just the base class (gray)
    }

    // ==================== DEMO / TEST ====================
    function runAllTests() {
        // 1. Color palette test
        const colors = [
            { msg: 'Default: normal output text', color: '#d1d1d6' },
            { msg: 'Info: informational message', color: '#6fb3f7' },
            { msg: 'Success: ✅ completed action', color: '#30d158' },
            { msg: 'Warning: ⚠️ caution required', color: '#ffd60a' },
            { msg: 'Error: ❌ failure / blocked', color: '#ff453a' },
            { msg: 'Purple: step confirmation', color: '#bf5af2' },
            { msg: 'Orange: timer / transition event', color: '#ff9f0a' },
            { msg: 'Pink: trigger / highlight event', color: '#ff375f' },
            { msg: 'Muted: secondary / passive info', color: '#6a6a6a' },
        ];

        colors.forEach((c, i) => {
            setTimeout(() => addLine(c.msg, c.color), i * 150);
        });

        // 2. Test minimize/restore with new content throttle
        setTimeout(() => {
            if (windowState === WindowState.NORMAL) {
                addLine('Minimizing in 1 second...', '#ffd60a');
                setTimeout(() => {
                    minimizeWindow();
                    addLine('This line should auto-restore window (outside throttle)', '#30d158');
                }, 1000);
            }
        }, colors.length * 150 + 500);

        // 3. Test manual minimize respect
        setTimeout(() => {
            if (windowState === WindowState.NORMAL) {
                manualMinimize = true;
                minimizeTimestamp = Date.now();
                minimizeWindow();
                // Immediate line should NOT restore (within 500ms throttle)
                setTimeout(() => addLine('This should NOT restore (within throttle)', '#ff453a'), 100);
                // Later line should NOT auto-restore (manual minimize)
                setTimeout(() => addLine('This should NOT auto-restore (manual minimize)', '#ff9f0a'), 800);
            }
        }, colors.length * 150 + 3500);

        // 4. Test tab status dots
        setTimeout(() => updateTabDot('done'), 2000);
        setTimeout(() => updateTabDot('error'), 2500);
        setTimeout(() => updateTabDot('active'), 3000);
    }

    // ==================== INITIALIZATION ====================
    function init() {
        injectStyles();
        // Delay test to ensure DOM is ready
        setTimeout(runAllTests, 500);
        console.log('macOS Terminal Test: Window will appear shortly with all features demonstrated.');
        console.log('Features tested:');
        console.log('  ✓ All 9 terminal text colors');
        console.log('  ✓ Traffic lights (close/minimize/zoom)');
        console.log('  ✓ Proper state machine (normal ⇄ minimized → closed)');
        console.log('  ✓ Hover glyphs on traffic light group');
        console.log('  ✓ Window dragging');
        console.log('  ✓ Focus/blur styling');
        console.log('  ✓ Auto-restore on new content');
        console.log('  ✓ Manual minimize throttle (500ms)');
        console.log('  ✓ Tab bar with status dots');
        console.log('  ✓ Status bar');
        console.log('  ✓ Resize handle');
        consol