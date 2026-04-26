// ============================================================
//  middleware/auth.js — JWT verification middleware
// ============================================================
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.fz_token;
    const token = cookieToken || bearerToken;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
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
