// ============================================================
//  middleware/auth.js — JWT verification middleware
// ============================================================
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.fz_token;
    // EventSource (SSE) cannot send headers — allow token via query string as fallback
    const queryToken  = req.query?.token || null;
    const token = cookieToken || bearerToken || queryToken;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    // In production, cookie is preferred but query-token is allowed for SSE streams
    if (process.env.NODE_ENV === 'production' && !cookieToken && bearerToken && !queryToken) {
        return res.status(401).json({ success: false, message: 'Token must be sent via cookie in production.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
}

function adminOnly(req, res, next) {
    if (req.user?.position !== 'Administrator') {
        return res.status(403).json({ success: false, message: 'Administrator access required.' });
    }
    next();
}

module.exports = { authMiddleware, adminOnly };
