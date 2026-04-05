// ============================================================
//  api/auth.js — Login, Register, OTP, Password Reset
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const router   = express.Router();
const db       = require('../db');
const { sendOTPEmail } = require('../mailer');

const otpStore = new Map();

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getFailedAttempts(email) {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count FROM login_attempts
         WHERE email = ? AND success = 0
         AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
        [email]
    );
    return rows[0].count;
}

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ success: false, message: 'Email and password are required.' });

    try {
        const fails = await getFailedAttempts(email);
        if (fails >= 5)
            return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again in 15 minutes.' });

        const [rows] = await db.query(
            'SELECT * FROM accounts WHERE email = ? AND is_active = 1', [email]
        );
        const user  = rows[0];
        const valid = user && await bcrypt.compare(password, user.password_hash);

        await db.query(
            'INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, ?)',
            [email, req.ip, valid ? 1 : 0]
        );

        if (!valid)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        await db.query('UPDATE accounts SET last_login = NOW() WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, position: user.position, name: user.full_name },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        const { password_hash, ...safeUser } = user;
        return res.json({ success: true, token, user: safeUser });

    } catch (err) {
        console.error('[login] Error:', err.message, err.code || '');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/send-otp ───────────────────────────────────
router.post('/send-otp', async (req, res) => {
    const { email, type, name, employeeId, contact, position, password } = req.body;
    if (!email || !type)
        return res.status(400).json({ success: false, message: 'Email and type are required.' });

    try {
        const otp     = generateCode();
        const expires = Date.now() + 60 * 1000;

        otpStore.set(email, {
            otp, expires, type,
            userData: type === 'signup' ? { name, employeeId, contact, position, password } : null
        });

        // Send email — fail loudly if it doesn't work
        try {
            await sendOTPEmail(email, name || 'User', otp, type);
            console.log(`[send-otp] Email sent to ${email}`);
        } catch (mailErr) {
            console.error('[send-otp] Email failed:', mailErr.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP email. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: `OTP sent to ${email}`
        });

    } catch (err) {
        console.error('[send-otp] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────
router.post('/verify-otp', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp)
        return res.status(400).json({ success: false, message: 'Email and OTP are required.' });

    const stored = otpStore.get(email);
    if (!stored)
        return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
    if (Date.now() > stored.expires) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }
    if (stored.otp !== otp)
        return res.status(400).json({ success: false, message: 'Incorrect OTP code.' });

    otpStore.delete(email);

    try {
        if (stored.type === 'signup') {
            const { name, employeeId, contact, position, password } = stored.userData;
            const hash = await bcrypt.hash(password, 12);
            await db.query(
                `INSERT INTO accounts
                    (employee_id, full_name, email, contact_number, position, password_hash, date_joined)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [employeeId, name, email, contact, position, hash]
            );
            return res.json({ success: true, message: 'Account created successfully! You can now log in.' });
        }
        if (stored.type === 'reset') {
            if (!newPassword || newPassword.length < 8)
                return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
            const hash = await bcrypt.hash(newPassword, 12);
            await db.query('UPDATE accounts SET password_hash = ? WHERE email = ?', [hash, email]);
            return res.json({ success: true, message: 'Password updated successfully!' });
        }
    } catch (err) {
        console.error('[verify-otp] DB error:', err.message, err.code || '');
        let message = 'Server error.';
        if (err.code === 'ER_DUP_ENTRY') {
            message = 'An account with this email or employee ID already exists.';
        } else if (err.code === 'ER_NO_SUCH_TABLE') {
            message = 'Database setup error. Please contact support.';
        }
        res.status(500).json({ success: false, message });
    }
});

module.exports = router;
