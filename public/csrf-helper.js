// ============================================================
//  csrf-helper.js — CSRF Token Management for Frontend
// ============================================================

const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'fz_csrf';

/**
 * Get CSRF token from cookie
 */
function getCsrfTokenFromCookie() {
    const name = CSRF_COOKIE_NAME + '=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArray = decodedCookie.split(';');
    for (let cookie of cookieArray) {
        cookie = cookie.trim();
        if (cookie.indexOf(name) === 0) {
            return cookie.substring(name.length);
        }
    }
    return null;
}

/**
 * Fetch CSRF token from server
 */
async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/auth/csrf-token', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        const data = await response.json();
        return data.csrfToken;
    } catch (err) {
        console.error('[csrf-helper] Error fetching CSRF token:', err);
        return null;
    }
}

/**
 * Ensure CSRF token exists (fetch if needed)
 */
async function ensureCsrfToken() {
    let token = getCsrfTokenFromCookie();
    if (!token) {
        token = await fetchCsrfToken();
    }
    return token;
}

/**
 * Add CSRF token to fetch headers
 */
async function addCsrfToHeaders(headers = {}) {
    const token = await ensureCsrfToken();
    if (token) {
        headers[CSRF_HEADER_NAME] = token;
    }
    return headers;
}

/**
 * Make authenticated API call with CSRF protection
 */
async function apiCall(url, options = {}) {
    const method = options.method || 'GET';
    const headers = options.headers || {};

    // Add CSRF token for POST/PUT/DELETE/PATCH requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
        const csrfHeaders = await addCsrfToHeaders(headers);
        options.headers = csrfHeaders;
    }

    options.credentials = 'include';
    return fetch(url, options);
}

/**
 * Initialize CSRF on page load
 */
async function initCsrf() {
    await ensureCsrfToken();
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCsrf);
} else {
    initCsrf();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getCsrfTokenFromCookie,
        fetchCsrfToken,
        ensureCsrfToken,
        addCsrfToHeaders,
        apiCall,
        initCsrf,
        CSRF_HEADER_NAME,
        CSRF_COOKIE_NAME,
    };
}
