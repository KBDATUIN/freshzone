// ============================================================
//  db.js — MySQL connection pool
//
// Connection priority:
//   1. DATABASE_URL + optional DB_CA_CERT (Aiven/cloud connection string)
//   2. Individual DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS vars
//
// SSL: If DB_CA_CERT is set, it's used as the CA certificate file path.
//      Otherwise, rejectUnauthorized: false is used for self-signed certs.
// ============================================================
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// dotenv is loaded in server.js before this module runs

function buildSslConfig() {
    // Priority: DB_CA_CERT env var → ./ca.pem file → rejectUnauthorized:false
    if (process.env.DB_CA_CERT) {
        return { ca: fs.readFileSync(process.env.DB_CA_CERT) };
    }
    // Auto-detect ca.pem in project root (e.g. Aiven)
    const defaultCertPath = path.join(__dirname, 'ca.pem');
    if (fs.existsSync(defaultCertPath)) {
        return { ca: fs.readFileSync(defaultCertPath) };
    }
    // Accept self-signed / cloud provider certs by default
    return { rejectUnauthorized: false };
}

function createPool() {
    // Build SSL config once (file read, avoid doing it twice)
    const sslConfig = buildSslConfig();

    if (process.env.DATABASE_URL) {
        // Parse the URL to combine with SSL config (Aiven etc.)
        const url = new URL(process.env.DATABASE_URL);
        return mysql.createPool({
            host:               url.hostname,
            port:               parseInt(url.port) || 3306,
            user:               decodeURIComponent(url.username),
            password:           decodeURIComponent(url.password),
            database:           url.pathname.slice(1).split('?')[0] || 'defaultdb',
            waitForConnections: true,
            connectionLimit:    10,
            queueLimit:         0,
            timezone:           '+00:00',
            ssl:                sslConfig
        });
    }

    // Fallback: individual env vars (local dev / backward compat)
    return mysql.createPool({
        host:               process.env.DB_HOST     || 'localhost',
        port:               parseInt(process.env.DB_PORT) || 3306,
        database:           process.env.DB_NAME     || 'freshzone_db',
        user:               process.env.DB_USER     || 'root',
        password:           process.env.DB_PASS     || '',
        waitForConnections: true,
        connectionLimit:    10,
        queueLimit:         0,
        timezone:           '+00:00',
        ssl:                sslConfig
    });
}

const pool = createPool();

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL connected successfully');
        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection failed:', err.message);
    });

module.exports = pool;