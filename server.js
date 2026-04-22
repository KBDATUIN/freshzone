// ============================================================
//   server.js — FreshZone Node.js + Express Backend
// ============================================================
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const cron       = require('node-cron');
const rateLimit  = require('express-rate-limit');
const db         = require('./db');
const { sendAlertEmail } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// FIX: Trust Railway's Proxy for Rate Limiting and HTTPS detection
app.set('trust proxy', 1);

// ── HTTPS REDIRECT MIDDLEWARE ────────────────────────────────
// Forces the browser to use https://freshzone.space
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

// ── SECURITY HEADERS ─────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ── RATE LIMITING ────────────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,                  
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        const p = req.path;
        return p === '/api/health' ||
               !p.startsWith('/api/'); 
    },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const pushLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,                   
    message: { success: false, message: 'Too many subscription requests.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const esp32Limiter = rateLimit({
    windowMs: 60 * 1000,       
    max: 30,                   
    message: { success: false, message: 'Too many readings.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', generalLimiter);

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
    origin: function(origin, callback) {
        const allowed = [
            process.env.FRONTEND_URL,
            'https://freshzone.space',
            'https://www.freshzone.space',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
        ].filter(Boolean);
        if (!origin || allowed.includes(origin) || /ngrok/.test(origin) || /railway\.app/.test(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // dev fallback
        }
    },
    credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',     authLimiter,   require('./api/auth'));
app.use('/api/readings', esp32Limiter, require('./api/readings'));
app.use('/api/history',               require('./api/history'));
app.use('/api/profile',               require('./api/profile'));
app.use('/api/contact',               require('./api/contact'));
app.use('/api/push',     pushLimiter,   require('./api/push'));

// ── DASHBOARD STATS ───────────────────────────────────────────
app.get('/api/stats/dashboard', async (req, res) => {
    try {
        const [nodes]  = await db.query("SELECT COUNT(*) as count FROM sensor_nodes");
        const [events] = await db.query("SELECT COUNT(*) as count FROM detection_events WHERE event_status IN ('Detected','Acknowledged')");
        const [recent] = await db.query("SELECT de.id, de.location_name, de.event_status, de.detected_at, sn.node_code FROM detection_events de JOIN sensor_nodes sn ON sn.id=de.node_id WHERE de.event_status IN ('Detected','Acknowledged') ORDER BY de.detected_at DESC LIMIT 5");
        res.json({ success: true, totalNodes: nodes[0].count, activeAlerts: events[0].count, recentEvents: recent });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── FALLBACK ─────────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// ── SCHEDULED JOBS ────────────────────────────────────────────
cron.schedule('*/5 * * * *', async () => {
    try {
        const [pending] = await db.query(
            `SELECT pn.*, de.location_name, de.pm2_5_value, de.aqi_category
             FROM push_notifications pn
             LEFT JOIN detection_events de ON de.id = pn.event_id
             WHERE pn.send_status = 'pending' LIMIT 10`
        );
        for (const notif of pending) {
            try {
                await sendAlertEmail(notif.recipient_email, notif.recipient_name, notif.location_name, notif.pm2_5_value, notif.aqi_category);
                await db.query("UPDATE push_notifications SET send_status='sent', sent_at=NOW() WHERE id=?", [notif.id]);
            } catch (err) {
                await db.query("UPDATE push_notifications SET error_message=? WHERE id=?", [err.message, notif.id]);
            }
        }
    } catch (err) { console.error('Cron fail:', err); }
});

cron.schedule('*/5 * * * *', async () => {
    try {
        const [unacked] = await db.query(
            `SELECT de.*, sn.location_name FROM detection_events de
             JOIN sensor_nodes sn ON sn.id = de.node_id
             WHERE de.event_status = 'Detected'
             AND de.detected_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
             AND (de.last_escalated_at IS NULL OR de.last_escalated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))`
        );
        for (const event of unacked) {
            try {
                const [admins] = await db.query(
                    "SELECT full_name, email FROM accounts WHERE position = 'Administrator' AND is_active = 1"
                );
                for (const admin of admins) {
                    await sendAlertEmail(admin.email, admin.full_name, event.location_name, event.pm2_5_value, event.aqi_category);
                }
                await db.query("UPDATE detection_events SET last_escalated_at=NOW() WHERE id=?", [event.id]);
                console.log(`[escalation] Re-notified for event #${event.id}`);
            } catch(e) { console.error('[escalation] Error:', e.message); }
        }
    } catch (err) { console.error('Escalation cron fail:', err); }
});

cron.schedule('0 * * * *', async () => {
    try { await db.query("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)"); }
    catch (err) { console.error('Cleanup fail:', err); }
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔗 Allowed Frontend: ${process.env.FRONTEND_URL}`);
});