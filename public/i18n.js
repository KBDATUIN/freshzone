// ============================================================
//  i18n.js — FreshZone Internationalization (English + Filipino)
// ============================================================

const FZ_TRANSLATIONS = {
    en: {
        // Nav
        nav_dashboard: 'Dashboard',
        nav_history: 'History',
        nav_about: 'About',
        nav_profile: 'Profile',
        nav_contact: 'Contact',
        nav_logout: 'Logout',
        nav_notifications: 'Notifications',

        // Dashboard hero
        hero_eyebrow: 'Clear air · Campus monitoring',
        hero_title: 'Campus Vape Aerosol Detector',
        hero_tagline: 'Live PM1.0, PM2.5 & PM10 readings from sensors in the 4th Floor comfort rooms.',
        hero_btn_history: 'View detection history →',
        live_badge: 'LIVE',

        // Sensor status
        status_loading: 'Loading…',
        status_offline: 'Sensor Offline',
        status_clear: 'Air Clear',
        status_detected: 'VAPE AEROSOL DETECTED',
        status_acknowledged: 'Acknowledged — Awaiting Resolution',
        status_no_data: 'No data received',
        status_last_reading: 'Last reading:',
        status_last_seen: 'Last seen:',

        // Buttons
        btn_acknowledge: 'Acknowledge Alert',
        btn_acknowledging: 'Acknowledging…',
        btn_resolve: 'Mark as Resolved',
        btn_resolving: 'Resolving…',
        btn_calibrate: 'Calibrate Sensor',

        // Last updated bar
        last_updated: 'Last updated:',
        auto_refresh: '— Auto-refreshes every 5 seconds',
        fetching: 'Fetching sensor data…',

        // Staff bar
        staff_bar: 'You are logged in as <strong>Staff</strong>. Only Administrators can acknowledge vape alerts. You will be notified when a vape aerosol is detected on campus.',

        // Alarm overlay
        alarm_title: 'VAPE DETECTED!',
        alarm_acknowledge: 'I Acknowledge',

        // Staff modal
        staff_modal_title: 'Vape Aerosol Detected',
        staff_modal_text: 'A vape aerosol has been detected on campus. Please proceed to the location immediately for inspection.',
        staff_respond_btn: 'On My Way — Mark Responded',
        staff_dismiss_btn: 'Dismiss (Alert stays open)',

        // Logout modal
        logout_title: 'Confirm Logout',
        logout_text: 'Are you sure you want to log out of FreshZone?',
        logout_confirm: 'Yes, Logout',
        logout_cancel: 'Cancel',

        // AQ Guide
        aq_guide_title: 'Air Quality Guide: PM Sensors & AQI',
        aq_guide_chip: 'Live Sensor Education',
        pm10_desc: 'Larger inhalable dust/smoke particles. Useful for understanding overall particulate load in the area.',
        pm25_desc: 'Fine particles used for AQI calculation. Higher PM2.5 means higher short-term respiratory irritation risk.',
        pm1_desc: 'Tiny particles from fresh smoke/aerosol. They can go deep into lungs and spread quickly in enclosed rooms.',
        aq_card1_title: 'How sensors work',
        aq_card1_text: 'The node uses laser scattering. More airborne particles reflect more light, so FreshZone estimates PM concentration in µg/m³ every few seconds.',
        aq_card2_title: 'How AQI works here',
        aq_card2_text: 'AQI converts PM2.5 into a health index. It gives a quick risk level so staff can react faster without reading raw PM values first.',
        aq_card3_title: 'Why three PM values',
        aq_card3_text: 'PM1.0 catches very fine aerosol, PM2.5 powers alerts and AQI, PM10 adds larger-particle context for ventilation and cleanup decisions.',

        // Calibration modal
        cal_title: 'Sensor Calibration',
        cal_subtitle: 'Adjust offset and coefficient applied to raw PM readings before AQI calculation.',
        cal_offset_label: 'PM2.5 Offset (µg/m³)',
        cal_coeff_label: 'PM2.5 Coefficient (multiplier)',
        cal_offset_hint: 'Added to raw PM2.5 value. Use negative to subtract.',
        cal_coeff_hint: 'Raw value is multiplied by this. Default: 1.0',
        cal_save: 'Save Calibration',
        cal_saving: 'Saving…',
        cal_cancel: 'Cancel',
        cal_reset: 'Reset to Default',
        cal_success: 'Calibration saved.',
        cal_error: 'Failed to save calibration.',

        // Language
        lang_label: 'EN',
    },
    fil: {
        // Nav
        nav_dashboard: 'Dashboard',
        nav_history: 'Kasaysayan',
        nav_about: 'Tungkol',
        nav_profile: 'Profil',
        nav_contact: 'Makipag-ugnayan',
        nav_logout: 'Mag-logout',
        nav_notifications: 'Mga Abiso',

        // Dashboard hero
        hero_eyebrow: 'Malinis na hangin · Pagmamatyag sa kampus',
        hero_title: 'Detector ng Vape Aerosol sa Kampus',
        hero_tagline: 'Live na PM1.0, PM2.5 at PM10 mula sa mga sensor sa 4th Floor comfort rooms.',
        hero_btn_history: 'Tingnan ang kasaysayan ng deteksyon →',
        live_badge: 'LIVE',

        // Sensor status
        status_loading: 'Naglo-load…',
        status_offline: 'Sensor Offline',
        status_clear: 'Malinis ang Hangin',
        status_detected: 'NATUKOY ANG VAPE AEROSOL',
        status_acknowledged: 'Natanggap — Naghihintay ng Resolusyon',
        status_no_data: 'Walang natanggap na datos',
        status_last_reading: 'Huling pagbabasa:',
        status_last_seen: 'Huling nakita:',

        // Buttons
        btn_acknowledge: 'Tanggapin ang Alerto',
        btn_acknowledging: 'Tinatanggap…',
        btn_resolve: 'Markahan bilang Nalutas',
        btn_resolving: 'Nireresolba…',
        btn_calibrate: 'I-calibrate ang Sensor',

        // Last updated bar
        last_updated: 'Huling na-update:',
        auto_refresh: '— Awtomatikong nire-refresh tuwing 5 segundo',
        fetching: 'Kinukuha ang datos ng sensor…',

        // Staff bar
        staff_bar: 'Naka-login ka bilang <strong>Staff</strong>. Tanging mga Administrator lamang ang makakatanggap ng mga alerto ng vape. Aabisuhan ka kapag may natukoy na vape aerosol sa kampus.',

        // Alarm overlay
        alarm_title: 'NATUKOY ANG VAPE!',
        alarm_acknowledge: 'Natanggap Ko',

        // Staff modal
        staff_modal_title: 'Natukoy ang Vape Aerosol',
        staff_modal_text: 'May natukoy na vape aerosol sa kampus. Mangyaring pumunta agad sa lokasyon para sa inspeksyon.',
        staff_respond_btn: 'Papunta Na — Markahan bilang Tumugon',
        staff_dismiss_btn: 'I-dismiss (Nananatiling bukas ang alerto)',

        // Logout modal
        logout_title: 'Kumpirmahin ang Pag-logout',
        logout_text: 'Sigurado ka bang gusto mong mag-logout sa FreshZone?',
        logout_confirm: 'Oo, Mag-logout',
        logout_cancel: 'Kanselahin',

        // AQ Guide
        aq_guide_title: 'Gabay sa Kalidad ng Hangin: PM Sensors at AQI',
        aq_guide_chip: 'Edukasyon sa Live Sensor',
        pm10_desc: 'Mas malalaking particle ng alikabok/usok. Kapaki-pakinabang para sa pag-unawa sa kabuuang particulate load sa lugar.',
        pm25_desc: 'Pinong particle para sa pagkalkula ng AQI. Mas mataas ang PM2.5, mas mataas ang panganib sa paghinga.',
        pm1_desc: 'Napakaliit na particle mula sa sariwang usok/aerosol. Maaaring pumunta nang malalim sa baga at kumalat nang mabilis sa saradong silid.',
        aq_card1_title: 'Paano gumagana ang mga sensor',
        aq_card1_text: 'Gumagamit ang node ng laser scattering. Mas maraming particle sa hangin, mas maraming liwanag ang nare-reflect, kaya tinatantya ng FreshZone ang konsentrasyon ng PM sa µg/m³ tuwing ilang segundo.',
        aq_card2_title: 'Paano gumagana ang AQI dito',
        aq_card2_text: 'Kino-convert ng AQI ang PM2.5 sa health index. Nagbibigay ito ng mabilis na antas ng panganib para mas mabilis makatugon ang staff.',
        aq_card3_title: 'Bakit tatlong PM values',
        aq_card3_text: 'Nakukuha ng PM1.0 ang napakaliit na aerosol, pinapagana ng PM2.5 ang mga alerto at AQI, at nagdadagdag ang PM10 ng konteksto para sa bentilasyon at paglilinis.',

        // Calibration modal
        cal_title: 'Calibrasyon ng Sensor',
        cal_subtitle: 'I-adjust ang offset at coefficient na inilalapat sa raw PM readings bago ang pagkalkula ng AQI.',
        cal_offset_label: 'PM2.5 Offset (µg/m³)',
        cal_coeff_label: 'PM2.5 Coefficient (multiplier)',
        cal_offset_hint: 'Idinaragdag sa raw PM2.5 value. Gumamit ng negatibo para ibawas.',
        cal_coeff_hint: 'Pinarami ang raw value nito. Default: 1.0',
        cal_save: 'I-save ang Calibrasyon',
        cal_saving: 'Sine-save…',
        cal_cancel: 'Kanselahin',
        cal_reset: 'I-reset sa Default',
        cal_success: 'Nai-save ang calibrasyon.',
        cal_error: 'Hindi nai-save ang calibrasyon.',

        // Language
        lang_label: 'FIL',
    }
};

// ── State ─────────────────────────────────────────────────────
let _currentLang = localStorage.getItem('fz-lang') || 'en';

function t(key) {
    return (FZ_TRANSLATIONS[_currentLang] || FZ_TRANSLATIONS.en)[key] || key;
}

function setLang(lang) {
    if (!FZ_TRANSLATIONS[lang]) return;
    _currentLang = lang;
    localStorage.setItem('fz-lang', lang);
    applyTranslations();
    updateLangToggle();
}

function getLang() { return _currentLang; }

// Apply [data-i18n] attributes across the page
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = t(key);
        if (el.hasAttribute('data-i18n-html')) {
            el.innerHTML = val;
        } else {
            el.textContent = val;
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });
}

function updateLangToggle() {
    const btn = document.getElementById('lang-toggle-btn');
    if (btn) btn.textContent = _currentLang === 'en' ? 'FIL' : 'EN';
}

function toggleLang() {
    setLang(_currentLang === 'en' ? 'fil' : 'en');
}

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    updateLangToggle();
});
