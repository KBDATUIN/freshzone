// ============================================================
//  sw.js — FreshZone Service Worker
//  Handles: Push Notifications + Offline Asset Caching
// ============================================================

const CACHE_NAME = 'freshzone-v2';
const OFFLINE_ASSETS = [
    '/auth.html',
    '/dashboard.html',
    '/history.html',
    '/profile.html',
    '/contact.html',
    '/style.css',
    '/utils.js',
    '/auth.js',
    '/role-guard.js',
    '/logo1.png',
    '/logo.png',
];

// ── INSTALL: cache offline assets ────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS))
    );
    self.skipWaiting();
});

// ── ACTIVATE: clean old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── FETCH: serve from cache if offline ───────────────────────
self.addEventListener('fetch', (event) => {
    // Only cache GET requests for static assets
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return; // Don't cache API calls

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Update cache with fresh response
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // If page not cached, show offline page
                    if (event.request.destination === 'document') {
                        return caches.match('/auth.html');
                    }
                });
            })
    );
});

// ── PUSH: show notification ───────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title || '🚨 FreshZone Alert', {
            body:    data.body || 'Vape/smoke detected!',
            icon:    '/logo1.png',
            badge:   '/logo1.png',
            vibrate: [200, 100, 200, 100, 200],
            tag:     'freshzone-alert',
            renotify: true,
            requireInteraction: true,
            actions: [
                { action: 'view',    title: 'View Dashboard' },
                { action: 'dismiss', title: 'Dismiss' }
            ],
            data: { url: data.url || '/dashboard.html' }
        })
    );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const url = event.notification.data?.url || '/dashboard.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes('dashboard') && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
