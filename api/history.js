// ============================================================
//  api/history.js — Detection history log
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ── GET /api/history ──────────────────────────────────────────
// Returns combined history log (events + system logs)
router.get('/', authMiddleware, async (req, res) => {
    const { search, status, date, limit = 200 } = req.query;

    try {
        let query = 'SELECT * FROM v_history_log WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (location LIKE ? OR action LIKE ? OR handled_by LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (date) {
            query += ' AND DATE(datetime) = ?';
            params.push(date);
        }

        query += ` ORDER BY datetime DESC LIMIT ${parseInt(limit)}`;

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/history/stats ────────────────────────────────────
// Summary counts for the stats boxes
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

module.exports = router;
