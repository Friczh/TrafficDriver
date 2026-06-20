// ==UserScript==
// @name         Layma External
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Finds layma.net Traffic key and clicks the LẤY MÃ button
// @author       user
// @match        https://*/*
// @exclude      https://layma.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const getTrafficKey = () => {
        for (const s of document.querySelectorAll('script[src]')) {
            const m = s.src.match(/layma\.net\/Traffic\/Index\/([^/?#]+)/i);
            if (m) return m[1];
        }
        return null;
    };

    const tryClick = (key) => {
        const btn = document.getElementById(key);
        if (!btn) return false;
        btn.click();
        console.log(`[LaymaExternal] Clicked #${key}`);
        return true;
    };

    const run = (key) => {
        if (tryClick(key)) return;

        // Button not yet in DOM — wait for it
        const observer = new MutationObserver(() => {
            if (tryClick(key)) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    };

    const init = () => {
        const key = getTrafficKey();
        if (key) { setTimeout(() => run(key), 5000); return; }

        // Script tag may load late
        let found = false;
        const observer = new MutationObserver(() => {
            if (found) return;
            const k = getTrafficKey();
            if (k) { found = true; observer.disconnect(); setTimeout(() => run(k), 5000); }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
