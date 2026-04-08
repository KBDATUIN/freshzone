// ============================================================
//  api/push.js — Web Push Notification endpoints
// ============================================================
const express   = require('express');
const router    = express.Router();
const webpush   = require('web-push');
const db        = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Configure VAPID
webpush.setVapidDetails(
    'mailto:freshzone.alerts@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ── GET /api/push/vapid-public-key ───────────────────────────
// Returns public key for client subscription
router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ── POST /api/push/subscribe ─────────────────────────────────
// Save a push subscription for the logged-in user
router.post('/subscribe', authMiddleware, async (req, res) => {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ success: false, message: 'No subscription provided.' });

    try {
        const subStr = JSON.stringify(subscription);

        // Check if already exists
        const [existing] = await db.query(
            'SELECT id FROM push_subscriptions WHERE account_id = ? AND endpoint = ?',
            [req.user.id, subscription.endpoint]
        );

        if (existing.length) {
            // Update existing
            await db.query(
                'UPDATE push_subscriptions SET subscription_data = ?, updated_at = NOW() WHERE account_id = ? AND endpoint = ?',
                [subStr, req.user.id, subscription.endpoint]
            );
        } else {
            // Insert new
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
        const [subs] = await db.query('SELECT subscription_data FROM push_subscriptions');

        const payload = JSON.stringify({ title, body, url });

        const results = await Promise.allSettled(
            subs.map(async (row) => {
                try {
                    const sub = JSON.parse(row.subscription_data);
                    await webpush.sendNotification(sub, payload);
                } catch (err) {
                    // If subscription expired, remove it
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        const sub = JSON.parse(row.subscription_data);
                        await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
                    }
                }
            })
        );

        console.log(`[push] Sent to ${subs.length} subscribers`);
    } catch (err) {
        console.error('[push] Send error:', err.message);
    }
}

module.exports = router;
module.exports.sendPushToAll = sendPushToAll;
