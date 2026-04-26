/**
 * FreshZone Cookie Consent Manager
 * Single-card consent UI with inline preferences.
 */

(function () {
    'use strict';

    const CONSENT_KEY = 'cookie-consent';
    const ANALYTICS_KEY = 'analytics-enabled';
    const PREFERENCES_KEY = 'preference-cookies';
    const CONSENT_COOKIE = 'fz_cookie_consent';
    const ANALYTICS_COOKIE = 'fz_cookie_analytics';
    const PREFERENCES_COOKIE = 'fz_cookie_preferences';
    const ROOT_ID = 'fz-cookie-root';
    const STYLE_ID = 'fz-cookie-style';
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

    const markup = `
        <div id="${ROOT_ID}" hidden>
            <section id="cookie-consent-card" class="fz-cookie-card" role="dialog" aria-modal="false" aria-labelledby="fz-cookie-title">
                <button type="button" id="cookie-close-btn" class="fz-cookie-close" aria-label="Close cookie notice">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>

                <div class="fz-cookie-main">
                    <div class="fz-cookie-copy">
                        <h2 id="fz-cookie-title">Cookies</h2>
                        <p class="fz-cookie-text">
                            We use cookies and similar technologies to personalize your experience, remember settings,
                            and keep FreshZone running smoothly. By clicking accept, you agree as outlined in our
                            <a href="privacy.html#cookies">Cookies Policy</a>.
                        </p>

                        <div class="fz-cookie-actions">
                            <button type="button" id="cookie-accept-btn" class="fz-cookie-btn fz-cookie-btn-primary">Accept</button>
                            <button type="button" id="cookie-preferences-btn" class="fz-cookie-btn fz-cookie-btn-secondary" aria-expanded="false">Preferences</button>
                        </div>
                    </div>

                    <div class="fz-cookie-art" aria-hidden="true">
                        <span class="fz-cookie-circle">
                            <span class="fz-cookie-chip c1"></span>
                            <span class="fz-cookie-chip c2"></span>
                            <span class="fz-cookie-chip c3"></span>
                            <span class="fz-cookie-chip c4"></span>
                            <span class="fz-cookie-chip c5"></span>
                            <span class="fz-cookie-chip c6"></span>
                            <span class="fz-cookie-chip c7"></span>
                            <span class="fz-cookie-chip c8"></span>
                            <span class="fz-cookie-chip c9"></span>
                            <span class="fz-cookie-chip c10"></span>
                            <span class="fz-cookie-chip c11"></span>
                            <span class="fz-cookie-chip c12"></span>
                        </span>
                    </div>
                </div>

                <div id="cookie-preferences-panel" class="fz-cookie-panel" hidden>
                    <div class="fz-cookie-panel-head">
                        <p class="fz-cookie-eyebrow">Cookie Preferences</p>
                        <h3>Choose what FreshZone can store on this device.</h3>
                    </div>

                    <div class="fz-cookie-pref-list">
                        <article class="fz-cookie-pref-card">
                            <div class="fz-cookie-pref-copy">
                                <h4>Essential cookies</h4>
                                <p>Required for login, security, CSRF protection, and core page behavior.</p>
                            </div>
                            <span class="fz-cookie-pill">Always active</span>
                        </article>

                        <article class="fz-cookie-pref-card">
                            <div class="fz-cookie-pref-copy">
                                <h4>Preference cookies</h4>
                                <p>Remember theme mode and interface choices for your next visit.</p>
                            </div>
                            <label class="fz-cookie-switch" for="preference-toggle">
                                <input type="checkbox" id="preference-toggle" />
                                <span class="fz-cookie-slider" aria-hidden="true"></span>
                            </label>
                        </article>

                        <article class="fz-cookie-pref-card">
                            <div class="fz-cookie-pref-copy">
                                <h4>Analytics cookies</h4>
                                <p>Help us understand usage patterns so we can improve performance and layout.</p>
                            </div>
                            <label class="fz-cookie-switch" for="analytics-toggle">
                                <input type="checkbox" id="analytics-toggle" />
                                <span class="fz-cookie-slider" aria-hidden="true"></span>
                            </label>
                        </article>
                    </div>

                    <p class="fz-cookie-helper">You can keep only essentials, or save optional preferences for a smoother return visit.</p>

                    <div class="fz-cookie-panel-actions">
                        <button type="button" id="cookie-save-essentials" class="fz-cookie-btn fz-cookie-btn-secondary">Use essentials only</button>
                        <button type="button" id="cookie-save-btn" class="fz-cookie-btn fz-cookie-btn-primary">Save choices</button>
                    </div>
                </div>
            </section>
        </div>
    `;

    const styles = `
        <style id="${STYLE_ID}">
            #${ROOT_ID}[hidden] { display: none !important; }
            .fz-cookie-card {
                position: fixed;
                left: max(1.25rem, env(safe-area-inset-left));
                bottom: max(1rem, env(safe-area-inset-bottom));
                z-index: 10000;
                width: min(calc(100vw - 2.5rem), 620px);
                margin: 0;
                padding: 1.55rem 1.6rem 1.5rem;
                border-radius: 22px;
                background: #ffffff;
                color: #1f2937;
                border: 2px solid rgba(15, 23, 42, 0.72);
                box-shadow: 12px 12px 0 rgba(15, 23, 42, 0.12);
                display: grid;
                gap: 1rem;
            }
            .fz-cookie-main {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 150px;
                gap: 1.25rem;
                align-items: center;
                min-width: 0;
            }
            .fz-cookie-copy h2,
            .fz-cookie-panel-head h3,
            .fz-cookie-pref-copy h4 {
                margin: 0;
                color: inherit;
                font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
                line-height: 1.15;
            }
            .fz-cookie-copy h2 {
                font-size: clamp(1.55rem, 2.4vw, 1.95rem);
                font-weight: 800;
            }
            .fz-cookie-text,
            .fz-cookie-pref-copy p,
            .fz-cookie-helper {
                margin: 0;
                color: #4b5563;
                font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
                font-size: 0.97rem;
                line-height: 1.55;
            }
            .fz-cookie-text {
                max-width: 100%;
                margin-top: 0.8rem;
                font-size: 0.95rem;
            }
            .fz-cookie-text a {
                color: var(--primary, #004e7a);
                font-weight: 700;
                text-decoration: none;
            }
            .fz-cookie-text a:hover,
            .fz-cookie-text a:focus-visible {
                text-decoration: underline;
            }
            .fz-cookie-actions,
            .fz-cookie-panel-actions {
                display: flex;
                gap: 0.8rem;
                flex-wrap: wrap;
            }
            .fz-cookie-actions {
                margin-top: 1rem;
            }
            .fz-cookie-btn,
            .fz-cookie-close {
                font: inherit;
                border: none;
                cursor: pointer;
            }
            .fz-cookie-btn {
                width: auto;
                min-width: 138px;
                min-height: 50px;
                margin: 0;
                padding: 0.8rem 1.2rem;
                border-radius: 12px;
                font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
                font-size: 0.95rem;
                font-weight: 800;
                letter-spacing: 0;
                box-shadow: none;
                position: relative;
            }
            .fz-cookie-btn::after,
            .fz-cookie-close::after {
                display: none !important;
            }
            .fz-cookie-btn-primary {
                color: #ffffff;
                background: #050505;
            }
            .fz-cookie-btn-secondary {
                color: #111827;
                background: #eef1f4;
                border: 1px solid #d7dde4;
            }
            .fz-cookie-close {
                position: absolute;
                top: 0.95rem;
                right: 0.95rem;
                width: 2.2rem;
                height: 2.2rem;
                padding: 0;
                margin: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: #1f2937;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
                border-radius: 999px;
            }
            .fz-cookie-close svg {
                width: 1rem;
                height: 1rem;
                display: block;
                pointer-events: none;
            }
            .fz-cookie-art {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 150px;
            }
            .fz-cookie-circle {
                position: relative;
                width: 7.4rem;
                aspect-ratio: 1;
                border-radius: 50%;
                background: #f6b266;
            }
            .fz-cookie-chip {
                position: absolute;
                width: 0.55rem;
                height: 0.55rem;
                border-radius: 50%;
                background: rgba(108, 76, 58, 0.82);
            }
            .c1 { top: 15%; left: 28%; }
            .c2 { top: 12%; left: 49%; }
            .c3 { top: 18%; left: 70%; }
            .c4 { top: 31%; left: 22%; }
            .c5 { top: 27%; left: 44%; }
            .c6 { top: 39%; left: 62%; }
            .c7 { top: 52%; left: 20%; }
            .c8 { top: 48%; left: 42%; }
            .c9 { top: 56%; left: 68%; }
            .c10 { top: 69%; left: 29%; }
            .c11 { top: 65%; left: 50%; }
            .c12 { top: 77%; left: 57%; }
            .fz-cookie-panel {
                padding-top: 0.3rem;
                border-top: 1px solid #e5eaf0;
            }
            .fz-cookie-panel-head h3 {
                font-size: clamp(1.1rem, 2.2vw, 1.4rem);
                font-weight: 800;
            }
            .fz-cookie-eyebrow {
                margin: 0 0 0.45rem;
                font-size: 0.74rem;
                font-weight: 800;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: var(--secondary, #00b4d8);
                font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
            }
            .fz-cookie-pref-list {
                display: grid;
                gap: 0.85rem;
                margin-top: 1rem;
            }
            .fz-cookie-pref-card {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 1rem;
                padding: 1rem;
                border-radius: 18px;
                background: #f3f6f9;
                border: 1px solid #dbe5ee;
            }
            .fz-cookie-pref-copy {
                min-width: 0;
            }
            .fz-cookie-pref-copy h4 {
                font-size: 1rem;
                font-weight: 800;
            }
            .fz-cookie-pref-copy p {
                margin-top: 0.35rem;
                max-width: 22rem;
                font-size: 0.92rem;
            }
            .fz-cookie-pill {
                flex-shrink: 0;
                padding: 0.45rem 0.85rem;
                border-radius: 999px;
                font-size: 0.76rem;
                font-weight: 800;
                color: #0f766e;
                background: rgba(20, 184, 166, 0.14);
                font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
            }
            .fz-cookie-switch {
                position: relative;
                width: 52px;
                height: 30px;
                flex-shrink: 0;
            }
            .fz-cookie-switch input {
                position: absolute;
                inset: 0;
                opacity: 0;
                cursor: pointer;
            }
            .fz-cookie-slider {
                position: absolute;
                inset: 0;
                border-radius: 999px;
                background: #b1bdd0;
                transition: background 0.2s ease;
            }
            .fz-cookie-slider::after {
                content: "";
                position: absolute;
                top: 3px;
                left: 3px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #ffffff;
                box-shadow: 0 4px 10px rgba(15, 23, 42, 0.16);
                transition: transform 0.2s ease;
            }
            .fz-cookie-switch input:checked + .fz-cookie-slider {
                background: linear-gradient(135deg, var(--primary, #004e7a), var(--secondary, #00b4d8));
            }
            .fz-cookie-switch input:checked + .fz-cookie-slider::after {
                transform: translateX(22px);
            }
            .fz-cookie-helper {
                margin-top: 1rem;
                font-size: 0.85rem;
            }
            .fz-cookie-panel-actions {
                margin-top: 1rem;
            }
            .fz-cookie-panel-actions .fz-cookie-btn {
                flex: 1 1 180px;
            }
            @media (max-width: 699px) {
                .fz-cookie-main {
                    grid-template-columns: 1fr;
                    gap: 0.95rem;
                }
                .fz-cookie-close {
                    top: 0.8rem;
                    right: 0.8rem;
                }
                .fz-cookie-art {
                    width: auto;
                    justify-content: center;
                    order: 2;
                }
                .fz-cookie-circle {
                    width: 6rem;
                }
            }
            @media (max-width: 640px) {
                .fz-cookie-card {
                    left: max(0.75rem, env(safe-area-inset-left));
                    bottom: max(0.75rem, env(safe-area-inset-bottom));
                    width: min(calc(100vw - 1.5rem), 420px);
                    padding: 1.1rem 1rem 1rem;
                    border-radius: 18px;
                    box-shadow: 8px 8px 0 rgba(15, 23, 42, 0.12);
                }
                .fz-cookie-copy h2 {
                    font-size: 1.35rem;
                }
                .fz-cookie-text {
                    margin-top: 0.65rem;
                    font-size: 0.9rem;
                }
                .fz-cookie-actions,
                .fz-cookie-panel-actions {
                    flex-direction: column;
                }
                .fz-cookie-actions .fz-cookie-btn,
                .fz-cookie-panel-actions .fz-cookie-btn {
                    width: 100%;
                }
                .fz-cookie-pref-card {
                    align-items: flex-start;
                }
            }
        </style>
    `;

    function canUseStorage(storage) {
        try {
            const key = '__fz_storage_test__';
            storage.setItem(key, '1');
            storage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    const storageAvailable = canUseStorage(window.localStorage);

    function cleanupOldUi() {
        const oldRoot = document.getElementById(ROOT_ID);
        const oldStyle = document.getElementById(STYLE_ID);
        if (oldRoot) oldRoot.remove();
        if (oldStyle) oldStyle.remove();
    }

    function storageGet(key) {
        if (!storageAvailable) return null;
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function storageSet(key, value) {
        if (!storageAvailable) return;
        try {
            localStorage.setItem(key, value);
        } catch (error) {}
    }

    function getCookie(name) {
        const encodedName = encodeURIComponent(name) + '=';
        const parts = document.cookie ? document.cookie.split('; ') : [];
        for (let i = 0; i < parts.length; i += 1) {
            if (parts[i].indexOf(encodedName) === 0) {
                return decodeURIComponent(parts[i].slice(encodedName.length));
            }
        }
        return null;
    }

    function setCookie(name, value, maxAgeSeconds) {
        document.cookie = [
            encodeURIComponent(name) + '=' + encodeURIComponent(value),
            'path=/',
            'max-age=' + String(maxAgeSeconds),
            'SameSite=Lax'
        ].join('; ');
    }

    function clearCookie(name) {
        document.cookie = encodeURIComponent(name) + '=; path=/; max-age=0; SameSite=Lax';
    }

    function readBool(cookieName, storageKey, fallbackValue) {
        const cookieValue = getCookie(cookieName);
        if (cookieValue !== null) return cookieValue === 'true';
        const storageValue = storageGet(storageKey);
        if (storageValue === null) return fallbackValue;
        return storageValue === 'true';
    }

    function getConsent() {
        return getCookie(CONSENT_COOKIE) || storageGet(CONSENT_KEY);
    }

    function isAnalyticsEnabled() {
        return readBool(ANALYTICS_COOKIE, ANALYTICS_KEY, false);
    }

    function arePreferenceCookiesEnabled() {
        return readBool(PREFERENCES_COOKIE, PREFERENCES_KEY, true);
    }

    function setAnalyticsEnabled(enabled) {
        const normalized = String(Boolean(enabled));
        storageSet(ANALYTICS_KEY, normalized);
        if (enabled) setCookie(ANALYTICS_COOKIE, normalized, COOKIE_MAX_AGE);
        else clearCookie(ANALYTICS_COOKIE);
    }

    function setPreferenceCookiesEnabled(enabled) {
        const normalized = String(Boolean(enabled));
        storageSet(PREFERENCES_KEY, normalized);
        if (enabled) setCookie(PREFERENCES_COOKIE, normalized, COOKIE_MAX_AGE);
        else clearCookie(PREFERENCES_COOKIE);
    }

    function persistConsent(type) {
        storageSet(CONSENT_KEY, type);
        setCookie(CONSENT_COOKIE, type, COOKIE_MAX_AGE);
    }

    function ensureUI() {
        if (!document.getElementById(STYLE_ID)) {
            document.head.insertAdjacentHTML('beforeend', styles);
        }
        if (!document.getElementById(ROOT_ID)) {
            document.body.insertAdjacentHTML('beforeend', markup);
            bindUI();
        }
        return {
            root: document.getElementById(ROOT_ID),
            panel: document.getElementById('cookie-preferences-panel'),
            preferencesBtn: document.getElementById('cookie-preferences-btn'),
            analyticsToggle: document.getElementById('analytics-toggle'),
            preferenceToggle: document.getElementById('preference-toggle')
        };
    }

    function bindUI() {
        document.getElementById('cookie-accept-btn').addEventListener('click', acceptAllCookies);
        document.getElementById('cookie-preferences-btn').addEventListener('click', togglePreferencesPanel);
        document.getElementById('cookie-close-btn').addEventListener('click', saveEssentialsOnly);
        document.getElementById('cookie-save-essentials').addEventListener('click', saveEssentialsOnly);
        document.getElementById('cookie-save-btn').addEventListener('click', savePreferencesFromPanel);
    }

    function openPreferencesPanel(useSavedValues) {
        const ui = ensureUI();
        ui.preferenceToggle.checked = useSavedValues ? arePreferenceCookiesEnabled() : true;
        ui.analyticsToggle.checked = useSavedValues ? isAnalyticsEnabled() : false;
        ui.panel.hidden = false;
        ui.preferencesBtn.setAttribute('aria-expanded', 'true');
    }

    function closePreferencesPanel() {
        const ui = ensureUI();
        ui.panel.hidden = true;
        ui.preferencesBtn.setAttribute('aria-expanded', 'false');
    }

    function togglePreferencesPanel() {
        const ui = ensureUI();
        if (ui.panel.hidden) openPreferencesPanel(true);
        else closePreferencesPanel();
    }

    function hideCard() {
        const root = document.getElementById(ROOT_ID);
        if (root) root.hidden = true;
    }

    function acceptAllCookies() {
        setPreferenceCookiesEnabled(true);
        setAnalyticsEnabled(true);
        persistConsent('accepted');
        hideCard();
    }

    function saveEssentialsOnly() {
        setPreferenceCookiesEnabled(false);
        setAnalyticsEnabled(false);
        persistConsent('essential');
        hideCard();
    }

    function savePreferencesFromPanel() {
        const preferenceToggle = document.getElementById('preference-toggle');
        const analyticsToggle = document.getElementById('analytics-toggle');
        const preferencesEnabled = Boolean(preferenceToggle && preferenceToggle.checked);
        const analyticsEnabled = Boolean(analyticsToggle && analyticsToggle.checked);

        setPreferenceCookiesEnabled(preferencesEnabled);
        setAnalyticsEnabled(analyticsEnabled);
        persistConsent(preferencesEnabled || analyticsEnabled ? 'custom' : 'essential');
        hideCard();
    }

    function init() {
        cleanupOldUi();
        if (!getConsent()) {
            const ui = ensureUI();
            ui.root.hidden = false;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Global listener for [data-cookie-preferences] buttons on any page
    // Works even when consent was already given and the banner was never shown
    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-cookie-preferences]');
        if (!trigger) return;
        e.preventDefault();
        const ui = ensureUI();
        ui.root.hidden = false;
        openPreferencesPanel(true);
    });

    window.FreshZoneCookies = {
        getConsent: getConsent,
        isAnalyticsEnabled: isAnalyticsEnabled,
        arePreferenceCookiesEnabled: arePreferenceCookiesEnabled,
        acceptAll: acceptAllCookies,
        saveEssentialsOnly: saveEssentialsOnly,
        showSettings: function () {
            const ui = ensureUI();
            ui.root.hidden = false;
            openPreferencesPanel(true);
        }
    };
})();
