// ============================================================
//  utils.js (UPDATED) — shared utilities + API helper
// ============================================================

const API = 'https://freshzone-production.up.railway.app';

// ── API HELPER ────────────────────────────────────────────────
// Attaches the JWT token to every request automatically
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('fz-token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };
    const res = await fetch(`${API}/api${endpoint}`, { ...options, headers });

    // Only logout on 401 (token expired/missing) — NOT on 403 (permission denied)
    // 403 means the user is logged in but lacks permission (e.g. staff trying admin action)
    if (res.status === 401) {
        localStorage.removeItem('fz-token');
        localStorage.removeItem('currentUser');
        window.location.href = 'auth.html';
        return;
    }
    return res.json();
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
    localStorage.removeItem('currentUser');
    localStorage.removeItem('fz-token');
    closeLogoutModal();
    showNotification('Logged out successfully.', 'success');
    setTimeout(() => { window.location.href = 'auth.html'; }, 1200);
}

// ── DARK MODE ─────────────────────────────────────────────────
function initDarkMode() {
    const saved = localStorage.getItem('fz-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('dark-toggle');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}
function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fz-theme', next);
    const btn = document.getElementById('dark-toggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── MOBILE NAV ────────────────────────────────────────────────
function openMobileNav()  { document.getElementById('mobile-nav')?.classList.add('open'); document.getElementById('hamburger')?.classList.add('open'); }
function closeMobileNav() { document.getElementById('mobile-nav')?.classList.remove('open'); document.getElementById('hamburger')?.classList.remove('open'); }

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
        if (w) { w.style.display = 'block'; w.textContent = '⚠️ Session expiring in 2 minutes due to inactivity.'; }
    }, IDLE_LIMIT - WARN_BEFORE);
    _idleTimer = setTimeout(() => {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('fz-token');
        window.location.href = 'auth.html';
    }, IDLE_LIMIT);
}
function initSessionTimeout() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;
    ['click','keydown','mousemove','touchstart','scroll'].forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
}

// ── HOTKEY SYSTEM ─────────────────────────────────────────────
function initHotkeys(pageKey) {
    const map = {
        dashboard: { H:'history.html', P:'profile.html', C:'contact.html' },
        history:   { M:'dashboard.html', P:'profile.html', C:'contact.html' },
        profile:   { M:'dashboard.html', H:'history.html', C:'contact.html' },
        contact:   { M:'dashboard.html', H:'history.html', P:'profile.html' },
    };
    const labels = {
        dashboard: { H:'History', P:'Profile', C:'Contact' },
        history:   { M:'Dashboard', P:'Profile', C:'Contact' },
        profile:   { M:'Dashboard', H:'History', C:'Contact' },
        contact:   { M:'Dashboard', H:'History', P:'Profile' },
    };
    const keys      = map[pageKey]    || {};
    const keyLabels = labels[pageKey] || {};

    // Inject shortcut modal into DOM
    const modal = document.createElement('div');
    modal.id = 'shortcut-modal';
    modal.style.cssText = `
        display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);
        z-index:9999;align-items:center;justify-content:center;
    `;
    const allShortcuts = [
        ...Object.entries(keyLabels).map(([k,v]) => [k, `Go to ${v}`]),
        ['L', 'Logout'],
        ['Esc', 'Close modals'],
    ];
    modal.innerHTML = `
        <div style="background:var(--card-bg,white);border-radius:16px;padding:1.8rem 2rem;
                    max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);
                    font-family:'Inter',sans-serif;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem;">
                <h3 style="margin:0;color:var(--primary,#004e7a);font-size:1.1rem;">⌨ Keyboard Shortcuts</h3>
                <button onclick="document.getElementById('shortcut-modal').style.display='none'"
                    style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--gray,#888);line-height:1;">✕</button>
            </div>
            ${allShortcuts.map(([k,v]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:0.5rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
                    <span style="font-size:0.88rem;color:var(--dark,#333);">${v}</span>
                    <kbd style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;
                                padding:3px 10px;font-size:0.82rem;font-weight:700;
                                color:#334155;font-family:monospace;">${k}</kbd>
                </div>
            `).join('')}
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        const k = e.key.toUpperCase();

        // ? key — show shortcut modal
        if (e.key === '?' || e.key === '/') {
            e.preventDefault();
            const m = document.getElementById('shortcut-modal');
            if (m) m.style.display = m.style.display === 'none' ? 'flex' : 'none';
            return;
        }

        // Navigation shortcuts
        if (keys[k]) {
            showNotification(`⌨ Going to ${keyLabels[k]}…`, 'info', 900);
            setTimeout(() => location.href = keys[k], 700);
            return;
        }

        // Logout
        if (k === 'L') { openLogoutModal(); return; }

        // Close modal/drawer
        if (e.key === 'Escape') {
            document.getElementById('shortcut-modal').style.display = 'none';
            closeLogoutModal();
            return;
        }
    });

    // Badge — click to open shortcuts
    const badge = document.createElement('div');
    badge.className = 'hotkey-badge';
    badge.textContent = '⌨ Press ? for shortcuts';
    badge.style.cursor = 'pointer';
    badge.title = 'Click to view shortcuts';
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
            const cleanup = () => { el.classList.remove('animate-in'); el.style.opacity = '1'; el.style.transform = ''; };
            el.addEventListener('animationend', cleanup, { once: true });
            setTimeout(cleanup, 1200);
        });
    });
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    initSessionTimeout();
    runEntranceAnimations();
});

// ── WEB PUSH NOTIFICATIONS (shared across all pages) ─────────
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
            await apiFetch('/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: _pushSubscription.endpoint }) });
        } catch(e) {}
        _pushSubscription = null;
        updatePushBtn(false);
        showNotification('Push notifications disabled.', 'info');
    } else {
        try {
            // Check if previously blocked
            if (Notification.permission === 'denied') {
                showNotification('Notifications are blocked. Please enable them in your browser settings (🔒 icon in address bar).', 'error', 6000);
                return;
            }
            const keyData = await apiFetch('/push/vapid-public-key');
            if (!keyData || !keyData.publicKey) { showNotification('Push service not configured.', 'error'); return; }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showNotification('Notification permission denied. Click the 🔒 icon in your browser address bar to allow.', 'error', 6000);
                return;
            }
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
            _pushSubscription = sub;
            await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
            updatePushBtn(true);
            showNotification('🔔 Notifications enabled! You will be alerted when vape is detected.', 'success', 5000);
        } catch (err) {
            console.error('[push] Error:', err);
            showNotification('Failed to enable notifications. Try again.', 'error');
        }
    }
}

function updatePushBtn(subscribed) {
    const btn       = document.getElementById('push-btn');
    const lbl       = document.getElementById('push-label');
    const mobileBtn = document.getElementById('mobile-push-btn');
    if (btn) {
        if (subscribed) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
    }
    if (lbl) {
        lbl.textContent = subscribed ? 'ON' : 'OFF';
        lbl.style.color = subscribed ? 'var(--secondary)' : '#aaa';
    }
    if (mobileBtn) mobileBtn.textContent = subscribed ? '🔔 Notifications ON' : '🔔 Notify Me';
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output  = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
    return output;
}

// ── LOADING STATE HELPERS ─────────────────────────────────────
function showCardLoading(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:1rem;">
            <div style="width:12px;height:12px;border-radius:50%;background:var(--gray);opacity:0.5;animation:pulse-dot 1.2s infinite;"></div>
            <span style="color:var(--gray);font-size:0.9rem;">Loading sensor data…</span>
        </div>`;
}

function showAPIError(message = 'Connection error. Retrying…') {
    const bar = document.getElementById('last-updated-bar');
    if (bar) { bar.textContent = '⚠️ ' + message; bar.style.color = 'var(--danger)'; }
}

function clearAPIError() {
    const bar = document.getElementById('last-updated-bar');
    if (bar) { bar.style.color = ''; }
}

// Auto-init push on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initPushNotifications();
});
