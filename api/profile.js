// ============================================================
//  api/profile.js — View & update user profile, change password
// ============================================================
const express = require('express');
const bcrypt  = require('bcrypt');
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
    const emergency_contact = sanitizeStr(req.body.emergency_contact, 100);
    const photo_url        = typeof req.body.photo_url === 'string'
        ? req.body.photo_url.slice(0, 500000) // Allow base64 photos up to ~375KB
        : null;

    if (!full_name || full_name.length < 2)
        return res.status(400).json({ success: false, message: 'Full name must be at least 2 characters.' });

    if (contact_number && !isValidPhone(contact_number))
        return res.status(400).json({ success: false, message: 'Invalid contact number format.' });

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

// ── DELETE /api/profile ───────────────────────────────────
// SOFT DELETE — marks account as inactive with 30-day recovery window
router.delete('/', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT email FROM accounts WHERE id = ? AND is_active = 1', [req.user.id]);
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Account not found.' });

        await db.query(
            `UPDATE accounts SET is_active = 0, deleted_at = NOW(), deletion_reason = 'user_request' WHERE id = ?`,
            [req.user.id]
        );

        res.json({ success: true, message: 'Account deactivated. You have 30 days to recover it by contacting support.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/profile/hard-delete ──────────────────────────
// GDPR RIGHT TO ERASURE — permanently deletes all user data
router.post('/hard-delete', authMiddleware, async (req, res) => {
    const confirmation = typeof req.body.confirmation === 'string' ? req.body.confirmation : '';

    if (confirmation !== 'DELETE MY DATA PERMANENTLY')
        return res.status(400).json({
            success: false,
            message: 'Please provide confirmation: "DELETE MY DATA PERMANENTLY"'
        });

    try {
        const [rows] = await db.query('SELECT email FROM accounts WHERE id = ?', [req.user.id]);
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Account not found.' });

        const userId = req.user.id;
        const email = rows[0].email;
        let deletedCount = 0;

        // Delete push subscriptions
        const [pushSubResult] = await db.query('DELETE FROM push_subscriptions WHERE account_id = ?', [userId]);
        deletedCount += pushSubResult.affectedRows || 0;

        // Delete device login alerts
        const [deviceAlertResult] = await db.query('DELETE FROM device_login_alerts WHERE account_id = ?', [userId]);
        deletedCount += deviceAlertResult.affectedRows || 0;

        // Delete known devices
        const [knownDevResult] = await db.query('DELETE FROM known_devices WHERE account_id = ?', [userId]);
        deletedCount += knownDevResult.affectedRows || 0;

        // Delete push notifications by email
        const [pushNotifResult] = await db.query('DELETE FROM push_notifications WHERE recipient_email = ?', [email]);
        deletedCount += pushNotifResult.affectedRows || 0;

        // Anonymize detection events (remove acknowledged_by link)
        await db.query('UPDATE detection_events SET acknowledged_by = NULL WHERE acknowledged_by = ?', [userId]);

        // Delete login attempts
        const [loginAttemptResult] = await db.query('DELETE FROM login_attempts WHERE email = ?', [email]);
        deletedCount += loginAttemptResult.affectedRows || 0;

        // Delete system logs
        const [sysLogResult] = await db.query('DELETE FROM system_logs WHERE account_id = ?', [userId]);
        deletedCount += sysLogResult.affectedRows || 0;

        // Delete contact tickets
        const [ticketResult] = await db.query('DELETE FROM contact_tickets WHERE account_id = ?', [userId]);
        deletedCount += ticketResult.affectedRows || 0;

        // Hard delete the account
        const [accountResult] = await db.query('DELETE FROM accounts WHERE id = ?', [userId]);
        deletedCount += accountResult.affectedRows || 0;

        // Log to audit table
        await db.query(
            `INSERT INTO data_retention_audit (table_name, records_deleted, retention_days_applied, cutoff_date, status, executed_by, error_message)
             VALUES ('accounts', ?, 0, NOW(), 'completed', 'gdpr_api', ?)`,
            [deletedCount, `User data erased for: ${email}`]
        );

        res.json({ success: true, message: `All personal data permanently erased. ${deletedCount} records deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error during data erasure.' });
    }
});

module.exports = router;
