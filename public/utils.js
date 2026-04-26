// ============================================================
//  utils.js — FreshZone shared utilities
// ============================================================

// Dynamic API discovery to handle localhost vs production environments
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://freshzone-production.up.railway.app';

let sessionUserPromise = null;

// ── API HELPER ────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    const res = await fetch(`${API}/api${endpoint}`, { ...options, headers, credentials: 'include' });
    if (res.status === 401) {
        localStorage.removeItem('currentUser');
        window.location.href = 'auth.html';
        return;
    }
    return res.json();
}

async function hydrateSessionUser() {
    const cachedUser = localStorage.getItem('currentUser');
    if (cachedUser) {
        try {
            return JSON.parse(cachedUser);
        } catch (err) {
            localStorage.removeItem('currentUser');
        }
    }

    if (sessionUserPromise) return sessionUserPromise;

    sessionUserPromise = (async () => {
        try {
            const res = await fetch(`${API}/api/auth/session`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok && data?.success && data.user) {
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                return data.user;
            }
        } catch (err) {}
        localStorage.removeItem('currentUser');
        return null;
    })();

    try {
        return await sessionUserPromise;
    } finally {
        sessionUserPromise = null;
    }
}

// ── NOTIFICATION ─────────────────────────────────────────────
function showNotification(message, type = 'info', duration = 3000) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = message;
    n.className = `notification show ${type}`;
    setTimeout(() => { n.className = 'notification'; }, duration);
}

// ── LOGOUT MODAL ──────────────────────────────────────────────
function openLogoutModal()  { const m = document.getElementById('logoutModal'); if(m) m.style.display='flex'; }
function closeLogoutModal() { const m = document.getElementById('logoutModal'); if(m) m.style.display='none'; }
function confirmLogout() {
    apiFetch('/auth/logout', { method: 'POST' })
        .catch(() => null)
        .finally(() => {
            localStorage.removeItem('currentUser');
            sessionUserPromise = null;
            closeLogoutModal();
            showNotification('Logged out successfully.', 'success');
            setTimeout(() => { window.location.href = 'auth.html'; }, 1200);
        });
}

// ── DARK MODE ─────────────────────────────────────────────────
const _ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const _ICON_SUN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function _updateToggleBtns(theme) {
    ['dark-toggle','auth-dark-toggle'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.innerHTML = theme === 'dark' ? _ICON_SUN : _ICON_MOON;
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    });
}

function initDarkMode() {
    const saved = localStorage.getItem('fz-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    _updateToggleBtns(saved);
}

function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fz-theme', next);
    _updateToggleBtns(next);
}

// ── MOBILE NAV ────────────────────────────────────────────────
function openMobileNav() {
    const nav = document.getElementById('mobile-nav');
    const hamburger = document.getElementById('hamburger');
    if (!nav) return;

    // Prevent double-open
    if (nav.classList.contains('open')) return;

    nav.classList.add('open');
    // Mark hamburger as open (CSS will hide it via opacity to remove double-X)
    if (hamburger) {
        hamburger.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
    }
    // Lock scroll — use padding to prevent layout shift
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarW > 0) document.body.style.paddingRight = scrollbarW + 'px';

    // Focus the close button inside drawer for accessibility
    requestAnimationFrame(() => {
        document.querySelector('.mobile-nav-close')?.focus();
    });
}

function closeMobileNav() {
    const nav = document.getElementById('mobile-nav');
    const hamburger = document.getElementById('hamburger');
    if (!nav) return;

    nav.classList.remove('open');
    if (hamburger) {
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        // Return focus to hamburger after close
        requestAnimationFrame(() => hamburger.focus());
    }
    // Restore scroll
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
}

// Close mobile nav on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeMobileNav();
        closeLogoutModal();
    }
});

// ── SESSION TIMEOUT (30 min idle) ─────────────────────────────
let _idleTimer, _warnTimer;
const IDLE_LIMIT  = 30 * 60 * 1000;
const WARN_BEFORE = 2  * 60 * 1000;

function resetIdleTimer() {
    clearTimeout(_idleTimer); clearTimeout(_warnTimer);
    const warn = document.getElementById('session-warning');
    if (warn) warn.style.display = 'none';
    _warnTimer = setTimeout(() => {
        const w = document.getElementById('session-warning');
        if (w) { w.style.display = 'block'; w.textContent = 'Session expiring in 2 minutes due to inactivity.'; }
    }, IDLE_LIMIT - WARN_BEFORE);
    _idleTimer = setTimeout(() => {
        localStorage.removeItem('currentUser');
        window.location.href = 'auth.html';
    }, IDLE_LIMIT);
}
function initSessionTimeout() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;
    ['click','keydown','mousemove','touchstart','scroll'].forEach(e =>
        document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
}

// ── HOTKEY SYSTEM ─────────────────────────────────────────────
function initHotkeys(pageKey) {
    const map = {
        dashboard: { H:'history.html', P:'profile.html', C:'contact.html', A:'about.html' },
        history:   { M:'dashboard.html', P:'profile.html', C:'contact.html', A:'about.html' },
        about:     { M:'dashboard.html', H:'history.html', P:'profile.html', C:'contact.html', A:'about.html' },
        profile:   { M:'dashboard.html', H:'history.html', C:'contact.html', A:'about.html' },
        contact:   { M:'dashboard.html', H:'history.html', P:'profile.html', A:'about.html' },
    };
    const labels = {
        dashboard: { H:'History', P:'Profile', C:'Contact', A:'About' },
        history:   { M:'Dashboard', P:'Profile', C:'Contact', A:'About' },
        about:     { M:'Dashboard', H:'History', P:'Profile', C:'Contact', A:'About' },
        profile:   { M:'Dashboard', H:'History', C:'Contact', A:'About' },
        contact:   { M:'Dashboard', H:'History', P:'Profile', A:'About' },
    };
    const keys = map[pageKey] || {};
    const keyLabels = labels[pageKey] || {};

    const modal = document.createElement('div');
    modal.id = 'shortcut-modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;';
    const allShortcuts = [
        ...Object.entries(keyLabels).map(([k,v]) => [k, `Go to ${v}`]),
        ['L', 'Logout'], ['Esc', 'Close dialogs'],
    ];
    modal.innerHTML = `
        <div style="background:var(--card-bg,white);border-radius:16px;padding:1.8rem 2rem;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem;">
                <h3 style="margin:0;color:var(--primary,#004e7a);font-size:1.05rem;font-family:Syne,sans-serif;">Keyboard Shortcuts</h3>
                <button onclick="document.getElementById('shortcut-modal').style.display='none'"
                    style="background:none;border:none;cursor:pointer;color:var(--gray,#888);width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:6px;padding:0;margin:0;box-shadow:none !important;"
                    aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            ${allShortcuts.map(([k,v]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
                    <span style="font-size:0.87rem;color:var(--dark,#333);">${v}</span>
                    <kbd style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:3px 10px;font-size:0.8rem;font-weight:700;color:#334155;font-family:monospace;">${k}</kbd>
                </div>
            `).join('')}
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        const k = e.key.toUpperCase();
        if (e.key === '?' || e.key === '/') {
            e.preventDefault();
            const m = document.getElementById('shortcut-modal');
            if (m) m.style.display = m.style.display === 'none' ? 'flex' : 'none';
            return;
        }
        if (keys[k]) {
            showNotification(`Going to ${keyLabels[k]}…`, 'info', 900);
            setTimeout(() => location.href = keys[k], 700);
            return;
        }
        if (k === 'L') { openLogoutModal(); return; }
        if (e.key === 'Escape') {
            document.getElementById('shortcut-modal').style.display = 'none';
            closeLogoutModal(); closeMobileNav();
        }
    });

    const badge = document.createElement('div');
    badge.className = 'hotkey-badge';
    badge.textContent = '⌨ Press ? for shortcuts';
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', () => {
        const m = document.getElementById('shortcut-modal');
        if (m) m.style.display = 'flex';
    });
    document.body.appendChild(badge);
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
    if (isPassword) { eyeOn.style.setProperty('display','none','important'); eyeOff.style.setProperty('display','block','important'); }
    else            { eyeOn.style.setProperty('display','block','important'); eyeOff.style.setProperty('display','none','important'); }
}

// ── ENTRANCE ANIMATIONS ───────────────────────────────────────
function runEntranceAnimations() {
    const targets = ['.glass-card','.hero','.stat-box','.log-container','.auth-card','.location-card','.page-hero'];
    targets.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.classList.add('animate-in');
            const cleanup = () => { el.classList.remove('animate-in'); el.style.opacity='1'; el.style.transform=''; };
            el.addEventListener('animationend', cleanup, { once:true });
            setTimeout(cleanup, 1200);
        });
    });
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    initSessionTimeout();
    runEntranceAnimations();
    hydrateSessionUser();
});

// ── WEB PUSH NOTIFICATIONS ────────────────────────────────────
let _pushSubscription = null;

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (existing) { _pushSubscription = existing; updatePushBtn(true); }
    } catch (err) { console.warn('[push] SW init failed:', err.message); }
}

async function togglePushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        showNotification('Push notifications not supported in this browser.', 'error'); return;
    }
    const reg = await navigator.serviceWorker.ready;
    if (_pushSubscription) {
        try {
            await _pushSubscription.unsubscribe();
            await apiFetch('/push/unsubscribe', { method:'DELETE', body:JSON.stringify({ endpoint:_pushSubscription.endpoint }) });
        } catch(e) {}
        _pushSubscription = null;
        updatePushBtn(false);
        showNotification('Push notifications disabled.', 'info');
    } else {
        try {
            if (Notification.permission === 'denied') {
                showNotification('Notifications are blocked. Please enable them in browser settings.', 'error', 6000); return;
            }
            const keyData = await apiFetch('/push/vapid-public-key');
            if (!keyData?.publicKey) { showNotification('Push service not configured.', 'error'); return; }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showNotification('Notification permission denied. Check browser settings.', 'error', 6000); return;
            }
            const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(keyData.publicKey) });
            _pushSubscription = sub;
            await apiFetch('/push/subscribe', { method:'POST', body:JSON.stringify({ subscription:sub }) });
            updatePushBtn(true);
            showNotification('Notifications enabled! You will be alerted when vape is detected.', 'success', 5000);
        } catch (err) {
            console.error('[push] Error:', err);
            showNotification('Failed to enable notifications. Try again.', 'error');
        }
    }
}

function updatePushBtn(subscribed) {
    const btn = document.getElementById('push-btn');
    const lbl = document.getElementById('push-label');
    const mobileBtn = document.getElementById('mobile-push-btn');
    if (btn) { subscribed ? btn.classList.add('active') : btn.classList.remove('active'); btn.style.background=''; btn.style.color=''; }
    if (lbl) { lbl.textContent = subscribed ? 'ON' : 'OFF'; lbl.style.color = subscribed ? 'var(--secondary)' : '#94a3b8'; }
    if (mobileBtn) {
        const bellSvg = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
        mobileBtn.innerHTML = `${bellSvg} ${subscribed ? 'Notifications ON' : 'Notify Me'}`;
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
    const rawData = window.atob(base64);
    const output  = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
    return output;
}

// ── LOADING STATE HELPERS ─────────────────────────────────────
function showCardLoading(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:1rem;"><div style="width:10px;height:10px;border-radius:50%;background:var(--gray);opacity:0.4;animation:pulse-dot 1.2s infinite;"></div><span style="color:var(--gray);font-size:0.9rem;">Loading sensor data…</span></div>`;
}
function showAPIError(message = 'Connection error. Retrying…') {
    const bar = document.getElementById('last-updated-bar');
    if (bar) { bar.textContent = message; bar.style.color = 'var(--danger)'; }
}
function clearAPIError() {
    const bar = document.getElementById('last-updated-bar');
    if (bar) { bar.style.color = ''; }
}

document.addEventListener('DOMContentLoaded', () => { initPushNotifications(); });
