// ============================================================
//  test-email.js — Test Resend email delivery
//  Run with: node test-email.js your@email.com
// ============================================================
require('dotenv').config();
const { sendOTPEmail, sendAlertEmail } = require('./mailer');

const recipient = process.argv[2];
const type      = process.argv[3] || 'otp'; // 'otp' or 'alert'

if (!recipient) {
    console.error('Usage: node test-email.js your@email.com [otp|alert]');
    process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY is not set in .env');
    process.exit(1);
}

console.log('--- FreshZone Email Test (Resend) ---');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Not set');
console.log('Sending to:', recipient);
console.log('Type:', type);
console.log('---');

(async () => {
    try {
        if (type === 'alert') {
            await sendAlertEmail(recipient, 'Test Admin', 'Room 101 — Science Building', 18.4, 'Moderate');
            console.log('✅ Alert email sent successfully! Check your inbox.');
        } else {
            await sendOTPEmail(recipient, 'Test User', '123456', 'signup');
            console.log('✅ OTP email sent successfully! Check your inbox.');
        }
    } catch (err) {
        console.error('❌ Email send failed:', err.message);
        process.exit(1);
    }
})();
