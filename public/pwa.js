// ============================================================
//  pwa.js — FreshZone PWA v2
//  Splash (once only) + Install Prompt + Page Transitions + iOS Support
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
            <div class="fz-splash-tagline">Vape & Smoke Detection</div>
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
let installPromptShown = false;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    
    console.log('[PWA] beforeinstallprompt event captured');

    const isMobile = window.innerWidth <= 900;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    const dismissed = sessionStorage.getItem('fz-install-dismissed');

    // Don't show install banner on iOS - show iOS-specific instructions instead
    if (isIOS()) {
        showIOSInstallInstructions();
        return;
    }

    // Only show banner once per session
    if (!isStandalone && isMobile && !dismissed && !installPromptShown) {
        installPromptShown = true;
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

// ── iOS INSTALL INSTRUCTIONS ───────────────────────────────────
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

function showIOSInstallInstructions() {
    if (isStandalone() || sessionStorage.getItem('fz-ios-instructions-shown')) return;
    
    sessionStorage.setItem('fz-ios-instructions-shown', '1');
    
    // Create iOS install instruction banner
    const banner = document.createElement('div');
    banner.id = 'fz-ios-install-banner';
    banner.innerHTML = `
        <div class="fz-ios-install-content">
            <div class="fz-ios-install-header">
                <img src="/favicon_io/apple-touch-icon.png" alt="FreshZone" class="fz-ios-install-icon">
                <div class="fz-ios-install-text">
                    <strong>Install FreshZone on iOS</strong>
                    <span>Tap <svg class="ios-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> then "Add to Home Screen"</span>
                </div>
            </div>
            <button class="fz-install-dismiss" onclick="dismissIOSInstall()" aria-label="Dismiss">✕</button>
        </div>
        <div class="fz-ios-steps">
            <div class="fz-ios-step">
                <span class="fz-ios-step-num">1</span>
                <span>Tap the <strong>Share</strong> button in Safari</span>
            </div>
            <div class="fz-ios-step">
                <span class="fz-ios-step-num">2</span>
                <span>Scroll and tap <strong>"Add to Home Screen"</strong></span>
            </div>
            <div class="fz-ios-step">
                <span class="fz-ios-step-num">3</span>
                <span>Tap <strong>Add</strong> to install</span>
            </div>
        </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('fz-ios-install-show'));
}

function dismissIOSInstall() {
    const b = document.getElementById('fz-ios-install-banner');
    if (b) {
        b.classList.remove('fz-ios-install-show');
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
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered:', registration.scope);
                // Check for updates periodically
                setInterval(() => registration.update(), 60000);
            })
            .catch(err => {
                console.error('[PWA] Service Worker registration failed:', err);
            });
    });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_COMPLETE') {
            console.log('[PWA] Background sync completed:', event.data);
            // Show notification about sync completion
            if (typeof showNotification === 'function') {
                const msg = event.data.remaining === 0 
                    ? `All ${event.data.synced} readings synced successfully!`
                    : `${event.data.synced} readings synced, ${event.data.remaining} still pending`;
                showNotification(msg, event.data.remaining === 0 ? 'success' : 'warning', 3000);
            }
        }
    });
}

// ── BACKGROUND SYNC FOR OFFLINE READINGS ───────────────────────
// Queue readings for background sync when offline
window.FreshZoneSync = {
    // Queue a reading for sync
    queueReading: function(readingData) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.active.postMessage({
                    type: 'CACHE_READINGS',
                    reading: readingData
                });
            }).catch(err => {
                console.warn('[PWA] Failed to queue reading for sync:', err);
            });
        }
    },
    
    // Register background sync
    registerSync: async function() {
        if ('serviceWorker' in navigator && 'sync' in window.SyncManager.prototype) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('sync-readings');
                console.log('[PWA] Background sync registered');
            } catch(err) {
                console.log('[PWA] Background sync not available:', err);
            }
        }
    }
};

// ── OFFLINE DETECTION ──────────────────────────────────────────
(function initOfflineDetection() {
    function isOfflinePage() {
        return window.location.pathname.endsWith('/offline.html') || window.location.pathname === '/offline.html';
    }

    function getCurrentPath() {
        return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function redirectToOfflinePage() {
        if (isOfflinePage()) return;

        const currentPath = getCurrentPath();

        try {
            sessionStorage.setItem('fz-last-online-path', currentPath);
        } catch (err) {
            console.warn('[PWA] Could not store last online path:', err);
        }

        window.location.replace(`/offline.html?return=${encodeURIComponent(currentPath)}`);
    }

    function handleOnline() {
        document.body.classList.remove('fz-offline');
        console.log('[PWA] Connection restored');
        
        // Try to sync any pending readings
        if (window.FreshZoneSync) {
            window.FreshZoneSync.registerSync();
        }
    }
    
    function handleOffline() {
        document.body.classList.add('fz-offline');
        console.log('[PWA] Connection lost');
        
        // Show offline notification
        if (typeof showNotification === 'function') {
            showNotification('You are offline. Changes will sync when reconnected.', 'warning', 4000);
        }

        setTimeout(redirectToOfflinePage, 150);
    }
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check initial state
    if (!navigator.onLine) {
        handleOffline();
    }
})();

// ── UPDATE DETECTION ───────────────────────────────────────────
(function initUpdateDetection() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Service worker updated
            console.log('[PWA] App updated - refreshing...');
            
            // Show update notification
            if (typeof showNotification === 'function') {
                showNotification('App updated! Refreshing...', 'info', 2000);
            }
            
            // Reload to get fresh content
            setTimeout(() => window.location.reload(), 2000);
        });
    }
})();
