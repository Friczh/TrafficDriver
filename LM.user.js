// ==UserScript==
// @name         TEST - Click NhapMa Angular Button
// @namespace    nhapma-test
// @version      1.0
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function findAngularBtn() {
        const img = document.querySelector('div[data-loading] img[src*="angular-icon.svg"]');
        if (!img) return null;
        const btn = img.closest('button');
        if (!btn) return null;
        return (btn.style.background === 'transparent') ? btn : null;
    }

    let attempts = 0;
    const poll = setInterval(() => {
        attempts++;
        console.log('[nhapma-test] polling...', attempts);

        const btn = findAngularBtn();
        if (btn) {
            clearInterval(poll);
            console.log('[nhapma-test] FOUND button:', btn);
            console.log('[nhapma-test] img src:', btn.querySelector('img')?.src);
            console.log('[nhapma-test] background:', btn.style.background);

            btn.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            setTimeout(() => {
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                console.log('[nhapma-test] CLICKED');
            }, 400);
            return;
        }

        if (attempts >= 150) {
            clearInterval(poll);
            console.warn('[nhapma-test] TIMEOUT — button not found');
        }
    }, 800);

})();