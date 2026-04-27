// ============================================================
//  api/auth.js — Login, Register, OTP, Password Reset
// ============================================================
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const router   = express.Router();
const db       = require('../db');
const { sendOTPEmail } = require('../mailer');
const logger = require('../logger');
const { ensureCsrfCookie, csrfTokenHandler } = require('../middleware/csrf');

const otpAttempts = new Map(); // Track OTP guessing attempts

const JWT_COOKIE_NAME = 'fz_token';

function getJwtCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
    };
}

// ── Input sanitizers ─────────────────────────────────────────
function sanitizeStr(val, maxLen = 100) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen);
}

function isValidEmail(email) {
    return /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email);
}

function isGmailAddress(email) {
    return /^[^\s@]{1,64}@(?:gmail\.com|googlemail\.com)$/i.test(email);
}

function isLikelyFakeGmail(email) {
    return /^[^\s@]{1,64}@(gmail|googlemail)\.[a-z]{2,}$/i.test(email)
        && !isGmailAddress(email);
}

function getEmailDomain(email) {
    return String(email || '').split('@')[1]?.toLowerCase() || '';
}

function isValidPassword(pw) {
    // Min 8 chars, at least one letter and one number
    return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128
        && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

function isRealNamePart(value) {
    return /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(value);
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

        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET is not defined in environment variables');
            return res.status(500).json({ success: false, message: 'Authentication configuration error.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, position: user.position, name: user.full_name },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        const { password_hash, ...safeUser } = user;

        res.cookie(JWT_COOKIE_NAME, token, getJwtCookieOptions());
        return res.json({ success: true, user: safeUser });

    } catch (err) {
        logger.error({ err }, '[login] Error');
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/send-otp ───────────────────────────────────
router.post('/send-otp', async (req, res) => {
    const email     = sanitizeStr(req.body.email, 255);
    const type      = sanitizeStr(req.body.type, 20);
    const firstName = sanitizeStr(req.body.firstName, 50);
    const lastName  = sanitizeStr(req.body.lastName, 50);
    const employeeId = sanitizeStr(req.body.employeeId, 30);
    const contact   = sanitizeStr(req.body.contact, 20);
    // Normalise contact: strip spaces/dashes then validate PH format
    const contactNorm = contact.replace(/[\s\-]/g, '');
    if (contact && !/^(\+63|0)9\d{9}$/.test(contactNorm))
        return res.status(400).json({ success: false, message: 'Invalid contact number. Use format 09XXXXXXXXX or +639XXXXXXXXX.' });
    const position  = sanitizeStr(req.body.position, 50);
    const password  = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';

    if (!email || !type)
        return res.status(400).json({ success: false, message: 'Email and type are required.' });

    if (!isValidEmail(email))
        return res.status(400).json({ success: false, message: 'Invalid email format.' });

    if (!['signup', 'reset'].includes(type))
        return res.status(400).json({ success: false, message: 'Invalid OTP type.' });

    if (type === 'signup' && !['Administrator', 'Staff / Teachers'].includes(position))
        return res.status(400).json({ success: false, message: 'Invalid position.' });

    // Validate signup fields
    if (type === 'signup') {
        if (!firstName || firstName.length < 2)
            return res.status(400).json({ success: false, message: 'First name must be at least 2 letters.' });
        if (!isRealNamePart(firstName))
            return res.status(400).json({ success: false, message: 'Enter a real first name without digits or usernames.' });
        if (!lastName || lastName.length < 2)
            return res.status(400).json({ success: false, message: 'Last name must be at least 2 letters.' });
        if (!isRealNamePart(lastName))
            return res.status(400).json({ success: false, message: 'Enter a real last name without digits or usernames.' });
        if (!employeeId || employeeId.length < 5)
            return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
        if (contact && !isValidPhone(contact))
            return res.status(400).json({ success: false, message: 'Invalid contact number format.' });
        if (!['Administrator', 'Staff / Teachers'].includes(position))
            return res.status(400).json({ success: false, message: 'Invalid position.' });
        if (!isValidPassword(password))
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with at least one letter and one number.' });
        if (isLikelyFakeGmail(email))
            return res.status(400).json({ success: false, message: 'Please enter a real Gmail address ending in @gmail.com.' });

        // Check if email already registered
        const [existing] = await db.query('SELECT id FROM accounts WHERE (email = ? OR employee_id = ?) AND is_active = 1', [email, employeeId]);
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
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const signupUserData = type === 'signup' ? { firstName, lastName, employeeId, contact, position, password } : null;
        const displayName = type === 'signup' ? `${firstName} ${lastName}`.trim() : 'User';

        await db.query('DELETE FROM auth_otp_store WHERE email = ? AND otp_type = ?', [email, type]);
        await db.query(
            `INSERT INTO auth_otp_store (email, otp_code, otp_type, expires_at, attempts, payload_json)
             VALUES (?, ?, ?, ?, 0, ?)`,
            [email, otp, type, expires, signupUserData ? JSON.stringify(signupUserData) : null]
        );

        try {
            await sendOTPEmail(email, displayName || 'User', otp, type);
            logger.info({ email, type }, '[send-otp] Email sent');
        } catch (mailErr) {
            logger.error({ err: mailErr, email, type }, '[send-otp] Email failed');
            return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again later.' });
        }

        res.json({ success: true, message: `OTP sent to ${email}` });

    } catch (err) {
        logger.error({ err }, '[send-otp] Error');
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

    try {
        const [otpRows] = await db.query(
            `SELECT id, otp_code, otp_type, expires_at, attempts, payload_json
             FROM auth_otp_store
             WHERE email = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [email]
        );
        const stored = otpRows[0];
        if (!stored)
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });

        if (Date.now() > new Date(stored.expires_at).getTime()) {
            await db.query('DELETE FROM auth_otp_store WHERE id = ?', [stored.id]);
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }

        // Lock out after 5 wrong OTP attempts
        const attempts = (stored.attempts || 0) + 1;
        await db.query('UPDATE auth_otp_store SET attempts = ? WHERE id = ?', [attempts, stored.id]);
        if (attempts > 5) {
            await db.query('DELETE FROM auth_otp_store WHERE id = ?', [stored.id]);
            return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
        }

        if (stored.otp_code !== otp)
            return res.status(400).json({ success: false, message: `Incorrect OTP code. ${5 - attempts} attempts remaining.` });

        await db.query('DELETE FROM auth_otp_store WHERE id = ?', [stored.id]);

        if (stored.otp_type === 'signup') {
            const parsedPayload = stored.payload_json ? JSON.parse(stored.payload_json) : {};
            const { firstName, lastName, employeeId, contact, position, password } = parsedPayload;

            // Guard: payload must be complete — if any required field is missing the OTP store is corrupt
            if (!firstName || !lastName || !employeeId || !position || !password) {
                logger.error({ parsedPayload }, '[verify-otp] Corrupt payload_json — missing required fields');
                return res.status(400).json({ success: false, message: 'Registration data is incomplete. Please start over and request a new OTP.' });
            }

            const fullName = `${firstName} ${lastName}`;

            // Final duplicate check before insert
            const [dup] = await db.query('SELECT id FROM accounts WHERE (email = ? OR employee_id = ?) AND is_active = 1', [email, employeeId]);
            if (dup.length)
                return res.status(409).json({ success: false, message: 'Account already exists.' });

            const hash = await bcrypt.hash(password, 12);
            await db.query(
                `INSERT INTO accounts (employee_id, full_name, email, contact_number, position, password_hash, date_joined)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [employeeId, fullName, email, contact || null, position, hash]
            );
            return res.json({ success: true, message: 'Account created successfully! You can now log in.' });
        }

        if (stored.otp_type === 'reset') {
            if (!newPassword)
                return res.status(400).json({ success: false, message: 'New password is required.' });
            if (!isValidPassword(newPassword))
                return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with at least one letter and one number.' });

            const hash = await bcrypt.hash(newPassword, 12);
            await db.query('UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE email = ?', [hash, email]);
            return res.json({ success: true, message: 'Password updated successfully! You can now log in.' });
        }

    } catch (err) {
        logger.error({ err, message: err.message, code: err.code, sql: err.sql }, '[verify-otp] DB error');
        let message = 'Server error.';
        if (err.code === 'ER_DUP_ENTRY') message = 'An account with this email or employee ID already exists.';
        if (err.code === 'ER_NO_SUCH_TABLE') message = 'Database configuration error. Contact support.';
        if (err.code === 'ER_BAD_NULL_ERROR') message = 'Missing required field: ' + (err.message || '');
        res.status(500).json({ success: false, message, debug: process.env.NODE_ENV !== 'production' ? err.message : undefined });
    }
});

router.get('/csrf-token', ensureCsrfCookie, csrfTokenHandler);

router.get('/session', async (req, res) => {
    const token = req.cookies?.[JWT_COOKIE_NAME] ||
        (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
    if (!token) return res.status(200).json({ loggedIn: false });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await db.query(
            `SELECT id, employee_id, full_name, email, contact_number, position, photo_url
             FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1`,
            [decoded.id]
        );
        if (!rows.length) return res.status(200).json({ loggedIn: false, reason: 'invalid_token' });
        return res.status(200).json({ loggedIn: true, success: true, user: rows[0] });
    } catch (err) {
        return res.status(200).json({ loggedIn: false, reason: 'invalid_token' });
    }
});

router.post('/logout', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const clearOpts = { path: '/', sameSite: isProduction ? 'none' : 'lax', secure: isProduction };
    res.clearCookie(JWT_COOKIE_NAME, clearOpts);
    res.clearCookie('fz_csrf', clearOpts);
    return res.json({ success: true, message: 'Logged out.' });
});

module.exports = router;
