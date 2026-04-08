// ============================================================
//  server.js — FreshZone Node.js + Express Backend
// ============================================================
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const cron       = require('node-cron');
const db         = require('./db'); // Database import at the top
const { sendAlertEmail } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────
// Required: ngrok intercepts requests and shows a browser warning page
// unless we set this header — this bypasses it for all responses.
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

app.use(cors({
    origin: function(origin, callback) {
        const allowed = [
            process.env.FRONTEND_URL,
            'https://unreceptive-pseudocharitable-jorge.ngrok-free.dev',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
        ].filter(Boolean);
        if (!origin || allowed.includes(origin) || /ngrok/.test(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // dev fallback
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',     require('./api/auth'));
app.use('/api/readings', require('./api/readings'));
app.use('/api/history',  require('./api/history'));
app.use('/api/profile',  require('./api/profile'));
app.use('/api/contact',  require('./api/contact'));
app.use('/api/push',     require('./api/push'));

// Fix for the 404 on Dashboard Stats
app.get('/api/stats/dashboard', async (req, res) => {
    try {
        const [nodes] = await db.query("SELECT COUNT(*) as count FROM sensor_nodes");
        const [events] = await db.query("SELECT COUNT(*) as count FROM detection_events WHERE event_status = 'Detected'");
        const [recent] = await db.query("SELECT * FROM v_open_events LIMIT 5");

        res.json({
            success: true,
            totalNodes: nodes[0].count,
            activeAlerts: events[0].count,
            recentEvents: recent
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── FALLBACK (Keep this BELOW all API routes) ────────────────
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

cron.schedule('0 * * * *', async () => {
    try { await db.query("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)"); } 
    catch (err) { console.error('Cleanup fail:', err); }
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔗 Allowed Frontend: ${process.env.FRONTEND_URL}`);
});