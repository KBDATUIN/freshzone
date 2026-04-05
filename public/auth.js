// ============================================================
//  auth.js (UPDATED) — 60s OTP, resend support, Node.js API
// ============================================================

let otpExpiry    = null;
let otpCountdown = null;
let currentEmail = "";
const OTP_TTL    = 60 * 1000; // 60 seconds

// ── NOTIFICATION ──────────────────────────────────────────────
function showNotification(message, type = 'info', duration = 3500) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = message;
    n.className = `notification show ${type}`;
    setTimeout(() => { n.className = 'notification hidden'; }, duration);
}

// ── VIEW SWITCH ───────────────────────────────────────────────
function showView(viewId) {
    ['login-view','signup-view','forgot-view'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

// ── FIELD VALIDATION HELPERS ──────────────────────────────────
function setError(inputId, msg) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.classList.add('field-error');
    let errSpan = el.parentElement.querySelector('.field-error-msg');
    if (!errSpan) {
        errSpan = document.createElement('span');
        errSpan.className = 'field-error-msg';
        el.parentElement.appendChild(errSpan);
    }
    errSpan.textContent = msg;
}
function clearError(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.classList.remove('field-error');
    const e = el.parentElement.querySelector('.field-error-msg');
    if (e) e.textContent = '';
}
function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    document.querySelectorAll('.field-error-msg').forEach(el => el.textContent = '');
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// ── PASSWORD STRENGTH ─────────────────────────────────────────
function updateStrengthUI(inputId, barId, labelId) {
    const pw = document.getElementById(inputId)?.value || '';
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        { pct:'0%',  color:'#ddd',    text:'' },
        { pct:'20%', color:'#e74c3c', text:'Very Weak' },
        { pct:'40%', color:'#e67e22', text:'Weak' },
        { pct:'60%', color:'#f39c12', text:'Fair' },
        { pct:'80%', color:'#2ecc71', text:'Strong' },
        { pct:'100%',color:'#27ae60', text:'Very Strong' },
    ];
    const level = levels[Math.min(score, 5)];
    const bar = document.getElementById(barId);
    const lbl = document.getElementById(labelId);
    if (bar) { bar.style.width = level.pct; bar.style.background = level.color; }
    if (lbl) { lbl.textContent = level.text; lbl.style.color = level.color; }
}

// ── OTP COUNTDOWN (60 seconds) ────────────────────────────────
function startOTPCountdown(displayId, resendBtnId, type) {
    clearInterval(otpCountdown);
    otpExpiry = Date.now() + OTP_TTL;

    const display   = document.getElementById(displayId);
    const resendBtn = document.getElementById(resendBtnId);
    if (resendBtn) resendBtn.style.display = 'none';

    otpCountdown = setInterval(() => {
        const remaining = otpExpiry - Date.now();
        if (remaining <= 0) {
            clearInterval(otpCountdown);
            if (display) {
                display.textContent = 'OTP expired.';
                display.style.color = 'var(--danger)';
            }
            if (resendBtn) resendBtn.style.display = 'inline-block';
        } else {
            const s = Math.ceil(remaining / 1000);
            if (display) {
                display.textContent = `OTP expires in ${s}s`;
                display.style.color = s <= 15 ? 'var(--danger)' : 'var(--gray)';
            }
        }
    }, 500);
}

// ── LOGIN ─────────────────────────────────────────────────────
async function login() {
    clearAllErrors();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const remember = document.getElementById('remember-me').checked;

    if (!email)    { setError('login-email',    'Email is required.'); return; }
    if (!password) { setError('login-password', 'Password is required.'); return; }

    const btn = document.querySelector('#login-view .btn-primary');
    btn.textContent = 'Signing in…'; btn.disabled = true;

    try {
        const res  = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('fz-token', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            if (remember) localStorage.setItem('fz-remember', email);
            else          localStorage.removeItem('fz-remember');
            showNotification('Login successful! Redirecting…', 'success');
            setTimeout(() => location.href = 'dashboard.html', 1400);

        } else {
            setError('login-password', data.message || 'Invalid credentials.');
        }
    } catch (err) {
        showNotification('Cannot connect to server. Is the backend running?', 'error');
    } finally {
        btn.textContent = 'Sign In'; btn.disabled = false;
    }
}

// ── SEND OTP ──────────────────────────────────────────────────
async function sendOTP(type) {
    clearAllErrors();
    let payload = { type };

    if (type === 'signup') {
        const name       = document.getElementById('signup-name').value.trim();
        const employeeId = document.getElementById('signup-employeeid').value.trim();
        const email      = document.getElementById('signup-email').value.trim();
        const contact    = document.getElementById('signup-contact').value.trim();
        const position   = document.getElementById('signup-position').value;
        const password   = document.getElementById('signup-password').value.trim();

        let valid = true;
        if (!name)                          { setError('signup-name',       'Full name is required.');       valid=false; }
        if (!employeeId)                    { setError('signup-employeeid', 'Employee ID is required.');     valid=false; }
        if (!email)                         { setError('signup-email',      'Email is required.');           valid=false; }
        else if (!isValidEmail(email))      { setError('signup-email',      'Enter a valid email.');         valid=false; }
        if (!contact)                       { setError('signup-contact',    'Contact number is required.');  valid=false; }
        if (!position)                      { setError('signup-position',   'Please select your position.'); valid=false; }
        if (!password || password.length < 8) { setError('signup-password', 'Min. 8 characters.');          valid=false; }
        if (!valid) return;

        currentEmail = email;
        payload = { ...payload, email, name, employeeId, contact, position, password };

    } else if (type === 'reset') {
        const email = document.getElementById('reset-email').value.trim();
        if (!email)              { setError('reset-email', 'Email is required.'); return; }
        if (!isValidEmail(email)){ setError('reset-email', 'Enter a valid email.'); return; }
        currentEmail = email;
        payload = { ...payload, email };
    }

    const btnId = type === 'signup' ? 'signup-btn' : 'reset-btn';
    const btn   = document.getElementById(btnId);
    if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

    try {
        const res  = await fetch(`${API}/api/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            showNotification('OTP sent to your email! Valid for 60 seconds.', 'success', 4000);

            if (type === 'signup') {
                document.getElementById('signup-otp-section').classList.remove('hidden');
                document.getElementById('signup-btn').classList.add('hidden');
                // Show mobile email banner with the email address
                const signupEmailDisplay = document.getElementById('signup-email-display');
                if (signupEmailDisplay) signupEmailDisplay.textContent = currentEmail;
                startOTPCountdown('signup-otp-timer', 'signup-resend-btn', 'signup');
            } else {
                document.getElementById('reset-otp-section').classList.remove('hidden');
                document.getElementById('reset-btn').classList.add('hidden');
                // Show mobile email banner with the email address
                const resetEmailDisplay = document.getElementById('reset-email-display');
                if (resetEmailDisplay) resetEmailDisplay.textContent = currentEmail;
                startOTPCountdown('reset-otp-timer', 'reset-resend-btn', 'reset');
            }
        } else {
            const errField = type === 'signup' ? 'signup-email' : 'reset-email';
            setError(errField, data.message || 'Failed to send OTP.');
            if (btn) { btn.textContent = type === 'signup' ? 'Send Verification OTP' : 'Send Reset Code'; btn.disabled = false; }
        }
    } catch (err) {
        showNotification('Cannot connect to server. Is the backend running?', 'error');
        if (btn) { btn.textContent = type === 'signup' ? 'Send Verification OTP' : 'Send Reset Code'; btn.disabled = false; }
    }
}

// ── RESEND OTP ────────────────────────────────────────────────
async function resendOTP(type) {
    const resendBtnId = type === 'signup' ? 'signup-resend-btn' : 'reset-resend-btn';
    const resendBtn   = document.getElementById(resendBtnId);
    if (resendBtn) { resendBtn.textContent = 'Resending…'; resendBtn.disabled = true; }

    try {
        const payload = { type, email: currentEmail };
        if (type === 'signup') {
            payload.name       = document.getElementById('signup-name').value.trim();
            payload.employeeId = document.getElementById('signup-employeeid').value.trim();
            payload.contact    = document.getElementById('signup-contact').value.trim();
            payload.position   = document.getElementById('signup-position').value;
            payload.password   = document.getElementById('signup-password').value.trim();
        }

        const res  = await fetch(`${API}/api/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            showNotification('New OTP sent! Valid for 60 seconds.', 'success', 4000);
            const otpInputId = type === 'signup' ? 'signup-otp-input' : 'reset-otp-input';
            document.getElementById(otpInputId).value = '';
            startOTPCountdown(
                type === 'signup' ? 'signup-otp-timer' : 'reset-otp-timer',
                resendBtnId,
                type
            );
        } else {
            showNotification(data.message || 'Failed to resend OTP.', 'error');
            if (resendBtn) { resendBtn.textContent = 'Resend OTP'; resendBtn.disabled = false; }
        }
    } catch (err) {
        showNotification('Cannot connect to server.', 'error');
        if (resendBtn) { resendBtn.textContent = 'Resend OTP'; resendBtn.disabled = false; }
    }
}

// ── VERIFY OTP ────────────────────────────────────────────────
async function verifyOTP(type) {
    const otpInput    = document.getElementById(type === 'signup' ? 'signup-otp-input' : 'reset-otp-input');
    const otp         = otpInput.value.trim();
    const newPassword = type === 'reset' ? document.getElementById('reset-new-password').value.trim() : undefined;

    if (!otp || otp.length !== 6) {
        showNotification('Enter the 6-digit OTP code.', 'error');
        return;
    }

    try {
        const res  = await fetch(`${API}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentEmail, otp, newPassword })
        });
        const data = await res.json();

        if (data.success) {
            clearInterval(otpCountdown);
            showNotification(data.message, 'success', 4000);
            setTimeout(() => showView('login-view'), 2000);
        } else {
            showNotification(data.message || 'Verification failed.', 'error');
        }
    } catch (err) {
        showNotification('Cannot connect to server.', 'error');
    }
}

// ── PASSWORD TOGGLE ───────────────────────────────────────────
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const wrap   = btn.closest('.input-password-wrap') || btn.parentElement;
    const eyeOn  = wrap.querySelector('.eye-icon');
    const eyeOff = wrap.querySelector('.eye-off-icon');
    if (!eyeOn || !eyeOff) return;
    if (isPassword) {
        eyeOn.style.setProperty('display', 'none',  'important');
        eyeOff.style.setProperty('display', 'block', 'important');
    } else {
        eyeOn.style.setProperty('display', 'block', 'important');
        eyeOff.style.setProperty('display', 'none',  'important');
    }
}




// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // ── Restore remembered email ──────────────────────────────
    const remembered = localStorage.getItem('fz-remember');
    if (remembered) {
        const emailField = document.getElementById('login-email');
        if (emailField) {
            emailField.value = remembered;
            const cb = document.getElementById('remember-me');
            if (cb) cb.checked = true;
        }
    }

    // ── Password strength meters ──────────────────────────────
    document.getElementById('signup-password')?.addEventListener('input', function() {
        updateStrengthUI('signup-password', 'signup-pw-bar', 'signup-pw-label');
    });
    document.getElementById('reset-new-password')?.addEventListener('input', function() {
        updateStrengthUI('reset-new-password', 'reset-pw-bar', 'reset-pw-label');
    });

    // ── Enter key support for every input field ───────────────
    // LOGIN VIEW — any field → Sign In
    ['login-email', 'login-password'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); login(); }
        });
    });

    // SIGNUP VIEW — all fields → Send OTP (or Verify if OTP shown)
    ['signup-name','signup-employeeid','signup-email','signup-contact','signup-password'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const otpSection = document.getElementById('signup-otp-section');
            if (otpSection && !otpSection.classList.contains('hidden')) {
                verifyOTP('signup');
            } else {
                sendOTP('signup');
            }
        });
    });

    // SIGNUP OTP input → Verify & Register
    document.getElementById('signup-otp-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); verifyOTP('signup'); }
    });

    // FORGOT VIEW — email field → Send Reset Code
    document.getElementById('reset-email')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const otpSection = document.getElementById('reset-otp-section');
        if (otpSection && !otpSection.classList.contains('hidden')) {
            verifyOTP('reset');
        } else {
            sendOTP('reset');
        }
    });

    // FORGOT OTP input → Update Password
    document.getElementById('reset-otp-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); verifyOTP('reset'); }
    });

    // FORGOT new password field → Update Password
    document.getElementById('reset-new-password')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); verifyOTP('reset'); }
    });

    // ── Dark mode toggle ──────────────────────────────────────
    const authDarkBtn = document.getElementById('auth-dark-toggle');
    if (authDarkBtn) {
        const saved = localStorage.getItem('fz-theme') || 'light';
        authDarkBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
        authDarkBtn.addEventListener('click', () => {
            toggleDarkMode();
            const theme = document.documentElement.getAttribute('data-theme');
            authDarkBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        });
    }
});
