// ============================================================
//  api/readings.js — Sensor data from ESP32 + live dashboard
// ============================================================
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendAlertEmail } = require('../mailer');
const { sendPushToAll }  = require('./push');

// ── AQI Calculator ───────────────────────────────────────────
function calculateAQI(pm25) {
    const breakpoints = [
        { cLow: 0.0,   cHigh: 12.0,  iLow: 0,   iHigh: 50,  category: 'Good' },
        { cLow: 12.1,  cHigh: 35.4,  iLow: 51,  iHigh: 100, category: 'Moderate' },
        { cLow: 35.5,  cHigh: 55.4,  iLow: 101, iHigh: 150, category: 'Unhealthy for Sensitive Groups' },
        { cLow: 55.5,  cHigh: 150.4, iLow: 151, iHigh: 200, category: 'Unhealthy' },
        { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300, category: 'Very Unhealthy' },
        { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500, category: 'Hazardous' },
    ];
    const bp = breakpoints.find(b => pm25 >= b.cLow && pm25 <= b.cHigh) || breakpoints[breakpoints.length - 1];
    const aqi = Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow);
    return { aqi, category: bp.category };
}

// ── Input validation helper ───────────────────────────────────
function isValidReading(val, min, max) {
    return typeof val === 'number' && !isNaN(val) && val >= min && val <= max;
}

// ── POST /api/readings — ESP32 pushes sensor data ─────────────
router.post('/', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ESP32_API_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid API key.' });
    }

    const { node_code, pm1_0, pm2_5, pm10 } = req.body;

    if (!node_code || typeof node_code !== 'string' || node_code.length > 50) {
        return res.status(400).json({ success: false, message: 'Invalid node_code.' });
    }
    if (!isValidReading(pm2_5, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm2_5 must be a number between 0 and 1000.' });
    }
    if (pm1_0 !== undefined && !isValidReading(pm1_0, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm1_0 must be a number between 0 and 1000.' });
    }
    if (pm10 !== undefined && !isValidReading(pm10, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm10 must be a number between 0 and 1000.' });
    }

    try {
        const [nodes] = await db.query(
            'SELECT * FROM sensor_nodes WHERE node_code = ? AND is_active = 1', [node_code]
        );
        if (!nodes.length) return res.status(404).json({ success: false, message: 'Sensor node not found.' });

        const node = nodes[0];
        const { aqi, category } = calculateAQI(pm2_5);
        // EPA threshold: smoke detected at PM2.5 > 35.4 µg/m³
        const smokeDetected = pm2_5 > 35.4;
        const ledColor = smokeDetected ? 'red' : 'green';

        const [result] = await db.query(
            `INSERT INTO sensor_readings (node_id, pm1_0, pm2_5, pm10, aqi_value, aqi_category, smoke_detected, led_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [node.id, pm1_0 || null, pm2_5, pm10 || null, aqi, category, smokeDetected ? 1 : 0, ledColor]
        );

        await db.query('UPDATE sensor_nodes SET last_seen = NOW() WHERE id = ?', [node.id]);

        if (smokeDetected) {
            // FIX: Check for ANY open event — Detected OR Acknowledged.
            // Previously only checked 'Detected', so an Acknowledged event would
            // be ignored and a brand-new event created, making the banner reappear.
            const [openEvents] = await db.query(
                `SELECT id, event_status FROM detection_events
                 WHERE node_id = ? AND event_status IN ('Detected', 'Acknowledged')
                 ORDER BY detected_at DESC LIMIT 1`,
                [node.id]
            );

            if (!openEvents.length) {
                // No open event at all — create a fresh one and alert admins
                const [eventResult] = await db.query(
                    `INSERT INTO detection_events (node_id, reading_id, location_name, pm2_5_value, aqi_value, aqi_category)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [node.id, result.insertId, node.location_name, pm2_5, aqi, category]
                );

                const [admins] = await db.query(
                    "SELECT full_name, email FROM accounts WHERE position = 'Administrator' AND is_active = 1"
                );

                for (const admin of admins) {
                    await db.query(
                        `INSERT INTO push_notifications (event_id, recipient_email, recipient_name, subject, send_status)
                         VALUES (?, ?, ?, ?, 'pending')`,
                        [eventResult.insertId, admin.email, admin.full_name, `🚨 Smoke/Vape Detected — ${node.location_name}`]
                    );
                    try {
                        await sendAlertEmail(admin.email, admin.full_name, node.location_name, pm2_5, category);
                        await db.query("UPDATE push_notifications SET send_status='sent', sent_at=NOW() WHERE recipient_email=? AND send_status='pending'", [admin.email]);
                    } catch (mailErr) {
                        await db.query("UPDATE push_notifications SET send_status='failed', error_message=? WHERE recipient_email=? AND send_status='pending'", [mailErr.message, admin.email]);
                    }
                }

                try {
                    await sendPushToAll(
                        '🚨 Vape/Smoke Detected!',
                        `Alert at ${node.location_name} — PM2.5: ${pm2_5} µg/m³ (${category})`,
                        '/dashboard.html'
                    );
                } catch (pushErr) {
                    console.warn('[push] Web push failed:', pushErr.message);
                }
            } else {
                // FIX: Event already open (Detected or Acknowledged) — only update
                // the sensor readings, NEVER touch event_status. This preserves the
                // Acknowledged state even while the ESP32 keeps sending high readings.
                await db.query(
                    `UPDATE detection_events
                     SET pm2_5_value = ?, aqi_value = ?, aqi_category = ?, reading_id = ?
                     WHERE id = ?`,
                    [pm2_5, aqi, category, result.insertId, openEvents[0].id]
                );
            }
        } else {
            // Air is clean — auto-clear any still-'Detected' events for this node.
            // Leave 'Acknowledged' alone; staff may still be writing notes.
            await db.query(
                `UPDATE detection_events
                 SET event_status = 'Cleared', resolved_at = NOW()
                 WHERE node_id = ? AND event_status = 'Detected'`,
                [node.id]
            );
        }

        res.json({ success: true, node: node.location_name, aqi, category, smoke_detected: smokeDetected, led_color: ledColor });

    } catch (err) {
        console.error('[readings] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/live ─────────────────────────────────────
router.get('/live', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                sn.node_code,
                sn.location_name,
                sn.last_seen,
                CASE WHEN sn.last_seen >= NOW() - INTERVAL 15 SECOND THEN 1 ELSE 0 END AS node_active,
                sr.pm1_0, sr.pm2_5, sr.pm10,
                sr.aqi_value, sr.aqi_category,
                sr.smoke_detected, sr.led_color, sr.recorded_at
            FROM sensor_nodes sn
            LEFT JOIN sensor_readings sr ON sr.id = (
                SELECT id FROM sensor_readings WHERE node_id = sn.id ORDER BY recorded_at DESC LIMIT 1
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
        const [rows] = await db.query(`
            SELECT de.id, de.location_name, de.pm2_5_value,
                   de.aqi_value, de.aqi_category, de.event_status,
                   de.detected_at, de.acknowledged_at,
                   sn.node_code
            FROM detection_events de
            JOIN sensor_nodes sn ON sn.id = de.node_id
            WHERE de.event_status IN ('Detected', 'Acknowledged')
            ORDER BY de.detected_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/readings/acknowledge/:eventId ───────────────────
router.post('/acknowledge/:eventId', authMiddleware, adminOnly, async (req, res) => {
    const { eventId } = req.params;
    const { notes }   = req.body;

    if (!Number.isInteger(Number(eventId))) {
        return res.status(400).json({ success: false, message: 'Invalid event ID.' });
    }

    try {
        // FIX: Guard with WHERE event_status = 'Detected' so this is idempotent.
        // If already acknowledged, affectedRows = 0 and we return success quietly.
        const [updated] = await db.query(
            `UPDATE detection_events
             SET event_status = 'Acknowledged', acknowledged_at = NOW(), acknowledged_by = ?, notes = ?
             WHERE id = ? AND event_status = 'Detected'`,
            [req.user.id, notes || null, eventId]
        );

        if (updated.affectedRows === 0) {
            return res.json({ success: true, message: 'Alert already acknowledged or resolved.' });
        }

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

// ── POST /api/readings/resolve/:eventId ──────────────────────
router.post('/resolve/:eventId', authMiddleware, async (req, res) => {
    const { eventId } = req.params;
    const { notes }   = req.body;

    if (!Number.isInteger(Number(eventId))) {
        return res.status(400).json({ success: false, message: 'Invalid event ID.' });
    }

    try {
        // FIX: Guard with WHERE event_status IN (...) so already-cleared events
        // don't generate duplicate system_logs entries.
        const [updated] = await db.query(
            `UPDATE detection_events
             SET event_status    = 'Cleared',
                 resolved_at     = NOW(),
                 acknowledged_at = COALESCE(acknowledged_at, NOW()),
                 acknowledged_by = COALESCE(acknowledged_by, ?),
                 notes           = COALESCE(notes, ?)
             WHERE id = ? AND event_status IN ('Detected', 'Acknowledged')`,
            [req.user.id, notes || null, eventId]
        );

        if (updated.affectedRows === 0) {
            return res.json({ success: true, message: 'Alert already resolved.' });
        }

        await db.query(
            `INSERT INTO system_logs (account_id, action, description, ip_address)
             VALUES (?, 'Alert Resolved', ?, ?)`,
            [req.user.id, `Event #${eventId} resolved/cleared by ${req.user.name}`, req.ip]
        );

        res.json({ success: true, message: 'Alert marked as resolved.' });
    } catch (err) {
        console.error('[resolve] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
