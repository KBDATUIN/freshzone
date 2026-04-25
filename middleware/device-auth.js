const crypto = require('crypto');
const db = require('../db');

function safeEqual(a, b) {
    const aBuf = Buffer.from(String(a || ''), 'utf8');
    const bBuf = Buffer.from(String(b || ''), 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

async function verifyNodeHmac(req, res, next) {
    const nodeCode = req.headers['x-node-code'];
    const keyId = req.headers['x-key-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!nodeCode || !keyId || !signature || !timestamp) {
        if (process.env.ALLOW_LEGACY_ESP32_KEY === 'true') return next();
        return res.status(401).json({ success: false, message: 'Missing device auth headers.' });
    }

    const unixTime = Number(timestamp);
    if (!Number.isFinite(unixTime)) {
        return res.status(401).json({ success: false, message: 'Invalid device timestamp.' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - unixTime) > 120) {
        return res.status(401).json({ success: false, message: 'Stale device request.' });
    }

    try {
        const [rows] = await db.query(
            `SELECT dks.secret_key
             FROM device_key_store dks
             JOIN sensor_nodes sn ON sn.id = dks.node_id
             WHERE sn.node_code = ? AND dks.key_id = ? AND dks.is_active = 1
             LIMIT 1`,
            [String(nodeCode).trim(), String(keyId).trim()]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Unknown device key.' });
        }

        const body = req.rawBody || JSON.stringify(req.body || {});
        const canonical = `${timestamp}.${body}`;
        const expectedSig = crypto
            .createHmac('sha256', rows[0].secret_key)
            .update(canonical)
            .digest('hex');

        if (!safeEqual(expectedSig, String(signature).toLowerCase())) {
            return res.status(401).json({ success: false, message: 'Invalid device signature.' });
        }

        req.deviceAuth = {
            nodeCode: String(nodeCode).trim(),
            keyId: String(keyId).trim(),
        };

        return next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Device auth validation failed.' });
    }
}

module.exports = { verifyNodeHmac };
