// ============================================================
//  sw.js — FreshZone Service Worker v3
//  Handles: Push Notifications + Offline Caching + PWA
// ============================================================

const CACHE_NAME = 'freshzone-v3';
const STATIC_ASSETS = [
    '/', '/auth.html', '/dashboard.html', '/history.html',
    '/profile.html', '/contact.html', '/style.css',
    '/utils.js', '/auth.js', '/role-guard.js',
    '/logo.png', '/logo1.png', '/vape.png', '/favicon.ico',
    '/manifest.json',
    '/favicon_io/android-chrome-192x192.png',
    '/favicon_io/android-chrome-512x512.png',
    '/favicon_io/apple-touch-icon.png',
];

// ── INSTALL ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH: network-first for API, cache-first for assets ──────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // API calls — always network, never cache
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request)
                .then(cached => cached || caches.match('/auth.html'))
            )
    );
});

// ── PUSH NOTIFICATION ─────────────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try { data = event.data.json(); }
    catch { data = { title: '🚨 FreshZone Alert', body: event.data.text() }; }

    const options = {
        body:    data.body  || 'Vape/smoke detected on campus!',
        icon:    '/favicon_io/android-chrome-192x192.png',
        badge:   '/favicon_io/favicon-32x32.png',
        image:   '/vape.png',

        // Vibrate strongly — long-short-long-short-long pattern
        vibrate: [500, 200, 500, 200, 500, 200, 500],

        // Use unique tag per alert so each event shows separately
        tag:      'freshzone-alert-' + Date.now(),
        renotify: true,

        // CRITICAL: keeps notification on screen until user taps it
        requireInteraction: true,

        // CRITICAL: never silent — triggers sound + screen wake
        silent: false,

        // Priority hint (Android)
        priority: 'high',

        actions: [
            { action: 'view',    title: '👁 Open Dashboard' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        data: { url: data.url || '/dashboard.html', timestamp: Date.now() }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '🚨 FreshZone Alert', options)
    );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Focus existing window if open
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) return clients.openWindow(url);
            })
    );
});

// ── NOTIFICATION CLOSE ────────────────────────────────────────
self.addEventListener('notificationclose', () => {});
