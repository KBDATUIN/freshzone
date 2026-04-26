// ============================================================
//  api/calibration.js — Sensor calibration (offset + coefficient)
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const logger  = require('../logger');

// Ensure calibration columns exist (idempotent, runs once on startup)
async function ensureCalibrationColumns() {
    try {
        await db.query(`
            ALTER TABLE sensor_nodes
            ADD COLUMN IF NOT EXISTS cal_offset  FLOAT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cal_coeff   FLOAT NOT NULL DEFAULT 1
        `);
    } catch (err) {
        // MySQL < 8 doesn't support IF NOT EXISTS on ALTER — ignore duplicate column errors
        if (err.code !== 'ER_DUP_FIELDNAME') {
            logger.warn({ err }, '[calibration] Could not ensure columns (non-fatal)');
        }
    }
}
ensureCalibrationColumns();

// ── GET /api/calibration — list all nodes with calibration values ──
router.get('/', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, node_code, location_name,
                    COALESCE(cal_offset, 0) AS cal_offset,
                    COALESCE(cal_coeff,  1) AS cal_coeff
             FROM sensor_nodes WHERE is_active = 1 ORDER BY id`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        logger.error({ err }, '[calibration GET] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PUT /api/calibration/:nodeCode — update calibration (admin only) ──
router.put('/:nodeCode', authMiddleware, adminOnly, async (req, res) => {
    const nodeCode = req.params.nodeCode?.trim();
    const offset   = parseFloat(req.body.cal_offset);
    const coeff    = parseFloat(req.body.cal_coeff);

    if (!nodeCode) {
        return res.status(400).json({ success: false, message: 'Invalid node code.' });
    }
    if (isNaN(offset) || offset < -500 || offset > 500) {
        return res.status(400).json({ success: false, message: 'Offset must be between -500 and 500.' });
    }
    if (isNaN(coeff) || coeff <= 0 || coeff > 10) {
        return res.status(400).json({ success: false, message: 'Coefficient must be between 0.01 and 10.' });
    }

    try {
        const [result] = await db.query(
            `UPDATE sensor_nodes SET cal_offset = ?, cal_coeff = ? WHERE node_code = ? AND is_active = 1`,
            [offset, coeff, nodeCode]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Node not found.' });
        }

        await db.query(
            `INSERT INTO system_logs (account_id, action, description, ip_address)
             VALUES (?, 'Sensor Calibrated', ?, ?)`,
            [req.user.id, `Node ${nodeCode} calibrated: offset=${offset}, coeff=${coeff} by user #${req.user.id}`, req.ip]
        );

        res.json({ success: true, message: 'Calibration saved.', node_code: nodeCode, cal_offset: offset, cal_coeff: coeff });
    } catch (err) {
        logger.error({ err }, '[calibration PUT] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
