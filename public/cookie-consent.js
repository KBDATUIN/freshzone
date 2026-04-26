/**
 * FreshZone Cookie Consent Manager
 * Handles cookie consent banner display and user preferences
 */

(function() {
    'use strict';

    const CONSENT_KEY = 'cookie-consent';
    const ANALYTICS_ENABLED_KEY = 'analytics-enabled';

    // Cookie consent banner HTML template
    const bannerHTML = `
        <div id="cookie-consent-banner" class="cookie-banner" style="display:none;position:fixed;bottom:0;left:0;right:0;background:var(--card-bg, #fff);border-top:1px solid var(--border-color, #e0e0e0);padding:1rem 1.5rem;z-index:10000;box-shadow:0 -4px 20px rgba(0,0,0,0.1);">
            <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                <p style="margin:0;font-size:1rem;color:var(--text);flex:1;min-width:280px;font-weight:500;">
                    🍪 We use cookies to enhance your experience.
                </p>
                <div style="display:flex;gap:0.75rem;flex-shrink:0;flex-wrap:wrap;">
                    <button id="cookie-accept-btn" style="padding:0.6rem 1.5rem;background:var(--primary);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;transition:background 0.2s;">Got it!</button>
                    <button id="cookie-decline-btn" style="padding:0.6rem 1.5rem;background:transparent;color:var(--gray);border:1px solid var(--border-color, #e0e0e0);border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;transition:all 0.2s;">Essential Only</button>
                </div>
            </div>
        </div>
    `;

    // Settings modal HTML
    const settingsModalHTML = `
        <div id="cookie-settings-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem;">
            <div style="background:var(--card-bg, #fff);border-radius:16px;padding:2rem;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <h2 style="margin:0 0 1.5rem;color:var(--primary);font-size:1.4rem;">Cookie Preferences</h2>
                
                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;background:rgba(0,0,0,0.03);border-radius:8px;">
                        <div>
                            <strong style="display:block;margin-bottom:0.25rem;">Essential Cookies</strong>
                            <span style="font-size:0.85rem;color:var(--gray);">Required for authentication and security</span>
                        </div>
                        <span style="color:var(--success);font-weight:600;">Always Active</span>
                    </div>
                </div>

                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;background:rgba(0,0,0,0.03);border-radius:8px;">
                        <div>
                            <strong style="display:block;margin-bottom:0.25rem;">Analytics Cookies</strong>
                            <span style="font-size:0.85rem;color:var(--gray);">Help us understand how you use the platform</span>
                        </div>
                        <label class="toggle-switch" style="position:relative;display:inline-block;width:48px;height:26px;">
                            <input type="checkbox" id="analytics-toggle" style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;inset:0;background:#ccc;border-radius:26px;transition:0.3s;">
                                <span style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;"></span>
                            </span>
                        </label>
                    </div>
                </div>

                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;background:rgba(0,0,0,0.03);border-radius:8px;">
                        <div>
                            <strong style="display:block;margin-bottom:0.25rem;">Preference Cookies</strong>
                            <span style="font-size:0.85rem;color:var(--gray);">Remember your settings (e.g., dark mode)</span>
                        </div>
                        <label class="toggle-switch" style="position:relative;display:inline-block;width:48px;height:26px;">
                            <input type="checkbox" id="preference-toggle" checked style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;inset:0;background:#ccc;border-radius:26px;transition:0.3s;">
                                <span style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;"></span>
                            </span>
                        </label>
                    </div>
                </div>

                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button id="cookie-modal-cancel" style="padding:0.6rem 1.5rem;background:transparent;color:var(--gray);border:1px solid var(--border-color, #e0e0e0);border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;">Cancel</button>
                    <button id="cookie-modal-save" style="padding:0.6rem 1.5rem;background:var(--primary);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;">Save Preferences</button>
                </div>
            </div>
        </div>
    `;

    // Toggle switch styles
    const toggleStyles = `
        <style>
            #analytics-toggle:checked + span,
            #preference-toggle:checked + span {
                background: var(--primary, #004e7a);
            }
            #analytics-toggle:checked + span span,
            #preference-toggle:checked + span span {
                transform: translateX(22px);
            }
            .cookie-banner button:hover {
                filter: brightness(1.1);
            }
            #cookie-decline-btn:hover {
                border-color: var(--gray) !important;
                color: var(--text) !important;
            }
        </style>
    `;

    // Check if consent has been given
    function getConsent() {
        return localStorage.getItem(CONSENT_KEY);
    }

    // Save consent preference
    function saveConsent(consentType) {
        localStorage.setItem(CONSENT_KEY, consentType);
    }

    // Check if analytics are enabled
    function isAnalyticsEnabled() {
        return localStorage.getItem(ANALYTICS_ENABLED_KEY) === 'true';
    }

    // Enable/disable analytics
    function setAnalyticsEnabled(enabled) {
        localStorage.setItem(ANALYTICS_ENABLED_KEY, enabled.toString());
        if (enabled) {
            initializeAnalytics();
        }
    }

    // Initialize analytics (placeholder - integrate with your analytics provider)
    function initializeAnalytics() {
        // This is where you would initialize your analytics provider
        // e.g., Google Analytics, Matomo, etc.
        console.log('[Cookie Consent] Analytics initialized');
        
        // Example: gtag('config', 'GA_MEASUREMENT_ID');
    }

    // Show the cookie consent banner
    function showBanner() {
        // Inject styles
        document.head.insertAdjacentHTML('beforeend', toggleStyles);
        
        // Add banner to body
        document.body.insertAdjacentHTML('beforeend', bannerHTML);
        document.body.insertAdjacentHTML('beforeend', settingsModalHTML);
        
        const banner = document.getElementById('cookie-consent-banner');
        const acceptBtn = document.getElementById('cookie-accept-btn');
        const declineBtn = document.getElementById('cookie-decline-btn');
        const modal = document.getElementById('cookie-settings-modal');
        const modalCancel = document.getElementById('cookie-modal-cancel');
        const modalSave = document.getElementById('cookie-modal-save');
        const analyticsToggle = document.getElementById('analytics-toggle');
        const preferenceToggle = document.getElementById('preference-toggle');

        // Show banner
        banner.style.display = 'block';

        // Accept all cookies
        acceptBtn.addEventListener('click', function() {
            saveConsent('accepted');
            setAnalyticsEnabled(true);
            localStorage.setItem('preference-cookies', 'true');
            banner.style.display = 'none';
        });

        // Decline non-essential cookies
        // FIXED: Now triggers the detailed preferences modal instead of silent decline
        declineBtn.addEventListener('click', function() {
            analyticsToggle.checked = isAnalyticsEnabled();
            preferenceToggle.checked = localStorage.getItem('preference-cookies') !== 'false';
            modal.style.display = 'flex';
        });

        // Close modal
        modalCancel.addEventListener('click', function() {
            modal.style.display = 'none';
        });

        // Save preferences from modal
        modalSave.addEventListener('click', function() {
            const analytics = analyticsToggle.checked;
            const preferences = preferenceToggle.checked;
            
            setAnalyticsEnabled(analytics);
            localStorage.setItem('preference-cookies', preferences.toString());
            saveConsent('accepted');
            modal.style.display = 'none';
            banner.style.display = 'none';
        });

        // Close modal on outside click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Initialize cookie consent on page load
    function init() {
        const consent = getConsent();
        
        if (!consent) {
            // No consent recorded, show banner
            showBanner();
        } else if (consent === 'accepted') {
            // Previously accepted - check if analytics should be initialized
            if (isAnalyticsEnabled()) {
                initializeAnalytics();
            }
        }
        // If declined, do nothing (only essential cookies)
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API for external use
    window.FreshZoneCookies = {
        getConsent: getConsent,
        isAnalyticsEnabled: isAnalyticsEnabled,
        setAnalyticsEnabled: setAnalyticsEnabled,
        showSettings: function() {
            const modal = document.getElementById('cookie-settings-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
        }
    };

})();