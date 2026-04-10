// ============================================================
//  sw.js — FreshZone Service Worker
//  Handles: Web Push Notifications + Offline Caching
// ============================================================

const CACHE_NAME = 'freshzone-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/dashboard.html',
    '/history.html',
    '/profile.html',
    '/contact.html',
    '/auth.html',
    '/style.css',
    '/utils.js',
    '/auth.js',
    '/role-guard.js',
    '/logo.png',
    '/logo1.png',
    '/vape.png',
    '/favicon.ico',
    '/favicon_io/android-chrome-192x192.png',
    '/favicon_io/android-chrome-512x512.png',
    '/favicon_io/apple-touch-icon.png',
    '/favicon_io/favicon-16x16.png',
    '/favicon_io/favicon-32x32.png',
    '/favicon_io/favicon.ico',
    '/favicon_io/site.webmanifest',
];

// ── INSTALL: cache all static assets ─────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// ── ACTIVATE: clear old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// ── FETCH: serve from cache, fall back to network ─────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests (POST, PUT, DELETE — API calls)
    if (event.request.method !== 'GET') return;

    // Skip API calls — never cache these, always need live data
    if (url.pathname.startsWith('/api/')) return;

    // For all other GET requests: Cache First, then Network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Serve from cache immediately, update in background
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            // Not in cache — try network
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch(() => {
                // Offline and not cached — return dashboard as fallback for HTML
                if (event.request.headers.get('accept') &&
                    event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/dashboard.html');
                }
            });
        })
    );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', function(event) {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body:    data.body || 'Vape/smoke detected!',
        icon:    '/logo1.png',
        badge:   '/logo1.png',
        vibrate: [200, 100, 200, 100, 200],
        tag:     'freshzone-alert',
        renotify: true,
        requireInteraction: true,
        actions: [
            { action: 'view',    title: '👁 View Dashboard' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        data: { url: data.url || '/' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '🚨 FreshZone Alert', options)
    );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (const client of clientList) {
                if (client.url.includes('dashboard') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
