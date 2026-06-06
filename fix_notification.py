import sys

with open('public/auth-style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Desktop notification block (lines 1663-1717)
old_desktop = """/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION — PREMIUM TOAST
   ═══════════════════════════════════════════════════════════════ */
.notification {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    padding: 1rem 2rem;
    border-radius: 14px;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 20px 60px rgba(0,0,0,0.20), 0 8px 20px rgba(0,0,0,0.10);
    z-index: 9999;
    font-weight: 600;
    font-size: 0.9rem;
    transition: opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
    white-space: nowrap;
    max-width: 90vw;
    text-align: center;
}
.notification.hidden {
    opacity: 0;
    transform: translateX(-50%) translateY(30px) scale(0.96);
    pointer-events: none;
}
.notification.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
}
.notification.success {
    border-left: 4px solid #22c55e;
    color: #166534;
}
.notification.error {
    border-left: 4px solid #ef4444;
    color: #991b1b;
}
.notification.info {
    border-left: 4px solid #00b4d8;
    color: #004e7a;
}
[data-theme=\"dark\"] .notification {
    background: rgba(6,16,30,0.96);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
[data-theme=\"dark\"] .notification.success {
    color: #86efac;
}
[data-theme=\"dark\"] .notification.error {
    color: #fca5a5;
}
[data-theme=\"dark\"] .notification.info {
    color: #67e8f9;
}"""

new_desktop = """/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION — COMPACT TOAST (top-right, colored pill)
   ═══════════════════════════════════════════════════════════════ */
.notification {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    left: auto;
    bottom: auto;
    transform: translateY(-10px) scale(0.95);
    padding: 12px 20px;
    border-radius: 12px;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 8px 28px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
    z-index: 9999;
    font-weight: 600;
    font-size: 0.88rem;
    transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
    white-space: nowrap;
    max-width: 380px;
    text-align: left;
    pointer-events: auto;
    border: none;
}
.notification.hidden {
    opacity: 0;
    transform: translateY(-10px) scale(0.95);
    pointer-events: none;
}
.notification.show {
    opacity: 1;
    transform: translateY(0) scale(1);
}
/* Success — solid green pill, white text */
.notification.success {
    background: #22c55e !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(34,197,94,0.30), 0 2px 8px rgba(0,0,0,0.10);
}
/* Error — solid red pill, white text */
.notification.error {
    background: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(239,68,68,0.30), 0 2px 8px rgba(0,0,0,0.10);
}
/* Info — solid blue pill, white text */
.notification.info {
    background: #00b4d8 !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(0,180,216,0.30), 0 2px 8px rgba(0,0,0,0.10);
}
[data-theme=\"dark\"] .notification.success {
    background: #22c55e !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(34,197,94,0.35), 0 2px 8px rgba(0,0,0,0.20);
}
[data-theme=\"dark\"] .notification.error {
    background: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(239,68,68,0.35), 0 2px 8px rgba(0,0,0,0.20);
}
[data-theme=\"dark\"] .notification.info {
    background: #00b4d8 !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(0,180,216,0.35), 0 2px 8px rgba(0,0,0,0.20);
}"""

if old_desktop in content:
    content = content.replace(old_desktop, new_desktop)
    print("DESKTOP OK")
else:
    print("DESKTOP MISSING - checking partial match...")
    # Try just the beginning to see if it exists
    if "NOTIFICATION \xe2\x80\x94 PREMIUM TOAST" in content:
        print("  (found with em dash)")
    elif "NOTIFICATION — PREMIUM TOAST" in content:
        print("  (found with em dash as char)")
    else:
        print("  (not found anywhere)")
    sys.exit(1)

# 2. Mobile notification block
old_mobile = """    /* \u2500\u2500 Notification: mobile-safe toast \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .notification {
        bottom: 1rem;
        left: 1rem;
        right: 1rem;
        transform: translateX(0) translateY(20px);
        white-space: normal;
        font-size: 0.82rem;
        padding: 0.85rem 1rem;
        max-width: calc(100vw - 2rem);
    }
    .notification.show { transform: translateX(0) translateY(0); }"""

new_mobile = """    /* \u2500\u2500 Notification: mobile toast (top-right, compact) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .notification {
        top: 1rem;
        right: 1rem;
        left: auto;
        bottom: auto;
        transform: translateY(-10px) scale(0.95);
        white-space: normal;
        font-size: 0.82rem;
        padding: 10px 16px;
        max-width: calc(100vw - 2rem);
    }
    .notification.show {
        transform: translateY(0) scale(1);
    }"""

if old_mobile in content:
    content = content.replace(old_mobile, new_mobile)
    print("MOBILE OK")
else:
    print("MOBILE NOT FOUND - will try to find it...")
    # Try searching for the mobile notification section differently
    import re
    match = re.search(r'Notification: mobile-safe toast', content)
    if match:
        print(f"  Found at position {match.start()}")
        # Print surrounding context
        start = max(0, match.start() - 20)
        end = min(len(content), match.end() + 300)
        print(repr(content[start:end]))
    sys.exit(1)

with open('public/auth-style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE")
