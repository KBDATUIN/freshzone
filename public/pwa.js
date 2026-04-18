// ============================================================
//  pwa.js — FreshZone PWA
//  Splash (once only) + Install Prompt + Page Transitions
// ============================================================

// ── SPLASH SCREEN — only on very first app open ───────────────
(function showSplash() {
    const isMobile = window.innerWidth <= 900;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    // Skip on auth page
    if (window.location.pathname.includes('auth.html') ||
        window.location.pathname === '/' ||
        window.location.pathname === '') return;

    // Only show if this is the FIRST page load this session (not navigation between pages)
    const alreadyShown = sessionStorage.getItem('fz-splash-shown');
    if (alreadyShown) return;

    // Only show on mobile or installed PWA
    if (!isMobile && !isStandalone) return;

    sessionStorage.setItem('fz-splash-shown', '1');

    const splash = document.createElement('div');
    splash.id = 'fz-splash';
    splash.innerHTML = `
        <div class="fz-splash-inner">
            <img src="/logo1.png" alt="FreshZone" class="fz-splash-logo">
            <div class="fz-splash-name">FreshZone</div>
            <div class="fz-splash-tagline">Vape &amp; Smoke Detection</div>
            <div class="fz-splash-spinner"><div class="fz-spinner-ring"></div></div>
        </div>
    `;
    document.body.appendChild(splash);

    setTimeout(() => {
        splash.classList.add('fz-splash-hide');
        setTimeout(() => splash.remove(), 500);
    }, 1400);
})();


// ── INSTALL PROMPT ─────────────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    const isMobile = window.innerWidth <= 900;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    const dismissed = sessionStorage.getItem('fz-install-dismissed');

    if (!isStandalone && isMobile && !dismissed) {
        setTimeout(showInstallBanner, 4000);
    }
});

function showInstallBanner() {
    if (document.getElementById('fz-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'fz-install-banner';
    banner.innerHTML = `
        <div class="fz-install-left">
            <img src="/favicon_io/android-chrome-192x192.png" alt="FreshZone" class="fz-install-icon">
            <div class="fz-install-text">
                <strong>Install FreshZone</strong>
                <span>Add to home screen for quick access</span>
            </div>
        </div>
        <div class="fz-install-actions">
            <button class="fz-install-btn" onclick="triggerInstall()">Install</button>
            <button class="fz-install-dismiss" onclick="dismissInstall()" aria-label="Dismiss">✕</button>
        </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('fz-install-show'));
}

function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
        const b = document.getElementById('fz-install-banner');
        if (b) b.remove();
    });
}

function dismissInstall() {
    sessionStorage.setItem('fz-install-dismissed', '1');
    const b = document.getElementById('fz-install-banner');
    if (b) {
        b.classList.remove('fz-install-show');
        setTimeout(() => b.remove(), 400);
    }
}

// ── LOADING INDICATOR — only when network is slow ─────────────
(function initSlowNetworkLoader() {
    let loadingTimer = null;
    let loaderEl = null;

    function showLoader() {
        if (loaderEl) return;
        loaderEl = document.createElement('div');
        loaderEl.id = 'fz-page-loader';
        loaderEl.innerHTML = `<div class="fz-loader-bar"></div>`;
        document.body.appendChild(loaderEl);
    }

    function hideLoader() {
        clearTimeout(loadingTimer);
        if (loaderEl) {
            loaderEl.classList.add('fz-loader-done');
            setTimeout(() => { if (loaderEl) { loaderEl.remove(); loaderEl = null; } }, 400);
        }
    }

    // Only show loader if navigation takes longer than 400ms (slow network)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.getAttribute?.('onclick')) return;

        loadingTimer = setTimeout(showLoader, 400);
    });

    window.addEventListener('pageshow', hideLoader);
    window.addEventListener('load', hideLoader);
})();

// ── THEME-COLOR META ──────────────────────────────────────────
(function setStatusBar() {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    const update = () => {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        meta.content = dark ? '#071018' : '#004e7a';
    };
    update();
    new MutationObserver(update).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme']
    });
})();

// ── SERVICE WORKER ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
