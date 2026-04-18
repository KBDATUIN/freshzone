// ============================================================
//  pwa.js — FreshZone PWA: Install prompt + Splash + Bottom Nav
// ============================================================

// ── SPLASH SCREEN ─────────────────────────────────────────────
(function showSplash() {
    // Only show on mobile standalone or first load
    const isMobile = window.innerWidth <= 768;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone;

    if (!isMobile && !isStandalone) return;

    // Don't show on auth page (login screen IS the splash)
    if (window.location.pathname.includes('auth.html') ||
        window.location.pathname === '/' ||
        window.location.pathname === '') return;

    const splash = document.createElement('div');
    splash.id = 'fz-splash';
    splash.innerHTML = `
        <div class="fz-splash-inner">
            <img src="/logo1.png" alt="FreshZone" class="fz-splash-logo">
            <div class="fz-splash-name">FreshZone</div>
            <div class="fz-splash-tagline">Vape &amp; Smoke Detection</div>
            <div class="fz-splash-spinner">
                <div class="fz-spinner-ring"></div>
            </div>
        </div>
    `;
    document.body.appendChild(splash);

    // Fade out after 1.2s
    setTimeout(() => {
        splash.classList.add('fz-splash-hide');
        setTimeout(() => splash.remove(), 500);
    }, 1200);
})();

// ── BOTTOM NAVIGATION BAR (mobile only) ───────────────────────
(function buildBottomNav() {
    if (window.innerWidth > 768) return;

    // Don't show on auth page
    if (window.location.pathname.includes('auth.html') ||
        window.location.pathname === '/' ||
        window.location.pathname === '') return;

    const pages = [
        { href: 'dashboard.html', icon: '📡', label: 'Monitor' },
        { href: 'history.html',   icon: '📋', label: 'History' },
        { href: 'profile.html',   icon: '👤', label: 'Profile' },
        { href: 'contact.html',   icon: '✉️', label: 'Contact' },
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    const nav = document.createElement('nav');
    nav.id = 'fz-bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Bottom navigation');

    nav.innerHTML = pages.map(p => `
        <a href="${p.href}" class="fz-bottom-nav-item ${currentPage === p.href ? 'active' : ''}" aria-label="${p.label}">
            <span class="fz-bottom-nav-icon">${p.icon}</span>
            <span class="fz-bottom-nav-label">${p.label}</span>
        </a>
    `).join('');

    document.body.appendChild(nav);

    // Add padding to body so content isn't hidden behind bottom nav
    document.body.style.paddingBottom = '70px';
})();

// ── INSTALL PROMPT ─────────────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    // Only show banner if not already installed and on mobile
    const isMobile = window.innerWidth <= 768;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone;
    const dismissed = sessionStorage.getItem('fz-install-dismissed');

    if (!isStandalone && isMobile && !dismissed) {
        setTimeout(showInstallBanner, 3000);
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

    // Animate in
    requestAnimationFrame(() => banner.classList.add('fz-install-show'));
}

function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(choice => {
        deferredInstallPrompt = null;
        const banner = document.getElementById('fz-install-banner');
        if (banner) banner.remove();
    });
}

function dismissInstall() {
    sessionStorage.setItem('fz-install-dismissed', '1');
    const banner = document.getElementById('fz-install-banner');
    if (banner) {
        banner.classList.remove('fz-install-show');
        setTimeout(() => banner.remove(), 400);
    }
}

// ── STATUS BAR COLOR (iOS) ────────────────────────────────────
(function setStatusBar() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = isDark ? '#071018' : '#004e7a';

    // Update on dark mode toggle
    const observer = new MutationObserver(() => {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        meta.content = dark ? '#071018' : '#004e7a';
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();

// ── REGISTER SERVICE WORKER ───────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
