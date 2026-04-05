// ============================================================
//  mailer.js — Resend (HTTPS-based, works on Railway)
// ============================================================
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

console.log('[mailer] Using Resend for email delivery');

async function sendAlertEmail(to, name, location, pm25, category) {
    const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;border-radius:12px;overflow:hidden;">
      <div style="background:#e74c3c;padding:24px 32px;">
        <h1 style="color:white;margin:0;font-size:22px;">🚨 FreshZone Alert</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Vape / Smoke Detection Notification</p>
      </div>
      <div style="padding:28px 32px;background:white;">
        <p style="color:#2c3e50;font-size:15px;">Hi <strong>${name}</strong>,</p>
        <p style="color:#555;line-height:1.6;">A smoke or vape detection has been triggered. Please review and take action.</p>
        <div style="background:#fff5f5;border-left:5px solid #e74c3c;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;color:#c0392b;font-weight:700;font-size:15px;">Detection Details</p>
          <p style="margin:4px 0;color:#555;font-size:14px;">📍 <strong>Location:</strong> ${location}</p>
          <p style="margin:4px 0;color:#555;font-size:14px;">💨 <strong>PM2.5:</strong> ${pm25} µg/m³</p>
          <p style="margin:4px 0;color:#555;font-size:14px;">📊 <strong>AQI:</strong> ${category}</p>
          <p style="margin:4px 0;color:#555;font-size:14px;">🕐 <strong>Time:</strong> ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
        </div>
      </div>
      <div style="padding:16px 32px;background:#f8f9fa;text-align:center;">
        <p style="color:#aaa;font-size:12px;margin:0;">© 2026 FreshZone – Clear Air Monitoring System</p>
      </div>
    </div>
    `;

    const { error } = await resend.emails.send({
        from:    'FreshZone Alerts <onboarding@resend.dev>',
        to,
        subject: `🚨 Smoke/Vape Detected — ${location}`,
        html,
    });

    if (error) throw new Error(error.message);
}

async function sendOTPEmail(to, name, otp, type) {
    const isReset  = type === 'reset';
    const subject  = isReset ? 'FreshZone — Password Reset Code' : 'FreshZone — Email Verification Code';
    const headline = isReset ? 'Reset your password' : 'Verify your email';
    const message  = isReset
        ? 'You requested a password reset. Use the code below.'
        : 'Welcome to FreshZone! Use the code below to complete registration.';

    const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#00b4d8;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">FreshZone</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">${headline}</p>
      </div>
      <div style="padding:28px 32px;background:white;border-radius:0 0 12px 12px;border:1px solid #eee;">
        <p style="color:#2c3e50;">Hi <strong>${name || 'there'}</strong>,</p>
        <p style="color:#555;line-height:1.6;">${message}</p>
        <div style="text-align:center;margin:28px 0;">
          <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#00b4d8;background:#e5f6ff;padding:16px 24px;border-radius:12px;">${otp}</span>
        </div>
        <p style="color:#aaa;font-size:13px;text-align:center;">Expires in <strong>60 seconds</strong>. Do not share.</p>
      </div>
    </div>
    `;

    const { error } = await resend.emails.send({
        from:    'FreshZone <onboarding@resend.dev>',
        to,
        subject,
        html,
    });

    if (error) throw new Error(error.message);
}

module.exports = { sendAlertEmail, sendOTPEmail };
