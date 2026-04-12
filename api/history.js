// ============================================================
//  api/history.js — Detection history log
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/history ──────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    const search = req.query.search ? String(req.query.search).slice(0, 100) : '';
    const status = req.query.status ? String(req.query.status).slice(0, 30) : '';
    const date   = req.query.date   ? String(req.query.date).slice(0, 10) : '';
    const limit  = req.query.limit  || 200;

    try {
        let query = 'SELECT * FROM v_history_log WHERE 1=1';
        const params = [];

        if (search.length > 0) {
            query += ' AND (location LIKE ? OR action LIKE ? OR handled_by LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like);
        }

        if (status.length > 0) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (date.length > 0) {
            query += ' AND DATE(datetime) = ?';
            params.push(date);
        }

        const safeLimit = Math.min(Math.max(parseInt(limit) || 200, 1), 500);
        query += ` ORDER BY datetime DESC LIMIT ${safeLimit}`;

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/history/stats ────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const [[todayRow]] = await db.query(
            "SELECT COUNT(*) AS count FROM detection_events WHERE DATE(detected_at) = CURDATE()"
        );
        const [[totalRow]] = await db.query(
            "SELECT COUNT(*) AS count FROM detection_events"
        );
        const [[resolvedRow]] = await db.query(
            "SELECT COUNT(*) AS count FROM detection_events WHERE event_status IN ('Acknowledged','Cleared')"
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
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── DELETE /api/history/clear-all ────────────────────────────
// Admin only — clears all detection events and sensor readings
router.delete('/clear-all', authMiddleware, adminOnly, async (req, res) => {
    try {
        await db.query("DELETE FROM push_notifications");
        await db.query("DELETE FROM detection_events");
        await db.query("DELETE FROM sensor_readings");
        await db.query("DELETE FROM system_logs");
        await db.query("DELETE FROM login_attempts");

        res.json({ success: true, message: 'All history cleared successfully.' });
    } catch (err) {
        console.error('[clear-all] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;
