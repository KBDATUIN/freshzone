// ============================================================
//  api/history.js — Detection history log (PM1.0 only)
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const logger  = require('../logger');

// ── GET /api/history ──────────────────────────────────────────
// Returns full detection event history with all timestamps
router.get('/', authMiddleware, async (req, res) => {
    const search = req.query.search ? String(req.query.search).slice(0, 100) : '';
    const status = req.query.status ? String(req.query.status).slice(0, 30) : '';
    const date   = req.query.date   ? String(req.query.date).slice(0, 10) : '';
    const safeLimit = Math.min(Math.max(parseInt(req.query.limit) || 200, 1), 500);

    try {
        // pm2_5_value column stores the PM1.0 value at time of detection
        // (legacy column name — the value recorded is always PM1.0)
        let query = `
            SELECT
                de.id,
                de.location_name                                          AS location,
                de.event_status                                           AS status,
                de.pm2_5_value                                            AS pm1_0_value,
                de.aqi_value,
                de.aqi_category,
                de.notes,

                -- Raw UTC timestamps — frontend converts to Asia/Manila via toLocaleString
                de.detected_at,
                de.acknowledged_at,
                de.resolved_at,

                -- Who acknowledged
                ack.full_name                                             AS acknowledged_by_name,

                -- Response time in SECONDS (detected → acknowledged) for accuracy
                CASE
                    WHEN de.acknowledged_at IS NOT NULL AND de.detected_at IS NOT NULL
                    THEN TIMESTAMPDIFF(SECOND, de.detected_at, de.acknowledged_at)
                    ELSE NULL
                END AS response_seconds,

                -- Resolution time in SECONDS (detected → resolved) for accuracy
                CASE
                    WHEN de.resolved_at IS NOT NULL AND de.detected_at IS NOT NULL
                    THEN TIMESTAMPDIFF(SECOND, de.detected_at, de.resolved_at)
                    ELSE NULL
                END AS resolution_seconds

            FROM detection_events de
            LEFT JOIN accounts ack ON ack.id = de.acknowledged_by
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ' AND (de.location_name LIKE ? OR de.event_status LIKE ? OR ack.full_name LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like);
        }
        if (status) {
            query += ' AND de.event_status = ?';
            params.push(status);
        }
        if (date) {
            query += " AND DATE(CONVERT_TZ(de.detected_at, '+00:00', '+08:00')) = ?";
            params.push(date);
        }

        query += ` ORDER BY de.detected_at DESC LIMIT ${safeLimit}`;

        const [rows] = await db.query(query, params);

        const formatted = rows.map(r => {
            const toISO = (v) => {
                if (!v) return null;
                if (v instanceof Date) return v.toISOString();
                return new Date(String(v).replace(' ', 'T') + 'Z').toISOString();
            };
            const detectedAt     = toISO(r.detected_at);
            const acknowledgedAt = toISO(r.acknowledged_at);
            const resolvedAt     = toISO(r.resolved_at);

            let response = '—';
            if (r.notes) {
                response = r.notes;
            } else if (r.status === 'Cleared') {
                response = 'Resolved';
            } else if (r.status === 'Acknowledged') {
                response = 'Acknowledged — awaiting resolution';
            } else {
                response = 'Pending';
            }

            return {
                id:               r.id,
                location:         r.location || '—',
                status:           r.status,
                pm1_0:            r.pm1_0_value,   // PM1.0 only — renamed from pm2_5
                aqi:              r.aqi_value,
                aqi_category:     r.aqi_category,
                notes:            r.notes,
                response:         response,
                handled_by:       r.acknowledged_by_name || '—',

                // All 3 timestamps as ISO strings (frontend converts to Manila time)
                detected_at:      detectedAt,
                acknowledged_at:  acknowledgedAt,
                resolved_at:      resolvedAt,

                // Response/resolution times in seconds (for accurate display)
                response_seconds:   r.response_seconds,
                resolution_seconds: r.resolution_seconds,

                // Legacy field for filters
                datetime:         detectedAt,
            };
        });

        res.json({ success: true, data: formatted });

    } catch (err) {
        logger.error({ err }, '[history] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/history/stats ────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const [[todayRow]] = await db.query(
            `SELECT COUNT(*) AS count FROM detection_events
             WHERE DATE(CONVERT_TZ(detected_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))`
        );
        const [[totalRow]] = await db.query(
            'SELECT COUNT(*) AS count FROM detection_events'
        );
        const [[resolvedRow]] = await db.query(
            "SELECT COUNT(*) AS count FROM detection_events WHERE event_status = 'Cleared'"
        );

        res.json({
            success: true,
            stats: {
                today:    todayRow.count,
                total:    totalRow.count,
                resolved: resolvedRow.count,
            }
        });
    } catch (err) {
        logger.error({ err }, '[history/stats] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── DELETE /api/history/clear-all (Admin only) ────────────────
router.delete('/clear-all', authMiddleware, adminOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM push_notifications');
        await db.query('DELETE FROM detection_events');
        await db.query('DELETE FROM sensor_readings');
        await db.query('DELETE FROM system_logs');
        await db.query('DELETE FROM login_attempts');
        res.json({ success: true, message: 'All history cleared successfully.' });
    } catch (err) {
        logger.error({ err }, '[clear-all] Error');
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;
