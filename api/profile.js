// ============================================================
//  api/profile.js — View & update user profile, change password
// ============================================================
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

function sanitizeStr(val, maxLen = 100) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen);
}

function isValidPhone(phone) {
    if (!phone) return true;
    return /^[0-9+\-\s()]{7,20}$/.test(phone);
}

function isValidPassword(pw) {
    return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128
        && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

// ── GET /api/profile ──────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, employee_id, full_name, email, contact_number,
                    position, photo_url, emergency_contact,
                    date_joined, last_login
             FROM accounts WHERE id = ? AND is_active = 1`,
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
    const full_name        = sanitizeStr(req.body.full_name, 100);
    const contact_number   = sanitizeStr(req.body.contact_number, 20);
    const emergency_contact = sanitizeStr(req.body.emergency_contact, 20);
    const photo_url        = typeof req.body.photo_url === 'string'
        ? req.body.photo_url.slice(0, 500000) // Allow base64 photos up to ~375KB
        : null;

    if (!full_name || full_name.length < 2)
        return res.status(400).json({ success: false, message: 'Full name must be at least 2 characters.' });

    if (contact_number && !isValidPhone(contact_number))
        return res.status(400).json({ success: false, message: 'Invalid contact number format.' });

    if (emergency_contact && !isValidPhone(emergency_contact))
        return res.status(400).json({ success: false, message: 'Invalid emergency contact format.' });

    try {
        await db.query(
            `UPDATE accounts
             SET full_name = ?, contact_number = ?, emergency_contact = ?,
                 photo_url = ?, updated_at = NOW()
             WHERE id = ? AND is_active = 1`,
            [full_name, contact_number || null, emergency_contact || null, photo_url || null, req.user.id]
        );
        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/profile/change-password ────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
    const current_password = typeof req.body.current_password === 'string' ? req.body.current_password.slice(0, 128) : '';
    const new_password     = typeof req.body.new_password === 'string' ? req.body.new_password.slice(0, 128) : '';

    if (!current_password || !new_password)
        return res.status(400).json({ success: false, message: 'Both fields are required.' });

    if (!isValidPassword(new_password))
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters with at least one letter and one number.' });

    if (current_password === new_password)
        return res.status(400).json({ success: false, message: 'New password must be different from current password.' });

    try {
        const [rows] = await db.query('SELECT password_hash FROM accounts WHERE id = ? AND is_active = 1', [req.user.id]);
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Account not found.' });

        const valid = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!valid)
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

        const hash = await bcrypt.hash(new_password, 12);
        await db.query('UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, req.user.id]);

        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
