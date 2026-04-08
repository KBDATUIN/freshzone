// ============================================================
//  api/readings.js — Sensor data from ESP32 + live dashboard
// ============================================================
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendAlertEmail } = require('../mailer');
const { sendPushToAll } = require('./push');

// ── Helper: calculate AQI from PM2.5 (US EPA formula) ────────
function calculateAQI(pm25) {
    const breakpoints = [
        { cLow: 0.0,  cHigh: 12.0,  iLow: 0,   iHigh: 50,  category: 'Good' },
        { cLow: 12.1, cHigh: 35.4,  iLow: 51,  iHigh: 100, category: 'Moderate' },
        { cLow: 35.5, cHigh: 55.4,  iLow: 101, iHigh: 150, category: 'Unhealthy for Sensitive Groups' },
        { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200, category: 'Unhealthy' },
        { cLow: 150.5,cHigh: 250.4, iLow: 201, iHigh: 300, category: 'Very Unhealthy' },
        { cLow: 250.5,cHigh: 500.4, iLow: 301, iHigh: 500, category: 'Hazardous' },
    ];
    const bp = breakpoints.find(b => pm25 >= b.cLow && pm25 <= b.cHigh)
             || breakpoints[breakpoints.length - 1];

    const aqi = Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow
    );
    return { aqi, category: bp.category };
}

// ── POST /api/readings ────────────────────────────────────────
router.post('/', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ESP32_API_KEY && process.env.ESP32_API_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid API key.' });
    }

    const { node_code, pm1_0, pm2_5, pm10 } = req.body;

    if (!node_code || pm2_5 === undefined)
        return res.status(400).json({ success: false, message: 'node_code and pm2_5 are required.' });

    try {
        const [nodes] = await db.query(
            'SELECT * FROM sensor_nodes WHERE node_code = ? AND is_active = 1', [node_code]
        );
        if (!nodes.length)
            return res.status(404).json({ success: false, message: 'Sensor node not found.' });

        const node = nodes[0];
        const { aqi, category } = calculateAQI(pm2_5);
        const smokeDetected = pm2_5 > 35.4;
        const ledColor = smokeDetected ? 'red' : 'green';

        const [result] = await db.query(
            `INSERT INTO sensor_readings
                (node_id, pm1_0, pm2_5, pm10, aqi_value, aqi_category, smoke_detected, led_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [node.id, pm1_0 || null, pm2_5, pm10 || null, aqi, category, smokeDetected ? 1 : 0, ledColor]
        );

        await db.query('UPDATE sensor_nodes SET last_seen = NOW() WHERE id = ?', [node.id]);

        if (smokeDetected) {
            // Check if there's already an open event for this node
            const [openEvents] = await db.query(
                "SELECT id FROM detection_events WHERE node_id = ? AND event_status = 'Detected'",
                [node.id]
            );

            // Only create a new event if no open event exists
            if (!openEvents.length) {
                const [eventResult] = await db.query(
                    `INSERT INTO detection_events
                        (node_id, reading_id, location_name, pm2_5_value, aqi_value, aqi_category)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [node.id, result.insertId, node.location_name, pm2_5, aqi, category]
                );

                const [admins] = await db.query(
                    "SELECT full_name, email FROM accounts WHERE position = 'Administrator' AND is_active = 1"
                );

                for (const admin of admins) {
                    await db.query(
                        `INSERT INTO push_notifications
                            (event_id, recipient_email, recipient_name, subject, send_status)
                         VALUES (?, ?, ?, ?, 'pending')`,
                        [
                            eventResult.insertId,
                            admin.email,
                            admin.full_name,
                            `🚨 Smoke/Vape Detected — ${node.location_name}`
                        ]
                    );

                    try {
                        await sendAlertEmail(admin.email, admin.full_name, node.location_name, pm2_5, category);
                        await db.query(
                            "UPDATE push_notifications SET send_status='sent', sent_at=NOW() WHERE recipient_email=? AND send_status='pending'",
                            [admin.email]
                        );
                    } catch (mailErr) {
                        await db.query(
                            "UPDATE push_notifications SET send_status='failed', error_message=? WHERE recipient_email=? AND send_status='pending'",
                            [mailErr.message, admin.email]
                        );
                    }
                }
            }

            // Send Web Push to all subscribed users
            try {
                await sendPushToAll(
                    '🚨 Vape/Smoke Detected!',
                    `Alert at ${node.location_name} — PM2.5: ${pm2_5} µg/m³ (${category})`,
                    '/dashboard.html'
                );
            } catch (pushErr) {
                console.warn('[push] Web push failed:', pushErr.message);
            }
        }

        res.json({
            success: true,
            node: node.location_name,
            aqi,
            category,
            smoke_detected: smokeDetected,
            led_color: ledColor
        });

    } catch (err) {
        console.error('[readings] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/live ────────────────────────────────────
// node_active = 1 only if last_seen within 15 seconds (ESP32 sends every 5s)
router.get('/live', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                sn.node_code,
                sn.location_name,
                sn.last_seen,
                CASE WHEN sn.last_seen >= NOW() - INTERVAL 15 SECOND THEN 1 ELSE 0 END AS node_active,
                sr.pm1_0,
                sr.pm2_5,
                sr.pm10,
                sr.aqi_value,
                sr.aqi_category,
                sr.smoke_detected,
                sr.led_color,
                sr.recorded_at
            FROM sensor_nodes sn
            LEFT JOIN sensor_readings sr ON sr.id = (
                SELECT id FROM sensor_readings
                WHERE node_id = sn.id
                ORDER BY recorded_at DESC
                LIMIT 1
            )
            WHERE sn.is_active = 1
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/open-events ─────────────────────────────
router.get('/open-events', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM v_open_events');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/readings/acknowledge/:eventId ───────────────────
router.post('/acknowledge/:eventId', authMiddleware, adminOnly, async (req, res) => {
    const { eventId } = req.params;
    const { notes }   = req.body;

    try {
        await db.query(
            `UPDATE detection_events
             SET event_status = 'Acknowledged',
                 acknowledged_at = NOW(),
                 acknowledged_by = ?,
                 notes = ?
             WHERE id = ?`,
            [req.user.id, notes || null, eventId]
        );

        await db.query(
            `INSERT INTO system_logs (account_id, action, description, ip_address)
             VALUES (?, 'Alert Acknowledged', ?, ?)`,
            [req.user.id, `Event #${eventId} acknowledged`, req.ip]
        );

        res.json({ success: true, message: 'Alert acknowledged.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
