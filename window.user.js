// ==UserScript==
// @name         macOS Terminal Overlay
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Injects a draggable, minimizable macOS-style terminal window
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 1. PRIVATE STATE ====================
  let state = 'CLOSED';          // CLOSED | NORMAL | MINIMIZED
  let minimizeTimestamp = 0;
  let windowEl = null;
  let body = null;
  let isFocused = true;

  // Dragging state
  let dragging = false;
  let dragStartX, dragStartY, startLeft, startTop;

  // ==================== 2. CSS INJECTION ====================
  const STYLES = `
    /* ---------- window ---------- */
    .macos-terminal-overlay {
      width: min(680px, 92vw);
      aspect-ratio: 680 / 400;
      min-width: 320px;
      border-radius: 12px;
      background: #1c1c1e;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: 0 0 0 0.5px rgba(255,255,255,0.07),
                  0 8px 32px rgba(0,0,0,0.6),
                  0 2px 8px rgba(0,0,0,0.5);
      resize: both;
      overflow: hidden;
      font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      font-size: 12.5px;
      user-select: none;
    }
    .macos-terminal-overlay.focused {
      box-shadow: 0 0 0 0.5px rgba(255,255,255,0.09),
                  0 12px 40px rgba(0,0,0,0.7),
                  0 2px 8px rgba(0,0,0,0.5);
    }

    /* ---------- title bar ---------- */
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
    }
    .macos-title-text {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      padding: 0 120px;
      text-align: center;
      color: #98989e;
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ---------- traffic lights ---------- */
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
      box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.25),
                  0 0.5px 0 rgba(0,0,0,0.4);
    }
    .macos-traffic-light.close    { background: #ff5f57; }
    .macos-traffic-light.minimize { background: #febc2e; }
    .macos-traffic-light.zoom     { background: #28c840; }
    .macos-traffic-light.disabled {
      background: #44444a !important;
      box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.1),
                  0 0.5px 0 rgba(0,0,0,0.4) !important;
      cursor: default !important;
      pointer-events: none !important;
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
    .macos-traffic-lights:hover .glyph { opacity: 1; }
    .macos-traffic-light.disabled .glyph { opacity: 0 !important; }

    /* ---------- body / log ---------- */
    .macos-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 16px;
      background: #1c1c1e;
      line-height: 1.7;
      max-height: 800px;
      opacity: 1;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.22s ease,
                  padding-top 0.3s ease,
                  padding-bottom 0.3s ease;
    }
    .macos-body::-webkit-scrollbar       { width: 4px; }
    .macos-body::-webkit-scrollbar-track { background: transparent; }
    .macos-body::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 4px; }
    .macos-body::-webkit-scrollbar-thumb:hover { background: #505050; }

    .macos-log-line {
      display: flex;
      gap: 8px;
      align-items: baseline;
      margin-bottom: 1px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .macos-ts     { color: #3a3a3c; font-size: 10px; flex-shrink: 0; user-select: none; }
    .macos-prompt { color: #48484a; flex-shrink: 0; user-select: none; }
    .macos-msg    { flex: 1; color: #d1d1d6; }

    /* ---------- minimized state ---------- */
    .macos-terminal-overlay.minimized .macos-body {
      max-height: 0 !important;
      opacity: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      overflow: hidden !important;
    }
    .macos-terminal-overlay.minimized {
      aspect-ratio: auto !important;
      height: auto !important;
      min-height: unset !important;
      resize: none;
    }
    .macos-terminal-overlay.minimized .macos-titlebar {
      border-bottom: none;
    }
  `;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ==================== 3. UTILITIES ====================
  function ts() {
    const n = new Date();
    return [n.getHours(), n.getMinutes(), n.getSeconds()]
      .map(v => String(v).padStart(2, '0'))
      .join(':');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  // ==================== 4. DOM CREATION ====================
  function createWindow() {
    if (windowEl) return; // already exists

    windowEl = document.createElement('div');
    windowEl.className = 'macos-terminal-overlay focused';
    windowEl.innerHTML = `
      <div class="macos-titlebar" id="macos-drag-handle">
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
        <div class="macos-title-text">Terminal — bash</div>
      </div>
      <div class="macos-body"></div>
    `;

    document.body.appendChild(windowEl);
    body = windowEl.querySelector('.macos-body');

    // Dragging setup
    const titlebar = windowEl.querySelector('#macos-drag-handle');
    titlebar.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Button events
    windowEl.querySelector('[data-action="close"]').addEventListener('click', closeWindow);
    windowEl.querySelector('[data-action="minimize"]').addEventListener('click', minimizeWindow);
    windowEl.querySelector('[data-action="zoom"]').addEventListener('click', restoreWindow);

    // Focus / blur
    windowEl.addEventListener('mousedown', () => { if (!isFocused) focusWindow(); });
    document.addEventListener('mousedown', (e) => {
      if (windowEl && !windowEl.contains(e.target) && isFocused) blurWindow();
    });
  }

  // ==================== 5. DRAGGING ====================
  function onDragStart(e) {
    // only drag from titlebar, ignore traffic lights
    if (e.target.closest('.macos-traffic-lights')) return;
    dragging = true;
    const rect = windowEl.getBoundingClientRect();
    // snap to pixel position (remove centering)
    windowEl.style.left = rect.left + 'px';
    windowEl.style.top = rect.top + 'px';
    windowEl.style.transform = 'none';
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    windowEl.style.left = (startLeft + dx) + 'px';
    windowEl.style.top = (startTop + dy) + 'px';
  }

  function onDragEnd() {
    dragging = false;
  }

  // ==================== 6. FOCUS / BLUR ====================
  function focusWindow() {
    if (!windowEl) return;
    isFocused = true;
    windowEl.classList.add('focused');
    windowEl.querySelector('.macos-title-text').style.color = '#98989e';
  }

  function blurWindow() {
    if (!windowEl) return;
    isFocused = false;
    windowEl.classList.remove('focused');
    windowEl.querySelector('.macos-title-text').style.color = '#7a7a80';
  }

  // ==================== 7. STATE MACHINE & BUTTONS ====================
  function updateTrafficLights() {
    if (!windowEl) return;
    const minBtn = windowEl.querySelector('[data-action="minimize"]');
    const zoomBtn = windowEl.querySelector('[data-action="zoom"]');
    if (state === 'NORMAL') {
      minBtn.classList.remove('disabled');
      zoomBtn.classList.add('disabled');
    } else if (state === 'MINIMIZED') {
      minBtn.classList.add('disabled');
      zoomBtn.classList.remove('disabled');
    }
  }

  function minimizeWindow() {
    if (state !== 'NORMAL' || !windowEl) return;
    state = 'MINIMIZED';
    minimizeTimestamp = Date.now();
    windowEl.classList.add('minimized');
    updateTrafficLights();
  }

  function restoreWindow() {
    if (state !== 'MINIMIZED' || !windowEl) return;
    state = 'NORMAL';
    windowEl.classList.remove('minimized');
    updateTrafficLights();
    // re-apply aspect ratio etc. (class removal restores normal CSS)
  }

  function closeWindow() {
    if (!windowEl) return;
    // Remove all event listeners by removing element
    windowEl.remove();
    windowEl = null;
    body = null;
    state = 'CLOSED';
    // cleanup document listeners? They'll just be no-ops because windowEl is null.
    // We could remove them, but they won't hurt.
  }

  // ==================== 8. PUBLIC API ====================
  function addLine(message, color = '#d1d1d6') {
    // Auto-create if closed
    if (state === 'CLOSED') {
      createWindow();
      state = 'NORMAL';
      updateTrafficLights();
    }

    // Auto-restore from minimized after 500ms
    if (state === 'MINIMIZED') {
      if (Date.now() - minimizeTimestamp > 500) {
        restoreWindow();
      }
    }

    if (!body) return;

    const line = document.createElement('div');
    line.className = 'macos-log-line';
    line.innerHTML = `
      <span class="macos-ts">${ts()}</span>
      <span class="macos-prompt">$</span>
      <span class="macos-msg" style="color:${color}">${escapeHtml(message)}</span>
    `;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  // ==================== 9. INITIALIZATION ====================
  injectStyles();
  // We don't create window yet; it appears on first addLine() call.
  // But we expose API globally.

  window.macosTerminal = {
    log: addLine,
    show: () => {
      if (state === 'CLOSED') {
        createWindow();
        state = 'NORMAL';
        updateTrafficLights();
      } else if (state === 'MINIMIZED') {
        restoreWindow();
      }
    },
    hide: () => {
      if (state === 'NORMAL') minimizeWindow();
    },
    close: closeWindow,
    // convenience color helpers
    colors: {
      DEFAULT: '#d1d1d6',
      INFO: '#6fb3f7',
      SUCCESS: '#30d158',
      WARNING: '#ffd60a',
      ERROR: '#ff453a',
      PURPLE: '#bf5af2',
      ORANGE: '#ff9f0a',
      PINK: '#ff375f',
      MUTED: '#6a6a6a',
    }
  };

  // ---------- demo (remove in production) ----------
  // Uncomment the next block to see a quick demo after page load.
  /*
  setTimeout(() => {
    macosTerminal.log('macOS Terminal overlay ready.', macosTerminal.colors.INFO);
    macosTerminal.log('Type `macosTerminal.log("hello")` in console.', macosTerminal.colors.MUTED);
  }, 800);
  */

})();