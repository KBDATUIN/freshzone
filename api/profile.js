// ============================================================
//  api/profile.js — View & update user profile, change password
// ============================================================
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ── GET /api/profile ──────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, employee_id, full_name, email, contact_number,
                    position, photo_url, emergency_contact,
                    date_joined, last_login
             FROM accounts WHERE id = ?`,
            [req.user.id]
        );
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'User not found.' });

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PUT /api/profile ──────────────────────────────────────────
router.put('/', authMiddleware, async (req, res) => {
    const { full_name, contact_number, emergency_contact, photo_url } = req.body;

    if (!full_name)
        return res.status(400).json({ success: false, message: 'Full name is required.' });

    try {
        await db.query(
            `UPDATE accounts
             SET full_name = ?, contact_number = ?, emergency_contact = ?,
                 photo_url = ?, updated_at = NOW()
             WHERE id = ?`,
            [full_name, contact_number || null, emergency_contact || null, photo_url || null, req.user.id]
        );
        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/profile/change-password ────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password)
        return res.status(400).json({ success: false, message: 'Both fields are required.' });

    if (new_password.length < 8)
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });

    try {
        const [rows] = await db.query('SELECT password_hash FROM accounts WHERE id = ?', [req.user.id]);
        const valid  = await bcrypt.compare(current_password, rows[0].password_hash);

        if (!valid)
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

        if (current_password === new_password)
            return res.status(400).json({ success: false, message: 'New password must be different.' });

        const hash = await bcrypt.hash(new_password, 12);
        await db.query('UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, req.user.id]);

        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
