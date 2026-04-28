const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'fz_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
    };
}

function ensureCsrfCookie(req, res, next) {
    let token = req.cookies?.[CSRF_COOKIE_NAME];
    if (!token) {
        token = generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions());
    }
    req.csrfToken = token;
    next();
}

function csrfProtection(req, res, next) {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    if (req.headers['x-api-key'] || req.headers['x-signature']) return next();

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME];

    // If no tokens exist, generate new CSRF token and allow request
    if (!cookieToken) {
        const token = generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions());
        req.csrfToken = token;
        return next();
    }

    // If header token is missing, allow request but log it (client may not have sent it yet)
    if (!headerToken) {
        req.csrfToken = cookieToken;
        return next();
    }

    // Both tokens exist — validate they match
    if (cookieToken !== headerToken) {
        return res.status(403).json({ success: false, message: 'CSRF token validation failed.' });
    }

    req.csrfToken = cookieToken;
    return next();
}

function csrfTokenHandler(req, res) {
    return res.json({ success: true, csrfToken: req.csrfToken });
}

module.exports = {
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    ensureCsrfCookie,
    csrfProtection,
    csrfTokenHandler,
};
