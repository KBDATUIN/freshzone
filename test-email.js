// Run this with: node test-email.js your@gmail.com
require('dotenv').config();
const nodemailer = require('nodemailer');

const recipient = process.argv[2];
if (!recipient) {
    console.error('Usage: node test-email.js your@gmail.com');
    process.exit(1);
}

console.log('--- FreshZone Email Test ---');
console.log('GMAIL_USER:', process.env.GMAIL_USER);
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? `"${process.env.GMAIL_APP_PASSWORD}" (${process.env.GMAIL_APP_PASSWORD.length} chars)` : 'NOT SET');
console.log('Sending to:', recipient);
console.log('---');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: true,   // prints every SMTP command
    debug: true,    // full debug output
});

transporter.verify((err) => {
    if (err) {
        console.error('\n❌ VERIFY FAILED:', err.message);
        console.error('Full error:', JSON.stringify(err, null, 2));
        process.exit(1);
    }
    console.log('\n✅ SMTP verified OK — sending test email...\n');

    transporter.sendMail({
        from: `"FreshZone Test" <${process.env.GMAIL_USER}>`,
        to: recipient,
        subject: 'FreshZone OTP Test',
        text: 'If you received this, Gmail is working correctly!',
    }, (err, info) => {
        if (err) {
            console.error('\n❌ SEND FAILED:', err.message);
            console.error('Full error:', JSON.stringify(err, null, 2));
        } else {
            console.log('\n✅ EMAIL SENT! Message ID:', info.messageId);
            console.log('Check your inbox (and spam folder).');
        }
        process.exit(0);
    });
});
