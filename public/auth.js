/* ═══════════════════════════════════════════════════════════════
   FRESHZONE AUTH · Frontend Logic v5.0
   Clean, error-free, single-init pattern
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────
    const OTP_TTL = 10 * 60 * 1000; // 10 minutes
    let otpExpiry = null;
    let otpCountdown = null;
    let currentEmail = '';
    let currentMode = 'login'; // 'login' | 'signup' | 'forgot'

    // ── Utilities ─────────────────────────────────────────────
    const $  = (id) => document.getElementById(id);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function getCsrfToken() {
        const m = document.cookie.match(/(?:^|;\s*)fz_csrf=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    // ── Toast notification ────────────────────────────────────
    let toastTimer = null;
    function showNotification(message, type = 'info', duration = 3500) {
        const t = $('toast');
        if (!t) return;
        t.textContent = message;
        t.className = 'toast is-visible is-' + type;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.className = 'toast'; }, duration);
    }

    // ── View switching ────────────────────────────────────────
    function switchTab(mode) {
        currentMode = mode;
        const views = ['login-view', 'signup-view', 'forgot-view'];
        views.forEach(id => {
            const el = $(id);
            if (!el) return;
            el.classList.toggle('is-hidden', id !== mode + '-view');
            el.hidden = id !== mode + '-view';
        });

        // Tabs (login/signup share the tab strip, forgot hides it)
        const tabs = $('auth-tabs');
        if (tabs) tabs.style.visibility = (mode === 'forgot') ? 'hidden' : 'visible';

        $$('.auth-tab').forEach(t => {
            const active = t.id === 'tab-' + mode;
            t.classList.toggle('is-active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        // Animate thumb
        const thumb = $('auth-tabs-thumb');
        if (thumb) {
            if (mode === 'signup') thumb.parentElement.classList.add('is-signup');
            else                    thumb.parentElement.classList.remove('is-signup');
        }

        // Title / subtitle
        const title = $('auth-card-title');
        const sub   = $('auth-card-sub');
        const titles = {
            login:  ['Welcome back',         'Sign in to your FreshZone dashboard'],
            signup: ['Create your account',  'Get started with FreshZone in seconds'],
            forgot: ['Reset your password',  'We\'ll email you a 6-digit reset code'],
        };
        if (title) title.textContent = titles[mode]?.[0] || '';
        if (sub)   sub.textContent   = titles[mode]?.[1] || '';

        // Reset OTP timers when leaving signup
        if (mode !== 'signup') clearInterval(otpCountdown);
    }

    // ── Validation helpers ────────────────────────────────────
    const isValidEmail = (e) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(e) && e.length <= 320;
    const isRealName   = (v) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(v);
    const isGmail      = (e) => /^[^@\s]{1,64}@(?:gmail\.com|googlemail\.com)$/i.test(e);
    const isFakeGmail  = (e) => /^[^@\s]{1,64}@(gmail|googlemail)\.[a-z]{2,}$/i.test(e) && !isGmail(e);
    const isAllowedEmailDomain = (e) => {
        const d = (e.split('@')[1] || '').toLowerCase();
        return /^(gmail\.com|googlemail\.com)$/.test(d)
            || /\.edu\.ph$/.test(d)
            || /\.edu$/.test(d)
            || /\.ac\.ph$/.test(d)
            || /\.ac\.[a-z]{2,}$/.test(d)
            || /\.sch\.[a-z]{2,}$/.test(d)
            || /\.k12\.[a-z]{2,}$/.test(d);
    };
    const isValidPhone = (p) => /^[0-9+\-\s()]{7,20}$/.test(p);

    function setFieldError(inputId, msg) {
        const el = $(inputId);
        if (!el) return;
        const wrap = el.closest('.field-input-wrap');
        if (wrap) wrap.classList.add('is-error');
        let errEl = el.closest('.field')?.querySelector('.field-error-msg');
        if (!errEl) {
            errEl = document.createElement('span');
            errEl.className = 'field-error-msg';
            errEl.style.cssText = 'color:var(--fz-danger);font-size:0.78rem;font-weight:600;margin-top:0.35rem;display:block;';
            el.closest('.field')?.appendChild(errEl);
        }
        errEl.textContent = msg;
    }
    function clearFieldError(inputId) {
        const el = $(inputId);
        if (!el) return;
        const wrap = el.closest('.field-input-wrap');
        if (wrap) wrap.classList.remove('is-error');
        const errEl = el.closest('.field')?.querySelector('.field-error-msg');
        if (errEl) errEl.textContent = '';
    }
    function clearAllErrors() {
        $$('.field-input-wrap.is-error').forEach(w => w.classList.remove('is-error'));
        $$('.field-error-msg').forEach(e => e.textContent = '');
    }

    // ── Email status (signup live) ────────────────────────────
    function getEmailStatus(email) {
        if (!email)    return { msg: 'Use Gmail or a school email (e.g. edu.ph, ac.ph).', cls: '' };
        if (!isValidEmail(email)) return { msg: 'Enter a valid email address.', cls: 'is-error' };
        if (isFakeGmail(email))   return { msg: 'Fake Gmail domain detected. Use @gmail.com.', cls: 'is-error' };
        const d = (email.split('@')[1] || '').toLowerCase();
        if (/^(gmail\.com|googlemail\.com)$/.test(d)) return { msg: 'Gmail address — accepted.', cls: 'is-success' };
        if (/\.edu\.ph$/.test(d))  return { msg: 'School email (edu.ph) — accepted.', cls: 'is-success' };
        if (/\.edu$/.test(d))      return { msg: 'Educational email — accepted.', cls: 'is-success' };
        if (/\.ac\.ph$/.test(d))   return { msg: 'Academic email (ac.ph) — accepted.', cls: 'is-success' };
        if (/\.ac\.[a-z]{2,}$/.test(d))  return { msg: 'Academic email — accepted.', cls: 'is-success' };
        if (/\.sch\.[a-z]{2,}$/.test(d)) return { msg: 'School email — accepted.', cls: 'is-success' };
        if (/\.k12\.[a-z]{2,}$/.test(d)) return { msg: 'School email — accepted.', cls: 'is-success' };
        return { msg: 'Only Gmail or school emails allowed (e.g. edu.ph, ac.ph).', cls: 'is-error' };
    }

    function updateSignupEmailStatus() {
        const statusEl = $('signup-email-status');
        if (!statusEl) return;
        const email = $('signup-email')?.value.trim();
        const { msg, cls } = getEmailStatus(email || '');
        statusEl.textContent = msg;
        statusEl.className = 'field-status' + (cls ? ' ' + cls : '');
    }

    // ── Password strength ─────────────────────────────────────
    const PW_LEVELS = [
        { pct: '0%',   color: '#cbd5e1', text: '' },
        { pct: '20%',  color: '#ef4444', text: 'Very weak' },
        { pct: '40%',  color: '#f97316', text: 'Weak' },
        { pct: '60%',  color: '#f59e0b', text: 'Fair' },
        { pct: '80%',  color: '#22c55e', text: 'Strong' },
        { pct: '100%', color: '#16a34a', text: 'Very strong' },
    ];
    function updatePasswordStrength(inputId, barId, labelId) {
        const pw  = $(inputId)?.value || '';
        let score = 0;
        if (pw.length >= 8)  score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw))  score++;
        if (/[0-9]/.test(pw))  score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        const lvl = PW_LEVELS[Math.min(score, 5)];
        const bar = $(barId);
        const lbl = $(labelId);
        if (bar) { bar.style.width = lvl.pct; bar.style.background = lvl.color; }
        if (lbl) { lbl.textContent = lvl.text; lbl.style.color = lvl.color; }
    }

    // ── OTP countdown ─────────────────────────────────────────
    function startOTPCountdown(displayId, resendBtnId) {
        clearInterval(otpCountdown);
        otpExpiry = Date.now() + OTP_TTL;

        const display   = $(displayId);
        const resendBtn = $(resendBtnId);
        if (resendBtn) resendBtn.hidden = true;

        otpCountdown = setInterval(() => {
            const remaining = otpExpiry - Date.now();
            const displayEl = $(displayId);
            if (!displayEl) { clearInterval(otpCountdown); return; }
            if (remaining <= 0) {
                clearInterval(otpCountdown);
                displayEl.textContent = 'OTP expired — request a new one';
                displayEl.classList.add('is-expired');
                if (resendBtn) resendBtn.hidden = false;
            } else {
                const s = Math.ceil(remaining / 1000);
                const m = Math.floor(s / 60);
                const sec = s % 60;
                displayEl.textContent = `OTP expires in ${m}:${String(sec).padStart(2, '0')}`;
                displayEl.classList.remove('is-expired');
            }
        }, 500);
    }

    // ── Password reveal toggle ────────────────────────────────
    function togglePassword(inputId, btn) {
        const input = $(inputId);
        if (!input || !btn) return;
        const revealing = input.type === 'password';
        input.type = revealing ? 'text' : 'password';
        btn.classList.toggle('is-revealed', revealing);
    }

    // ── Button loading state ──────────────────────────────────
    function setBtnLoading(btn, loading, originalLabel) {
        if (!btn) return;
        if (loading) {
            btn.dataset.originalLabel = btn.dataset.originalLabel || btn.innerHTML;
            btn.classList.add('is-loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            if (originalLabel !== undefined) btn.innerHTML = originalLabel;
            else if (btn.dataset.originalLabel) btn.innerHTML = btn.dataset.originalLabel;
        }
    }

    // ── API helpers ───────────────────────────────────────────
    async function apiPost(path, body) {
        const res = await fetch(`${API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        return res.json();
    }

    // ── Login ─────────────────────────────────────────────────
    async function login() {
        clearAllErrors();
        const email    = $('login-email')?.value.trim();
        const password = $('login-password')?.value;
        const remember = $('remember-me')?.checked;

        if (!email)              { setFieldError('login-email', 'Email or phone is required.'); $('login-email').focus(); return; }
        if (!password)           { setFieldError('login-password', 'Password is required.'); $('login-password').focus(); return; }
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        const isPhone = /^[0-9+\-\s()]{7,20}$/.test(email);
        if (!isEmail && !isPhone) { setFieldError('login-email', 'Enter a valid email or phone number.'); $('login-email').focus(); return; }

        const btn = $('login-btn');
        setBtnLoading(btn, true);

        try {
            const data = await apiPost('/api/auth/login', { email, password });
            if (data?.success) {
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                if (remember) localStorage.setItem('fz-remember', email);
                else          localStorage.removeItem('fz-remember');

                if (window.PasswordCredential && remember) {
                    try {
                        const cred = new PasswordCredential({
                            id: email, password,
                            name: data.user.full_name || data.user.name || email,
                        });
                        await navigator.credentials.store(cred);
                    } catch (e) { /* ignore */ }
                }

                showNotification('Login successful! Redirecting…', 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
            } else {
                setFieldError('login-password', data?.message || 'Invalid credentials.');
                setBtnLoading(btn, false);
                $('login-password').focus();
            }
        } catch (err) {
            showNotification('Cannot connect to server. Please try again.', 'error');
            setBtnLoading(btn, false);
        }
    }

    // ── Send OTP ──────────────────────────────────────────────
    async function sendOTP(type) {
        clearAllErrors();
        let payload = { type };

        if (type === 'signup') {
            const fields = {
                'signup-first-name':  $('signup-first-name')?.value.trim(),
                'signup-last-name':   $('signup-last-name')?.value.trim(),
                'signup-employeeid':  $('signup-employeeid')?.value.trim(),
                'signup-email':       $('signup-email')?.value.trim(),
                'signup-contact':     $('signup-contact')?.value.trim(),
                'signup-position':    $('signup-position')?.value,
                'signup-password':    $('signup-password')?.value,
            };

            let ok = true;
            if (!fields['signup-first-name'])                                  { setFieldError('signup-first-name', 'First name is required.'); ok = false; }
            else if (!isRealName(fields['signup-first-name']))                { setFieldError('signup-first-name', 'Use a real first name.'); ok = false; }
            if (!fields['signup-last-name'])                                   { setFieldError('signup-last-name', 'Last name is required.'); ok = false; }
            else if (!isRealName(fields['signup-last-name']))                 { setFieldError('signup-last-name', 'Use a real last name.'); ok = false; }
            if (!fields['signup-employeeid'])                                 { setFieldError('signup-employeeid', 'Employee ID is required.'); ok = false; }
            else if (fields['signup-employeeid'].length < 5)                  { setFieldError('signup-employeeid', 'Must be at least 5 characters.'); ok = false; }
            if (!fields['signup-email'])                                      { setFieldError('signup-email', 'Email is required.'); ok = false; }
            else if (!isValidEmail(fields['signup-email']))                   { setFieldError('signup-email', 'Enter a valid email.'); ok = false; }
            else if (isFakeGmail(fields['signup-email']))                     { setFieldError('signup-email', 'Use @gmail.com, not a fake Gmail domain.'); ok = false; }
            else if (!isAllowedEmailDomain(fields['signup-email']))          { setFieldError('signup-email', 'Only Gmail or school emails allowed (e.g. edu.ph).'); ok = false; }
            if (!fields['signup-contact'])                                    { setFieldError('signup-contact', 'Contact number is required.'); ok = false; }
            else if (!isValidPhone(fields['signup-contact']))                 { setFieldError('signup-contact', 'Enter a valid phone number.'); ok = false; }
            if (!fields['signup-position'])                                   { setFieldError('signup-position', 'Please select your position.'); ok = false; }
            if (!fields['signup-password'] || fields['signup-password'].length < 8)
                                                                              { setFieldError('signup-password', 'Minimum 8 characters.'); ok = false; }
            else if (!/[a-zA-Z]/.test(fields['signup-password']) || !/[0-9]/.test(fields['signup-password']))
                                                                              { setFieldError('signup-password', 'Must include at least one letter and one number.'); ok = false; }
            if (!ok) return;

            currentEmail = fields['signup-email'];
            sessionStorage.setItem('fz_otp_email', currentEmail);
            sessionStorage.setItem('fz_otp_type',  'signup');
            payload = { ...payload, ...fields };

        } else if (type === 'reset') {
            const email = $('reset-email')?.value.trim();
            if (!email)               { setFieldError('reset-email', 'Email is required.'); return; }
            if (!isValidEmail(email)) { setFieldError('reset-email', 'Enter a valid email.'); return; }
            currentEmail = email;
            sessionStorage.setItem('fz_otp_email', currentEmail);
            sessionStorage.setItem('fz_otp_type',  'reset');
            payload.email = email;
        }

        const btn = $(type === 'signup' ? 'signup-btn' : 'reset-btn');
        setBtnLoading(btn, true);

        try {
            const data = await apiPost('/api/auth/send-otp', payload);
            if (data?.success) {
                showNotification('OTP sent! Valid for 10 minutes.', 'success', 4000);
                if (type === 'signup') {
                    showOTPSection('signup-otp-section', 'signup-btn', 'signup-otp-timer', 'signup-resend-btn');
                    $('signup-email-display').textContent = currentEmail;
                } else {
                    showOTPSection('reset-otp-section', 'reset-btn', 'reset-otp-timer', 'reset-resend-btn');
                    $('reset-email-display').textContent = currentEmail;
                }
            } else {
                const field = type === 'signup' ? 'signup-email' : 'reset-email';
                setFieldError(field, data?.message || 'Failed to send OTP. Please try again.');
                setBtnLoading(btn, false);
            }
        } catch (err) {
            showNotification('Cannot connect to server.', 'error');
            setBtnLoading(btn, false);
        }
    }

    function showOTPSection(sectionId, btnId, timerId, resendBtnId) {
        const section = $(sectionId);
        const btn     = $(btnId);
        if (section) { section.classList.remove('is-hidden'); section.hidden = false; }
        if (btn)     { btn.classList.add('is-hidden'); btn.hidden = true; }
        startOTPCountdown(timerId, resendBtnId);
        // Focus the OTP input
        setTimeout(() => {
            const input = section?.querySelector('.otp-input');
            if (input) input.focus();
        }, 100);
    }

    // ── Resend OTP ────────────────────────────────────────────
    async function resendOTP(type) {
        const resendBtnId = type === 'signup' ? 'signup-resend-btn' : 'reset-resend-btn';
        const resendBtn   = $(resendBtnId);
        if (resendBtn) { resendBtn.disabled = true; resendBtn.textContent = 'Sending…'; }

        try {
            const payload = { type, email: currentEmail };
            if (type === 'signup') {
                payload.firstName  = $('signup-first-name')?.value.trim();
                payload.lastName   = $('signup-last-name')?.value.trim();
                payload.employeeId = $('signup-employeeid')?.value.trim();
                payload.contact    = $('signup-contact')?.value.trim();
                payload.position   = $('signup-position')?.value;
                payload.password   = $('signup-password')?.value;
            }
            const data = await apiPost('/api/auth/send-otp', payload);
            if (data?.success) {
                showNotification('New OTP sent! Valid for 10 minutes.', 'success', 4000);
                const input = $(type === 'signup' ? 'signup-otp-input' : 'reset-otp-input');
                if (input) input.value = '';
                startOTPCountdown(
                    type === 'signup' ? 'signup-otp-timer' : 'reset-otp-timer',
                    resendBtnId
                );
                if (resendBtn) resendBtn.hidden = true;
            } else {
                showNotification(data?.message || 'Failed to resend OTP.', 'error');
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend OTP';
                }
            }
        } catch (err) {
            showNotification('Cannot connect to server.', 'error');
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend OTP';
            }
        }
    }

    // ── Verify OTP ────────────────────────────────────────────
    async function verifyOTP(type) {
        const inputId = type === 'signup' ? 'signup-otp-input' : 'reset-otp-input';
        const otp     = $(inputId)?.value.trim();
        const newPassword = type === 'reset' ? $('reset-new-password')?.value : undefined;
        const email = currentEmail || sessionStorage.getItem('fz_otp_email') || '';

        if (!otp || otp.length !== 6) {
            showNotification('Enter the 6-digit OTP code.', 'error');
            $(inputId)?.focus();
            return;
        }
        if (!email) {
            showNotification('Email missing — please go back and re-enter your details.', 'error');
            return;
        }
        if (type === 'reset') {
            if (!newPassword || newPassword.length < 8) {
                setFieldError('reset-new-password', 'Password must be at least 8 characters.');
                return;
            }
        }

        const btn = $(type === 'signup' ? 'signup-verify-btn' : 'reset-update-btn');
        setBtnLoading(btn, true);

        try {
            const body = { email, otp };
            if (newPassword) body.newPassword = newPassword;
            const data = await apiPost('/api/auth/verify-otp', body);
            if (data?.success) {
                clearInterval(otpCountdown);
                showNotification(data.message || 'Verification successful!', 'success', 4000);
                setTimeout(() => switchTab('login'), 1800);
            } else {
                showNotification(data?.message || 'Verification failed.', 'error');
                setBtnLoading(btn, false);
            }
        } catch (err) {
            showNotification('Cannot connect to server.', 'error');
            setBtnLoading(btn, false);
        }
    }

    // ── Biometric / credential auto-fill ──────────────────────
    async function tryBiometricLogin() {
        if (!window.PasswordCredential && !window.FederatedCredential) return;
        try {
            const cred = await navigator.credentials.get({ password: true, mediation: 'optional' });
            if (cred && cred.id && cred.password) {
                const emailEl = $('login-email');
                const passEl  = $('login-password');
                if (emailEl) emailEl.value = cred.id;
                if (passEl)  passEl.value  = cred.password;
                showNotification('Credentials filled — signing you in…', 'info', 2000);
                setTimeout(() => login(), 400);
            }
        } catch (e) { /* user cancelled — ignore */ }
    }

    // ── Dark mode ─────────────────────────────────────────────
    function initDarkMode() {
        const saved = localStorage.getItem('fz-theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
    }
    function toggleDarkMode() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('fz-theme', next);
    }

    // ── OTP input numeric-only + auto-advance ─────────────────
    function restrictToDigits(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        });
        // Paste support: only first 6 digits
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = text.replace(/\D/g, '').slice(0, 6);
            input.value = digits;
        });
    }

    // ── Wire all events ───────────────────────────────────────
    function wireEvents() {
        // Tabs
        $('tab-login') ?.addEventListener('click', () => switchTab('login'));
        $('tab-signup')?.addEventListener('click', () => switchTab('signup'));

        // Forgot password
        $('forgot-link')?.addEventListener('click', () => switchTab('forgot'));

        // Any data-switch-tab
        $$('[data-switch-tab]').forEach(el => {
            el.addEventListener('click', () => switchTab(el.dataset.switchTab));
        });

        // Login form
        $('login-form')?.addEventListener('submit', (e) => { e.preventDefault(); login(); });

        // Signup form
        $('signup-form')?.addEventListener('submit', (e) => { e.preventDefault(); sendOTP('signup'); });
        $('signup-verify-btn')?.addEventListener('click', () => verifyOTP('signup'));
        $('signup-resend-btn')?.addEventListener('click', () => resendOTP('signup'));

        // Forgot form
        $('forgot-form')?.addEventListener('submit', (e) => { e.preventDefault(); sendOTP('reset'); });
        $('reset-update-btn')?.addEventListener('click', () => verifyOTP('reset'));
        $('reset-resend-btn')?.addEventListener('click', () => resendOTP('reset'));

        // Eye toggles (delegated)
        document.addEventListener('click', (e) => {
            const eyeBtn = e.target.closest('.field-eye');
            if (eyeBtn) togglePassword(eyeBtn.dataset.target, eyeBtn);
        });

        // Live email status
        $('signup-email')?.addEventListener('input', updateSignupEmailStatus);

        // Password strength
        $('signup-password')?.addEventListener('input', () =>
            updatePasswordStrength('signup-password', 'signup-pw-bar', 'signup-pw-label'));
        $('reset-new-password')?.addEventListener('input', () =>
            updatePasswordStrength('reset-new-password', 'reset-pw-bar', 'reset-pw-label'));

        // OTP inputs: digits-only
        restrictToDigits($('signup-otp-input'));
        restrictToDigits($('reset-otp-input'));

        // Dark mode toggle
        $('auth-dark-toggle')?.addEventListener('click', toggleDarkMode);

        // Biometric hint
        $('biometric-hint')?.addEventListener('click', tryBiometricLogin);

        // Clear errors on input
        $$('input, select').forEach(input => {
            input.addEventListener('input', () => clearFieldError(input.id));
        });

        // Enter key on OTP submits verify
        ['signup-otp-input', 'reset-otp-input'].forEach(id => {
            $(id)?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    verifyOTP(id === 'signup-otp-input' ? 'signup' : 'reset');
                }
            });
        });

        // Enter on reset new-password → verify (submit, not resend)
        $('reset-new-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyOTP('reset');
            }
        });
    }

    // ── Restore remembered email & biometric hint visibility ──
    function restoreSession() {
        const remembered = localStorage.getItem('fz-remember');
        if (remembered) {
            const emailEl = $('login-email');
            const cb      = $('remember-me');
            if (emailEl) emailEl.value = remembered;
            if (cb) cb.checked = true;
        }
        // Show biometric hint if browser supports it and we have a remembered email
        const hint = $('biometric-hint');
        if (hint && (window.PasswordCredential || window.FederatedCredential) && remembered) {
            hint.hidden = false;
        }
    }

    // ── Auto-redirect if already logged in ───────────────────
    async function checkAutoLogin() {
        try {
            const res  = await fetch(`${API}/api/auth/session`, { credentials: 'include' });
            const data = await res.json();
            if (data?.loggedIn && data.user) {
                window.location.href = 'dashboard.html';
            }
        } catch (e) { /* offline, ignore */ }
    }

    // ── Init ──────────────────────────────────────────────────
    function init() {
        initDarkMode();
        wireEvents();
        restoreSession();
        updateSignupEmailStatus();
        switchTab('login');
        checkAutoLogin();
        // Try biometric in background
        if (window.PasswordCredential || window.FederatedCredential) {
            setTimeout(tryBiometricLogin, 1200);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose globally for inline scripts / debugging
    window.fzAuth = { switchTab, login, sendOTP, verifyOTP, resendOTP };
})();
