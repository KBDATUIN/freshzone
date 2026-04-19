// ============================================================
//  api/push.js — Web Push Notification endpoints
// ============================================================
const express  = require('express');
const router   = express.Router();
const webpush  = require('web-push');
const db       = require('../db');
const { authMiddleware } = require('../middleware/auth');

webpush.setVapidDetails(
    'mailto:freshzone.alerts@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ── GET /api/push/vapid-public-key ───────────────────────────
router.get('/vapid-public-key', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(503).json({ success: false, message: 'Push service not configured.' });
    }
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ── POST /api/push/subscribe ─────────────────────────────────
router.post('/subscribe', authMiddleware, async (req, res) => {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: 'Invalid subscription.' });
    }

    // Validate endpoint is a proper URL
    try { new URL(subscription.endpoint); } catch {
        return res.status(400).json({ success: false, message: 'Invalid subscription endpoint.' });
    }

    try {
        const subStr = JSON.stringify(subscription);
        const [existing] = await db.query(
            'SELECT id FROM push_subscriptions WHERE account_id = ? AND endpoint = ?',
            [req.user.id, subscription.endpoint]
        );

        if (existing.length) {
            await db.query(
                'UPDATE push_subscriptions SET subscription_data=?, updated_at=NOW() WHERE account_id=? AND endpoint=?',
                [subStr, req.user.id, subscription.endpoint]
            );
        } else {
            await db.query(
                'INSERT INTO push_subscriptions (account_id, endpoint, subscription_data) VALUES (?, ?, ?)',
                [req.user.id, subscription.endpoint, subStr]
            );
        }

        res.json({ success: true, message: 'Subscribed to push notifications.' });
    } catch (err) {
        console.error('[push] Subscribe error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── DELETE /api/push/unsubscribe ─────────────────────────────
router.delete('/unsubscribe', authMiddleware, async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, message: 'Endpoint required.' });

    try {
        await db.query(
            'DELETE FROM push_subscriptions WHERE account_id = ? AND endpoint = ?',
            [req.user.id, endpoint]
        );
        res.json({ success: true, message: 'Unsubscribed.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── Helper: Send push to all subscribers ─────────────────────
async function sendPushToAll(title, body, url = '/dashboard.html') {
    try {
        const [subs] = await db.query('SELECT id, endpoint, subscription_data FROM push_subscriptions');
        if (!subs.length) return;

        const payload = JSON.stringify({ title, body, url });
        const expiredIds = [];

        await Promise.allSettled(
            subs.map(async (row) => {
                try {
                    const sub = JSON.parse(row.subscription_data);
                    await webpush.sendNotification(sub, payload, {
                        urgency: 'high',   // forces immediate delivery, wakes screen
                        TTL: 60,           // 60 seconds to deliver or drop
                    });
                } catch (err) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        expiredIds.push(row.id);
                    }
                }
            })
        );

        // Clean up expired subscriptions
        if (expiredIds.length) {
            await db.query(`DELETE FROM push_subscriptions WHERE id IN (${expiredIds.map(() => '?').join(',')})`, expiredIds);
            console.log(`[push] Removed ${expiredIds.length} expired subscriptions`);
        }

        console.log(`[push] Sent to ${subs.length - expiredIds.length} active subscribers`);
    } catch (err) {
        console.error('[push] Send error:', err.message);
    }
}


// ── POST /api/push/test — send a test push to all subscribers ─
// Protected by ESP32 API key so only you can trigger it
router.post('/test', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ESP32_API_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid API key.' });
    }

    try {
        const [subs] = await db.query('SELECT COUNT(*) as count FROM push_subscriptions');
        const count = subs[0].count;

        if (count === 0) {
            return res.json({ success: false, message: 'No subscribers found. Enable notifications on the dashboard first.' });
        }

        await sendPushToAll(
            '🚨 TEST — Vape/Smoke Detected!',
            'This is a test alert from FreshZone. System is working correctly.',
            '/dashboard.html'
        );

        res.json({ success: true, message: `Test push sent to ${count} subscriber(s).` });
    } catch (err) {
        console.error('[push/test] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
module.exports.sendPushToAll = sendPushToAll;
