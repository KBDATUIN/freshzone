// ============================================================
//  api/auth.js — Login, Register, OTP, Password Reset
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const router   = express.Router();
const db       = require('../db');
const { sendOTPEmail } = require('../mailer');

const otpStore   = new Map();
const otpAttempts = new Map(); // Track OTP guessing attempts

// ── Input sanitizers ─────────────────────────────────────────
function sanitizeStr(val, maxLen = 100) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen);
}

function isValidEmail(email) {
    return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

function isValidPassword(pw) {
    // Min 8 chars, at least one letter and one number
    return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128
        && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

function isValidPhone(phone) {
    if (!phone) return true; // optional — for signup
    return /^[0-9+\-\s()]{7,20}$/.test(phone);
}

// Strict phone check — for login identifier detection (must not be empty)
function looksLikePhone(val) {
    return val.length >= 7 && /^[0-9+\-\s()]+$/.test(val);
}

function generateCode() {
    // Cryptographically random 6-digit OTP
    const buf = require('crypto').randomBytes(3);
    return (parseInt(buf.toString('hex'), 16) % 900000 + 100000).toString();
}

async function getFailedAttempts(identifier) {
    // identifier can be email or phone — login_attempts stores the account email
    // so we look up the account first to get the canonical email
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count FROM login_attempts
         WHERE email = ? AND success = 0
         AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
        [identifier]
    );
    return rows[0].count;
}

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
    const identifier = sanitizeStr(req.body.email, 255); // accepts email or phone
    const password   = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';

    if (!identifier || !password)
        return res.status(400).json({ success: false, message: 'Email/phone and password are required.' });

    // Detect whether identifier is email or phone number
    const isEmail = isValidEmail(identifier);
    const isPhone = looksLikePhone(identifier) && !isEmail;

    if (!isEmail && !isPhone)
        return res.status(400).json({ success: false, message: 'Enter a valid email address or phone number.' });

    try {
        const fails = await getFailedAttempts(identifier);
        if (fails >= 5)
            return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again in 15 minutes.' });

        // Look up by email OR phone number
        const [rows] = await db.query(
            'SELECT * FROM accounts WHERE (email = ? OR contact_number = ?) AND is_active = 1',
            [identifier, identifier]
        );
        const user  = rows[0];
        const valid = user && await bcrypt.compare(password, user.password_hash);

        await db.query(
            'INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, ?)',
            [user ? user.email : identifier, req.ip, valid ? 1 : 0]
        );

        if (!valid)
            return res.status(401).json({ success: false, message: 'Invalid email/phone or password.' });

        if (!user.is_active)
            return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact an administrator.' });

        await db.query('UPDATE accounts SET last_login = NOW() WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, position: user.position, name: user.full_name },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        const { password_hash, ...safeUser } = user;
        return res.json({ success: true, token, user: safeUser });

    } catch (err) {
        console.error('[login] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/send-otp ───────────────────────────────────
router.post('/send-otp', async (req, res) => {
    const email    = sanitizeStr(req.body.email, 255);
    const type     = sanitizeStr(req.body.type, 20);
    const name     = sanitizeStr(req.body.name, 100);
    const employeeId = sanitizeStr(req.body.employeeId, 30);
    const contact  = sanitizeStr(req.body.contact, 20);
    const position = sanitizeStr(req.body.position, 50);
    const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';

    if (!email || !type)
        return res.status(400).json({ success: false, message: 'Email and type are required.' });

    if (!isValidEmail(email))
        return res.status(400).json({ success: false, message: 'Invalid email format.' });

    if (!['signup', 'reset'].includes(type))
        return res.status(400).json({ success: false, message: 'Invalid OTP type.' });

    // Validate signup fields
    if (type === 'signup') {
        if (!name || name.length < 2)
            return res.status(400).json({ success: false, message: 'Full name must be at least 2 characters.' });
        if (!employeeId || employeeId.length < 5)
            return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
        if (contact && !isValidPhone(contact))
            return res.status(400).json({ success: false, message: 'Invalid contact number format.' });
        if (!['Administrator', 'Staff / Teachers'].includes(position))
            return res.status(400).json({ success: false, message: 'Invalid position.' });
        if (!isValidPassword(password))
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with at least one letter and one number.' });

        // Check if email already registered
        const [existing] = await db.query('SELECT id FROM accounts WHERE email = ? OR employee_id = ?', [email, employeeId]);
        if (existing.length)
            return res.status(409).json({ success: false, message: 'An account with this email or employee ID already exists.' });
    }

    if (type === 'reset') {
        // Verify email exists before sending reset OTP
        const [existing] = await db.query('SELECT id FROM accounts WHERE email = ? AND is_active = 1', [email]);
        if (!existing.length)
            return res.status(404).json({ success: false, message: 'No active account found with this email.' });
    }

    // Rate limit OTP sends per email (max 3 per 10 minutes)
    const now = Date.now();
    const key = `otp_send_${email}`;
    const attempts = otpAttempts.get(key) || [];
    const recent = attempts.filter(t => now - t < 10 * 60 * 1000);
    if (recent.length >= 3) {
        return res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait 10 minutes.' });
    }
    otpAttempts.set(key, [...recent, now]);

    try {
        const otp     = generateCode();
        const expires = Date.now() + 60 * 1000;

        otpStore.set(email, {
            otp, expires, type,
            attempts: 0, // Track wrong OTP attempts
            userData: type === 'signup' ? { name, employeeId, contact, position, password } : null
        });

        try {
            await sendOTPEmail(email, name || 'User', otp, type);
            console.log(`[send-otp] Email sent to ${email}`);
        } catch (mailErr) {
            console.error('[send-otp] Email failed:', mailErr.message);
            return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again later.' });
        }

        res.json({ success: true, message: `OTP sent to ${email}` });

    } catch (err) {
        console.error('[send-otp] Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────
router.post('/verify-otp', async (req, res) => {
    const email       = sanitizeStr(req.body.email, 255);
    const otp         = sanitizeStr(req.body.otp, 10);
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword.slice(0, 128) : '';

    if (!email || !otp)
        return res.status(400).json({ success: false, message: 'Email and OTP are required.' });

    if (!isValidEmail(email))
        return res.status(400).json({ success: false, message: 'Invalid email.' });

    if (!/^\d{6}$/.test(otp))
        return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number.' });

    const stored = otpStore.get(email);
    if (!stored)
        return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });

    if (Date.now() > stored.expires) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    // Lock out after 5 wrong OTP attempts
    stored.attempts = (stored.attempts || 0) + 1;
    if (stored.attempts > 5) {
        otpStore.delete(email);
        return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    if (stored.otp !== otp)
        return res.status(400).json({ success: false, message: `Incorrect OTP code. ${5 - stored.attempts} attempts remaining.` });

    otpStore.delete(email);

    try {
        if (stored.type === 'signup') {
            const { name, employeeId, contact, position, password } = stored.userData;

            // Final duplicate check before insert
            const [dup] = await db.query('SELECT id FROM accounts WHERE email = ? OR employee_id = ?', [email, employeeId]);
            if (dup.length)
                return res.status(409).json({ success: false, message: 'Account already exists.' });

            const hash = await bcrypt.hash(password, 12);
            await db.query(
                `INSERT INTO accounts (employee_id, full_name, email, contact_number, position, password_hash, date_joined)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [employeeId, name, email, contact || null, position, hash]
            );
            return res.json({ success: true, message: 'Account created successfully! You can now log in.' });
        }

        if (stored.type === 'reset') {
            if (!newPassword)
                return res.status(400).json({ success: false, message: 'New password is required.' });
            if (!isValidPassword(newPassword))
                return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with at least one letter and one number.' });

            const hash = await bcrypt.hash(newPassword, 12);
            await db.query('UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE email = ?', [hash, email]);
            return res.json({ success: true, message: 'Password updated successfully! You can now log in.' });
        }

    } catch (err) {
        console.error('[verify-otp] DB error:', err.message, err.code || '');
        let message = 'Server error.';
        if (err.code === 'ER_DUP_ENTRY') message = 'An account with this email or employee ID already exists.';
        res.status(500).json({ success: false, message });
    }
});

module.exports = router;
