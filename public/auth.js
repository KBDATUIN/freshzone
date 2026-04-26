
// ── AUTO LOGIN: check if already logged in ────────────────────
(async function checkAutoLogin() {
    const user = await hydrateSessionUser();
    if (user) {
        window.location.href = 'dashboard.html';
    }
})();

// ── BIOMETRIC / CREDENTIAL AUTO-FILL ─────────────────────────
async function tryBiometricLogin() {
    // Use Credential Management API — autofills saved browser password if available
    if (!window.PasswordCredential && !window.FederatedCredential) return;

    try {
        const cred = await navigator.credentials.get({
            password: true,
            mediation: 'optional'   // shows picker if multiple accounts saved
        });

        if (cred && cred.id && cred.password) {
            // Fill the form and auto-submit
            const emailField = document.getElementById('login-email');
            const passField  = document.getElementById('login-password');
            if (emailField) emailField.value = cred.id;
            if (passField)  passField.value  = cred.password;

            // Auto-login after short delay so user sees it filled
            setTimeout(() => login(), 600);
        }
    } catch(e) {
        // Biometric not available or user cancelled — silent fail
    }
}

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
function isValidEmail(email) { return /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email) && email.length <= 320; }
function isRealNamePart(value) {
    return /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(value);
}
function isGmailAddress(email) {
    return /^[^@\s]{1,64}@(?:gmail\.com|googlemail\.com)$/i.test(email);
}

function isLikelyFakeGmail(email) {
    return /^[^@\s]{1,64}@(gmail|googlemail)\.[a-z]{2,}$/i.test(email)
        && !isGmailAddress(email);
}

function updateSignupEmailStatus() {
    const statusEl = document.getElementById('signup-email-status');
    const email = document.getElementById('signup-email')?.value.trim();
    if (!statusEl || !email) {
        if (statusEl) statusEl.textContent = 'Enter your Gmail or school email address.';
        return;
    }

    if (!isValidEmail(email)) {
        statusEl.textContent = 'Enter a valid email address.';
        statusEl.style.color = '#ef4444';
        return;
    }
    if (isLikelyFakeGmail(email)) {
        statusEl.textContent = 'This looks like a fake Gmail domain. Use @gmail.com.';
        statusEl.style.color = '#ef4444';
        return;
    }
    if (isGmailAddress(email)) {
        statusEl.textContent = 'Valid Gmail address — good to go.';
        statusEl.style.color = '#22c55e';
        return;
    }
    statusEl.textContent = 'Non-Gmail address detected. This is allowed, but only real Gmail domains are recognized as Gmail.';
    statusEl.style.color = '#6b7280';
}

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

    if (!email)    { setError('login-email',    'Email or phone number is required.'); return; }
    if (!password) { setError('login-password', 'Password is required.'); return; }
    // Accept email OR phone — only reject if it looks like neither
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const looksLikePhone = /^[0-9+\-\s()]{7,20}$/.test(email);
    if (!looksLikeEmail && !looksLikePhone) {
        setError('login-email', 'Enter a valid email address or phone number.');
        return;
    }

    const btn = document.querySelector('#login-view .btn-primary');
    btn.textContent = 'Signing in…'; btn.disabled = true;

    try {
        const res  = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            if (remember) localStorage.setItem('fz-remember', email);
            else          localStorage.removeItem('fz-remember');

            // Save credentials for biometric/password manager auto-fill
            if (window.PasswordCredential && remember) {
                try {
                    const cred = new PasswordCredential({
                        id:       email,
                        password: password,
                        name:     data.user.full_name || data.user.name || email,
                    });
                    await navigator.credentials.store(cred);
                } catch(e) {}
            }

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
        const firstName  = document.getElementById('signup-first-name').value.trim();
        const lastName   = document.getElementById('signup-last-name').value.trim();
        const employeeId = document.getElementById('signup-employeeid').value.trim();
        const email      = document.getElementById('signup-email').value.trim();
        const contact    = document.getElementById('signup-contact').value.trim();
        const position   = document.getElementById('signup-position').value;
        const password   = document.getElementById('signup-password').value.trim();

        let valid = true;
        if (!firstName)                     { setError('signup-first-name', 'First name is required.');           valid=false; }
        else if (!isRealNamePart(firstName)) { setError('signup-first-name', 'Use a real first name only.');        valid=false; }
        if (!lastName)                      { setError('signup-last-name',  'Last name is required.');            valid=false; }
        else if (!isRealNamePart(lastName))  { setError('signup-last-name',  'Use a real last name only.');         valid=false; }
        if (!employeeId)                    { setError('signup-employeeid', 'Employee ID is required.');     valid=false; }
        else if (employeeId.length < 5)         { setError('signup-employeeid', 'Employee ID must be at least 5 characters.'); valid=false; }
        if (!email)                         { setError('signup-email',      'Email is required.');           valid=false; }
        else if (!isValidEmail(email))      { setError('signup-email',      'Enter a valid email.');         valid=false; }
        if (!contact)                       { setError('signup-contact',    'Contact number is required.');  valid=false; }
        else if (!/^[0-9+\-\s()]{7,20}$/.test(contact)) { setError('signup-contact', 'Enter a valid contact number.'); valid=false; }
        if (!position)                      { setError('signup-position',   'Please select your position.'); valid=false; }
        if (!password || password.length < 8) { setError('signup-password', 'Min. 8 characters.');          valid=false; }
        else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { setError('signup-password', 'Password must have at least one letter and one number.'); valid=false; }
        if (!valid) return;

        currentEmail = email;
        payload = { ...payload, email, firstName, lastName, employeeId, contact, position, password };

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
            credentials: 'include',
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
            payload.firstName  = document.getElementById('signup-first-name').value.trim();
            payload.lastName   = document.getElementById('signup-last-name').value.trim();
            payload.employeeId = document.getElementById('signup-employeeid').value.trim();
            payload.contact    = document.getElementById('signup-contact').value.trim();
            payload.position   = document.getElementById('signup-position').value;
            payload.password   = document.getElementById('signup-password').value.trim();
        }

        const res  = await fetch(`${API}/api/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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
            credentials: 'include',
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

    // ── Auto-fill saved password if browser supports it ─────
    // Silently attempts to fill login form from browser-saved credentials.
    // No UI element shown — runs quietly in the background only.
    if (window.PasswordCredential || window.FederatedCredential) {
        setTimeout(tryBiometricLogin, 800);
    }

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
    document.getElementById('signup-email')?.addEventListener('input', updateSignupEmailStatus);
    updateSignupEmailStatus();
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
    ['signup-first-name','signup-last-name','signup-employeeid','signup-email','signup-contact','signup-password'].forEach(id => {
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

    // Dark mode toggle is handled by utils.js
});
