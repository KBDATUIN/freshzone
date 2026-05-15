// ============================================================
//  api/readings.js — Sensor data from ESP32 + live dashboard
//  PM1.0 ONLY — pm2.5 / pm10 from external sources are BLOCKED
// ============================================================
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendAlertEmail } = require('../mailer');
const { sendPushToAll }  = require('./push');
const { verifyNodeHmac } = require('../middleware/device-auth');
const logger = require('../logger');

// ── SSE client registry ──────────────────────────────────────
// Map of res objects keyed by a unique client ID
const sseClients = new Map();
let sseClientId = 0;

function broadcastSSE(data) {
    const payload = 'data: ' + JSON.stringify(data) + '\n\n';
    for (const [, res] of sseClients) {
        try { res.write(payload); } catch (_) {}
    }
}

// ── PM1.0 AQI Calculator ─────────────────────────────────────
// FreshZone uses PM1.0 thresholds aligned with ESP32 firmware:
//   PM1_TRIGGER = 35   → "Good"     (≤35 µg/m³ — clean air / normal)
//   PM1_HEAVY   = 80   → "Moderate" (35–80 µg/m³ — vape aerosol detected)
//   > 80               → "Unhealthy" and above (heavy vape cloud)
function calculatePM1Category(pm1) {
    if (pm1 <= 35)  return { aqi: Math.round((50  / 35)   * pm1),                        category: 'Good' };
    if (pm1 <= 80)  return { aqi: Math.round(((100-51)/(80-35.1)) * (pm1-35.1) + 51),   category: 'Moderate' };
    if (pm1 <= 120) return { aqi: Math.round(((150-101)/(120-80.5)) * (pm1-80.5) + 101), category: 'Unhealthy for Sensitive Groups' };
    if (pm1 <= 200) return { aqi: Math.round(((200-151)/(200-120.5)) * (pm1-120.5) + 151), category: 'Unhealthy' };
    if (pm1 <= 300) return { aqi: Math.round(((300-201)/(300-200.5)) * (pm1-200.5) + 201), category: 'Very Unhealthy' };
    return { aqi: Math.min(500, Math.round(((500-301)/(500.4-300.5)) * (pm1-300.5) + 301)), category: 'Hazardous' };
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

    // ── BLOCK pm2.5 / pm10 primary submissions ──────────────────
    // This system only accepts PM1.0 as the detection metric.
    // If a device sends pm2_5 or pm10 without pm1_0, it is rejected.
    const hasPm1  = req.body.pm1_0  !== undefined && req.body.pm1_0  !== null && req.body.pm1_0  !== '';
    const hasPm25 = req.body.pm2_5  !== undefined && req.body.pm2_5  !== null && req.body.pm2_5  !== '';
    const hasPm10 = req.body.pm10   !== undefined && req.body.pm10   !== null && req.body.pm10   !== '';

    if (!hasPm1) {
        logger.warn({ body: req.body }, 'Reading rejected: pm1_0 is required — this system only accepts PM1.0 readings');
        return res.status(400).json({ success: false, message: 'pm1_0 is required. This system only accepts PM1.0 sensor readings.' });
    }

    if (hasPm25 && !hasPm1) {
        logger.warn({ body: req.body }, 'Reading blocked: pm2_5 submitted without pm1_0');
        return res.status(400).json({ success: false, message: 'pm2_5-only submissions are not accepted. Send pm1_0 only.' });
    }

    if (hasPm10 && !hasPm1) {
        logger.warn({ body: req.body }, 'Reading blocked: pm10 submitted without pm1_0');
        return res.status(400).json({ success: false, message: 'pm10-only submissions are not accepted. Send pm1_0 only.' });
    }

    // --- Parse & coerce values from ESP32 (may arrive as strings) ---
    const node_code = req.body.node_code;
    const pm1_0  = Number(req.body.pm1_0);
    // pm2_5 and pm10 are stored if present (for historical reference) but do NOT affect detection
    const pm2_5  = hasPm25 ? Number(req.body.pm2_5) : null;
    const pm10   = hasPm10 ? Number(req.body.pm10)  : null;

    // ── ESP32 spike-filtered detection result ────────────────────
    // The ESP32 firmware runs an EMA baseline + spike threshold filter
    // (SPIKE_THRESHOLD=25, CONFIRM_TIME=6000ms) before deciding if vape
    // is truly present. We trust that result when it is provided so the
    // server never false-triggers on slow ambient dust rises.
    // If vape_detected is not sent (old firmware), fall back to the raw
    // pm1_0 > 35 threshold so nothing breaks for other nodes.
    const hasVapeFlag   = req.body.vape_detected !== undefined && req.body.vape_detected !== null && req.body.vape_detected !== '';
    const vapeFlagValue = hasVapeFlag ? (req.body.vape_detected === true || req.body.vape_detected === 'true' || req.body.vape_detected === 1 || req.body.vape_detected === '1') : null;

    // --- Validation ---
    if (!node_code || typeof node_code !== 'string' || node_code.trim().length === 0) {
        logger.warn({ body: req.body }, 'Reading rejected: Missing node_code');
        return res.status(400).json({ success: false, message: 'Invalid node_code.' });
    }
    if (node_code.length > 50) {
        return res.status(400).json({ success: false, message: 'Invalid node_code.' });
    }
    // PM1.0 is the only required, validated detection metric
    if (!isValidReading(pm1_0, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm1_0 must be a number between 0 and 1000.' });
    }
    // pm2_5 and pm10 optional — validate only if present, but they do NOT drive detection
    if (pm2_5 !== null && !isValidReading(pm2_5, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm2_5 must be 0–1000 if provided.' });
    }
    if (pm10 !== null && !isValidReading(pm10, 0, 1000)) {
        return res.status(400).json({ success: false, message: 'pm10 must be 0–1000 if provided.' });
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

        // ── Detection: trust ESP32 spike-filtered result ────────────
        // The firmware runs EMA baseline + SPIKE_THRESHOLD=25 +
        // CONFIRM_TIME=6000ms before setting vape_detected=true.
        // We use that flag when present so the server never false-triggers
        // on slow ambient dust.  Old nodes without the flag fall back to
        // the raw pm1_0 > 35 threshold so nothing breaks.
        const { aqi, category } = calculatePM1Category(pm1_0);
        const smokeDetected = hasVapeFlag ? vapeFlagValue : (pm1_0 > 35);
        // DB ENUM only has 'green'/'red' — frontend derives orange from pm1_0
        const ledColor    = smokeDetected ? 'red' : 'green';
        const ledColorSSE = smokeDetected ? (pm1_0 > 80 ? 'red' : 'orange') : 'green';

        // --- Save reading (pm2_5 / pm10 stored as null if not sent) ---
        const [result] = await db.query(
            `INSERT INTO sensor_readings
                (node_id, pm1_0, pm2_5, pm10, aqi_value, aqi_category, smoke_detected, led_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [node.id, pm1_0, pm2_5, pm10, aqi, category, smokeDetected ? 1 : 0, ledColor]
        );

        await db.query('UPDATE sensor_nodes SET last_seen = NOW() WHERE id = ?', [node.id]);

        if (smokeDetected) {
            // ── KEY FIX: Only create a new alert if there is NO open event at all.
            // 'Detected'    → still waiting for acknowledgement
            // 'Acknowledged'→ staff saw it, still in progress
            // 'Cleared'     → already resolved — do NOT re-trigger until a clean
            //                 reading has come in first (handled by the reset flag below)
            const [openEvents] = await db.query(
                `SELECT id, event_status FROM detection_events
                 WHERE node_id = ? AND event_status IN ('Detected', 'Acknowledged')
                 LIMIT 1`,
                [node.id]
            );

            if (!openEvents.length) {
                const [lastCleared] = await db.query(
                    `SELECT resolved_at FROM detection_events
                     WHERE node_id = ? AND event_status = 'Cleared'
                     ORDER BY resolved_at DESC LIMIT 1`,
                    [node.id]
                );

                let shouldCreateEvent = true;

                if (lastCleared.length) {
                    // Allow new alert only if there has been at least one clean
                    // PM1.0 reading (pm1_0 <= 35) since the last resolved event.
                    const [cleanReadings] = await db.query(
                        `SELECT id FROM sensor_readings
                         WHERE node_id = ? AND smoke_detected = 0
                           AND recorded_at >= ?
                         LIMIT 1`,
                        [node.id, new Date(lastCleared[0].resolved_at)]
                    );
                    shouldCreateEvent = cleanReadings.length > 0;
                }

                if (shouldCreateEvent) {
                    const [eventResult] = await db.query(
                        `INSERT INTO detection_events
                            (node_id, reading_id, location_name, pm2_5_value, aqi_value, aqi_category)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        // pm2_5_value column stores pm1_0 here (legacy column name, PM1.0 value)
                        [node.id, result.insertId, node.location_name, pm1_0, aqi, category]
                    );

                    // Notify all admins
                    const [admins] = await db.query(
                        `SELECT full_name, email FROM accounts
                         WHERE position = 'Administrator' AND is_active = 1`
                    );

                    for (const admin of admins) {
                        await db.query(
                            `INSERT INTO push_notifications
                                (event_id, recipient_email, recipient_name, subject, send_status)
                             VALUES (?, ?, ?, ?, 'pending')`,
                            [eventResult.insertId, admin.email, admin.full_name,
                             `🚨 Vape/Smoke Detected — ${node.location_name}`]
                        );
                        try {
                            await sendAlertEmail(admin.email, admin.full_name, node.location_name, pm1_0, category);
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
                        await sendPushToAll(
                            `🚨 Alert: ${node.location_name}`,
                            `Vape/Smoke detected! PM1.0: ${pm1_0.toFixed(1)} µg/m³ (${category})`,
                            'dashboard.html'
                        );
                    } catch (pushErr) {
                        console.warn('[push] Web push failed:', pushErr.message);
                    }
                }
                // else: last event was Cleared but no clean reading yet — silently skip
            } else {
                // Open event exists — update its latest PM1.0 values
                await db.query(
                    `UPDATE detection_events
                     SET pm2_5_value = ?, aqi_value = ?, aqi_category = ?, reading_id = ?
                     WHERE id = ?`,
                    [pm1_0, aqi, category, result.insertId, openEvents[0].id]
                );
            }
        }
        // NOTE: We do NOT auto-clear events when air is clean.
        // Only a human clicking Resolve clears an event.

        res.json({
            success: true,
            node: node.location_name,
            aqi,
            category,
            smoke_detected: smokeDetected,
            led_color: ledColorSSE
        });

        // Push latest reading to all connected SSE clients (PM1.0 only in payload)
        broadcastSSE({
            node_code:      node.node_code,
            location_name:  node.location_name,
            pm1_0,
            aqi_value:      aqi,
            aqi_category:   category,
            smoke_detected: smokeDetected,
            led_color:      ledColorSSE,
            recorded_at:    new Date().toISOString(),
            node_active:    1,
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
                sr.pm1_0,
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
        logger.error({ err }, '[readings GET /live] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/readings/stream ─────────────────────────────────
// SSE endpoint — browsers connect here to receive real-time sensor pushes
router.get('/stream', authMiddleware, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = ++sseClientId;
    sseClients.set(clientId, res);

    // Send initial confirmation so the browser knows the stream is open
    res.write('event: connected\ndata: {"clientId":' + clientId + '}\n\n');

    // Clean up when the browser disconnects
    req.on('close', () => {
        sseClients.delete(clientId);
    });
});

// ── GET /api/readings/open-events ────────────────────────────
router.get('/open-events', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                de.id, de.location_name,
                de.pm2_5_value  AS pm1_0_value,
                de.aqi_value, de.aqi_category, de.event_status,
                de.detected_at, de.acknowledged_at,
                de.acknowledged_by,
                sn.node_code, sn.location_name AS sensor_location
            FROM detection_events de
            JOIN sensor_nodes sn ON sn.id = de.node_id
            WHERE de.event_status IN ('Detected', 'Acknowledged')
            ORDER BY de.detected_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        logger.error({ err }, '[readings GET /open-events] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/readings/acknowledge/:eventId ───────────────────
// Accessible to any logged-in user (admin OR staff)
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

        // Broadcast SSE so all open tabs/browsers update instantly
        broadcastSSE({
            type:       'event_update',
            event_id:   eventId,
            event_status: 'Acknowledged',
            acknowledged_by: req.user.id,
        });

        res.json({ success: true, message: 'Alert acknowledged.', event_id: eventId });
    } catch (err) {
        logger.error({ err }, '[acknowledge] Error');
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

        // Broadcast SSE so all open tabs/browsers update instantly
        broadcastSSE({
            type:       'event_update',
            event_id:   eventId,
            event_status: 'Cleared',
            resolved_by: req.user.id,
        });

        res.json({ success: true, message: 'Alert resolved.' });
    } catch (err) {
        logger.error({ err }, '[resolve] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
