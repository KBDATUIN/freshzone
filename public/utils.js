// ============================================================
//  utils.js (UPDATED) — shared utilities + API helper
// ============================================================

const API = 'https://unreceptive-pseudocharitable-jorge.ngrok-free.dev';

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

    // If 401/403 → token expired, redirect to login
    if (res.status === 401 || res.status === 403) {
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
