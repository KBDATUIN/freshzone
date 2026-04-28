// ============================================================
//  CSRF PROTECTION IMPLEMENTATION GUIDE
// ============================================================

## Overview
FreshZone implements CSRF (Cross-Site Request Forgery) protection using:
- Double-submit cookie pattern
- Automatic token generation and validation
- Graceful error handling for auth flows

## How It Works

### Backend (Node.js/Express)

1. **Token Generation** (`middleware/csrf.js`)
   - `generateCsrfToken()` creates a cryptographically random 64-character hex token
   - Tokens are stored in `fz_csrf` cookie (httpOnly: false for frontend access)

2. **Token Validation** (`middleware/csrf.js`)
   - `csrfProtection` middleware validates POST/PUT/DELETE/PATCH requests
   - Compares cookie token with `x-csrf-token` header
   - Gracefully handles first-time requests (generates token if missing)
   - Allows requests with `x-api-key` or `x-signature` headers (device auth)

3. **Protected Endpoints** (`api/auth.js`)
   - POST /api/auth/login
   - POST /api/auth/send-otp
   - POST /api/auth/verify-otp
   - POST /api/auth/logout
   - GET /api/auth/session (ensures cookie is set)

### Frontend (Browser)

1. **Token Initialization** (`public/csrf-helper.js`)
   - Auto-initializes on page load
   - Fetches token from `/api/auth/csrf-token` if not in cookie
   - Stores token in `fz_csrf` cookie

2. **Token Injection** (`public/auth.js`)
   - All POST requests include `x-csrf-token` header
   - Token retrieved from cookie via `getCsrfToken()`
   - Automatic with `fetch()` calls

## Error Handling

### No Errors on First Request
- If no CSRF token exists, middleware generates one automatically
- Request is allowed to proceed
- Token is set in cookie for subsequent requests

### Validation Failure
- Returns 403 Forbidden with message: "CSRF token validation failed."
- Only occurs if both tokens exist but don't match
- Indicates potential CSRF attack or stale token

### Recovery
- User can refresh page to get new token
- Token is valid for 8 hours (JWT cookie maxAge)
- Automatic token refresh on `/api/auth/csrf-token` GET request

## Usage Examples

### Backend - Protect a Route
```javascript
const { csrfProtection } = require('./middleware/csrf');

router.post('/api/sensitive-action', csrfProtection, async (req, res) => {
    // CSRF token already validated by middleware
    // Safe to process request
});
```

### Frontend - Make Protected Request
```javascript
// Method 1: Using csrf-helper.js
const response = await apiCall('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
});

// Method 2: Manual (already done in auth.js)
const token = getCsrfToken();
const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token
    },
    credentials: 'include',
    body: JSON.stringify({ email, password })
});
```

## Security Considerations

1. **Token Storage**
   - Stored in non-httpOnly cookie (frontend needs access)
   - Secure flag enabled in production
   - SameSite: 'none' in production, 'lax' in development

2. **Token Transmission**
   - Sent via custom header `x-csrf-token` (not in body)
   - Prevents accidental exposure in logs
   - Requires explicit header manipulation (harder to exploit)

3. **Exemptions**
   - GET, HEAD, OPTIONS requests (safe methods)
   - Requests with `x-api-key` header (device authentication)
   - Requests with `x-signature` header (webhook verification)

4. **Rate Limiting**
   - Auth endpoints have separate rate limiter (20 requests/15 min)
   - Prevents brute force attacks
   - Works alongside CSRF protection

## Testing

### Test CSRF Protection
```bash
# Should fail (no CSRF token)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@gmail.com","password":"test123"}'

# Should succeed (with valid token)
TOKEN=$(curl -s http://localhost:3000/api/auth/csrf-token | jq -r '.csrfToken')
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $TOKEN" \
  -b "fz_csrf=$TOKEN" \
  -d '{"email":"test@gmail.com","password":"test123"}'
```

### Test First-Time Request
```bash
# First request should succeed (token auto-generated)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@gmail.com","password":"test123"}' \
  -c cookies.txt

# Subsequent requests with mismatched token should fail
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: invalid-token" \
  -b cookies.txt \
  -d '{"email":"test@gmail.com","password":"test123"}'
```

## Troubleshooting

### "CSRF token validation failed" Error
1. Check browser console for errors
2. Verify `fz_csrf` cookie exists
3. Ensure `x-csrf-token` header is being sent
4. Try refreshing page to get new token
5. Check browser DevTools Network tab for header presence

### Token Not Being Sent
1. Verify `csrf-helper.js` is loaded before `auth.js`
2. Check that `getCsrfToken()` returns a value
3. Ensure `credentials: 'include'` is set in fetch options
4. Check for CORS issues preventing cookie access

### Token Expiration
- Tokens expire after 8 hours (same as JWT)
- User will be logged out automatically
- New token generated on next login

## Files Modified

- `middleware/csrf.js` - Enhanced CSRF protection middleware
- `api/auth.js` - Added CSRF protection to auth endpoints
- `public/csrf-helper.js` - New frontend CSRF token manager
- `public/auth.html` - Added csrf-helper.js script tag
- `server.js` - Already had ensureCsrfCookie middleware

## Compliance

This implementation follows:
- OWASP CSRF Prevention Cheat Sheet
- Double-Submit Cookie Pattern
- SameSite Cookie Attribute standards
- Express.js security best practices
