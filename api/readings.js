// ============================================================
//  api/readings.js — Sensor data from ESP32 + live dashboard
// ============================================================
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendAlertEmail } = require('../mailer');
const { sendPushToAll }  = require('./push');
const { verifyNodeHmac } = require('../middleware/device-auth');
const logger = require('../logger');

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
    const bp = breakpoints.find(b => pm25 >= b.cLow && pm25 <= b.cHigh)
             || breakpoints[breakpoints.length - 1];
    const aqi = Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow
    );
    return { aqi, category: bp.category };
}

function isValidReading(val, min, max) {
    return typeof val === 'number' && !isNaN(val) && val >= min && val <= max;
}

// ── POST /api/readings — ESP32 pushes sensor data ─────────────
router.post('/', verifyNodeHmac, async (req, res) => {
    // --- API key auth ---
    const apiKey = req.headers['x-api-key'];
    const isLegacyAllowed = process.env.ALLOW_LEGACY_ESP32_KEY === 'true';
    if (isLegacyAllowed && (!apiKey || apiKey !== process.env.ESP32_API_KEY) && !req.deviceAuth) {
        return res.status(401).json({ success: false, message: 'Invalid API key.' });
    }

    if (!isLegacyAllowed && !req.deviceAuth) {
        return res.status(401).json({ success: false, message: 'Missing per-device authentication.' });
    }

    // --- Parse & coerce values from ESP32 (may arrive as strings) ---
    const node_code = req.body.node_code;
    const pm1_0  = req.body.pm1_0  !== undefined ? Number(req.body.pm1_0)  : undefined;
    const pm2_5  = Number(req.body.pm2_5);
    const pm10   = req.body.pm10   !== undefined ? Number(req.body.pm10)   : undefined;

    // --- Validation ---
    if (!node_code || typeof node_code !== 'string' || node_code.trim().length === 0 || node_code.length > 50) {
        return res.status(400).json({ success: false, message: 'Invalid node_code.' });
    }
    if (!isValidReading(pm2_5, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm2_5 must be 0–1000.' });
    }
    if (pm1_0 !== undefined && !isValidReading(pm1_0, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm1_0 must be 0–1000.' });
    }
    if (pm10 !== undefined && !isValidReading(pm10, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm10 must be 0–1000.' });
    }

    try {
        // --- Look up node ---
        const [nodes] = await db.query(
            'SELECT * FROM sensor_nodes WHERE node_code = ? AND is_active = 1',
            [node_code.trim()]
        );
        if (!nodes.length) {
            return res.status(404).json({ success: false, message: 'Sensor node not found.' });
        }

        const node = nodes[0];
        const { aqi, category } = calculateAQI(pm2_5);
        const smokeDetected = pm1_0 > 12;
        const ledColor = smokeDetected ? 'red' : 'green';

        // --- Save reading ---
        const [result] = await db.query(
            `INSERT INTO sensor_readings
                (node_id, pm1_0, pm2_5, pm10, aqi_value, aqi_category, smoke_detected, led_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [node.id, pm1_0 ?? null, pm2_5, pm10 ?? null, aqi, category, smokeDetected ? 1 : 0, ledColor]
        );

        await db.query('UPDATE sensor_nodes SET last_seen = NOW() WHERE id = ?', [node.id]);

        if (smokeDetected) {
            // ── KEY FIX: Only create a new alert if there is NO open event at all.
            // 'Detected'    → still waiting for acknowledgement
            // 'Acknowledged'→ staff saw it, still in progress
            // 'Cleared'     → already resolved — do NOT re-trigger until a clean
            //                 reading has come in first (handled by the reset flag below)
            //
            // We track whether the node had a "clean" reading after the last Cleared
            // event by checking that no open event exists. Once resolved, the ESP32
            // sending more high readings will NOT create new events — only a clean
            // reading followed by a new spike will trigger a fresh alert.
            const [openEvents] = await db.query(
                `SELECT id, event_status FROM detection_events
                 WHERE node_id = ? AND event_status IN ('Detected', 'Acknowledged')
                 LIMIT 1`,
                [node.id]
            );

            if (!openEvents.length) {
                // Check if the node has had a clean reading since the last Cleared event,
                // OR if there has never been any event — only then create a new one.
                const [lastCleared] = await db.query(
                    `SELECT resolved_at FROM detection_events
                     WHERE node_id = ? AND event_status = 'Cleared'
                     ORDER BY resolved_at DESC LIMIT 1`,
                    [node.id]
                );

                let shouldCreateEvent = true;

                if (lastCleared.length) {
                    // There was a previous Cleared event. Only allow a new alert if
                    // there has been at least one clean reading (pm2_5 <= 35.4) after
                    // that resolved_at time. This prevents immediate re-triggering.
                    const [cleanReadings] = await db.query(
                        `SELECT id FROM sensor_readings
                         WHERE node_id = ? AND smoke_detected = 0
                           AND recorded_at > ?
                         LIMIT 1`,
                        [node.id, lastCleared[0].resolved_at]
                    );
                    shouldCreateEvent = cleanReadings.length > 0;
                }

                if (shouldCreateEvent) {
                    const [eventResult] = await db.query(
                        `INSERT INTO detection_events
                            (node_id, reading_id, location_name, pm2_5_value, aqi_value, aqi_category)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [node.id, result.insertId, node.location_name, pm2_5, aqi, category]
                    );

                    // Notify all admins
                    const [admins] = await db.query(
                        `SELECT full_name, email FROM accounts
                         WHERE position = 'Administrator' AND is_active = 1`
                    );

                    const pm1ForEmail = pm1_0 !== undefined && pm1_0 !== null && !Number.isNaN(Number(pm1_0))
                        ? Number(pm1_0)
                        : null;

                    for (const admin of admins) {
                        await db.query(
                            `INSERT INTO push_notifications
                                (event_id, recipient_email, recipient_name, subject, send_status)
                             VALUES (?, ?, ?, ?, 'pending')`,
                            [eventResult.insertId, admin.email, admin.full_name,
                             `🚨 Vape/Smoke Detected — ${node.location_name}`]
                        );
                        try {
                            await sendAlertEmail(admin.email, admin.full_name, node.location_name, pm1ForEmail, category);
                            await db.query(
                                `UPDATE push_notifications SET send_status='sent', sent_at=NOW()
                                 WHERE recipient_email=? AND event_id=? AND send_status='pending'`,
                                [admin.email, eventResult.insertId]
                            );
                        } catch (mailErr) {
                            await db.query(
                                `UPDATE push_notifications SET send_status='failed', error_message=?
                                 WHERE recipient_email=? AND event_id=? AND send_status='pending'`,
                                [mailErr.message, admin.email, eventResult.insertId]
                            );
                        }
                    }

                    try {
                        const pm1Push = pm1ForEmail != null ? `${pm1ForEmail.toFixed(1)}` : '—';
                        await sendPushToAll(
                            '🚨 Vape/Smoke Detected!',
                            `Alert at ${node.location_name} — PM1.0: ${pm1Push} µg/m³ (${category})`,
                            '/dashboard.html'
                        );
                    } catch (pushErr) {
                        console.warn('[push] Web push failed:', pushErr.message);
                    }
                }
                // else: last event was Cleared but no clean reading yet — silently skip
            } else {
                // Open event exists — just update its latest values, never change status
                await db.query(
                    `UPDATE detection_events
                     SET pm2_5_value = ?, aqi_value = ?, aqi_category = ?, reading_id = ?
                     WHERE id = ?`,
                    [pm2_5, aqi, category, result.insertId, openEvents[0].id]
                );
            }
        }
        // NOTE: We do NOT auto-clear events when air is clean.
        // Only a human clicking Resolve clears an event. The ESP32
        // returning to clean air simply stops updating the open event,
        // and once resolved, a clean reading "unlocks" the next alert cycle.

        res.json({
            success: true,
            node: node.location_name,
            aqi,
            category,
            smoke_detected: smokeDetected,
            led_color: ledColor
        });

    } catch (err) {
        logger.error({ err }, '[readings POST] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/live ────────────────────────────────────
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
                SELECT id FROM sensor_readings
                WHERE node_id = sn.id ORDER BY recorded_at DESC LIMIT 1
            )
            WHERE sn.is_active = 1
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[readings GET /live] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/open-events ────────────────────────────
router.get('/open-events', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                de.id, de.location_name, de.pm2_5_value,
                de.aqi_value, de.aqi_category, de.event_status,
                de.detected_at, de.acknowledged_at,
                sn.node_code, sn.location_name AS sensor_location
            FROM detection_events de
            JOIN sensor_nodes sn ON sn.id = de.node_id
            WHERE de.event_status IN ('Detected', 'Acknowledged')
            ORDER BY de.detected_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[readings GET /open-events] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/readings/acknowledge/:eventId ───────────────────
// Accessible to any logged-in user (admin OR staff) — removed adminOnly
router.post('/acknowledge/:eventId', authMiddleware, async (req, res) => {
    const eventId = parseInt(req.params.eventId, 10);
    const { notes } = req.body;

    if (isNaN(eventId) || eventId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid event ID.' });
    }

    try {
        const [updated] = await db.query(
            `UPDATE detection_events
             SET event_status = 'Acknowledged',
                 acknowledged_at = NOW(),
                 acknowledged_by = ?,
                 notes = COALESCE(?, notes)
             WHERE id = ? AND event_status = 'Detected'`,
            [req.user.id, notes || null, eventId]
        );

        if (updated.affectedRows === 0) {
            // Already acknowledged or resolved — still return success (idempotent)
            return res.json({ success: true, message: 'Already acknowledged or resolved.' });
        }

        await db.query(
            `INSERT INTO system_logs (account_id, action, description, ip_address)
             VALUES (?, 'Alert Acknowledged', ?, ?)`,
            [req.user.id, `Event #${eventId} acknowledged by user #${req.user.id}`, req.ip]
        );

        res.json({ success: true, message: 'Alert acknowledged.', event_id: eventId });
    } catch (err) {
        console.error('[acknowledge] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/readings/resolve/:eventId ───────────────────────
// Any logged-in user (admin or staff) can mark as resolved
router.post('/resolve/:eventId', authMiddleware, async (req, res) => {
    const eventId = parseInt(req.params.eventId, 10);
    const { notes } = req.body;

    if (isNaN(eventId) || eventId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid event ID.' });
    }

    try {
        const [updated] = await db.query(
            `UPDATE detection_events
             SET event_status    = 'Cleared',
                 resolved_at     = NOW(),
                 acknowledged_at = COALESCE(acknowledged_at, NOW()),
                 acknowledged_by = COALESCE(acknowledged_by, ?),
                 notes           = COALESCE(?, notes)
             WHERE id = ? AND event_status IN ('Detected', 'Acknowledged')`,
            [req.user.id, notes || null, eventId]
        );

        if (updated.affectedRows === 0) {
            // Already cleared — idempotent success
            return res.json({ success: true, message: 'Already resolved.' });
        }

        await db.query(
            `INSERT INTO system_logs (account_id, action, description, ip_address)
             VALUES (?, 'Alert Resolved', ?, ?)`,
            [req.user.id, `Event #${eventId} resolved by user #${req.user.id}`, req.ip]
        );

        res.json({ success: true, message: 'Alert resolved.' });
    } catch (err) {
        console.error('[resolve] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
