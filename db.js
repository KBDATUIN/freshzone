// ============================================================
//  db.js — MySQL connection pool
// ============================================================
const mysql = require('mysql2/promise');

// NOTE: Do NOT call dotenv here — Railway injects env vars directly.
// On local, dotenv is loaded once in server.js before this runs.

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    database:           process.env.DB_NAME     || 'freshzone_db',
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASS     || '',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '+00:00',
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL connected successfully');
        console.log(`🔗 Connected to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection failed:', err.message);
    });

module.exports = pool;
