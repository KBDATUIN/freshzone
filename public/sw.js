// ============================================================
//  sw.js — FreshZone Service Worker for Web Push Notifications
// ============================================================

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
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '🚨 FreshZone Alert', options)
    );
});

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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
