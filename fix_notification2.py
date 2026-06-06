# Read the file
with open('public/auth-style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# The exact text from the file (read via code-searcher)
# Lines 1663-1717: the desktop notification block
old_desktop_start = "/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\r\n   NOTIFICATION \u2014 PREMIUM TOAST\r\n   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */"

# Use regex to find the notification section
import re

# Find the notification section by matching unique patterns
# Look for the section header and capture everything until the next section
pattern = r'(/\* \u2550{86}\r?\n   NOTIFICATION \u2014 PREMIUM TOAST\r?\n   \u2550{86} \*/[^/]*?)(?=\n/\* \u2550{86}\r?\n   RESPONSIVE)'
match = re.search(pattern, content, re.DOTALL)

if match:
    old_block = match.group(1)
    print(f"Found notification block: {len(old_block)} chars")
else:
    print("NOTIFICATION block not found via regex")
    # Try simpler approach
    idx = content.find("NOTIFICATION")
    print(f"First 'NOTIFICATION' at index {idx}")
    if idx > 0:
        print(repr(content[idx-5:idx+50]))
    sys.exit(1)

new_block = """/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   NOTIFICATION -- COMPACT TOAST (top-right, colored pill)
   ========================================================================== */
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
/* Success -- solid green pill, white text */
.notification.success {
    background: #22c55e !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(34,197,94,0.30), 0 2px 8px rgba(0,0,0,0.10);
}
/* Error -- solid red pill, white text */
.notification.error {
    background: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 8px 28px rgba(239,68,68,0.30), 0 2px 8px rgba(0,0,0,0.10);
}
/* Info -- solid blue pill, white text */
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

content = content.replace(old_block, new_block)
print("DESKTOP replaced")

# 2. Mobile notification: find by unique pattern
mobile_pattern = r'(/\* \u2500{2} Notification: mobile-safe toast \u2500{56} \*/.*?\.notification\.show \{ transform: translateX\(0\) translateY\(0\); \})'
mobile_match = re.search(mobile_pattern, content, re.DOTALL)

if mobile_match:
    old_mobile = mobile_match.group(1)
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
    content = content.replace(old_mobile, new_mobile)
    print("MOBILE replaced")
else:
    print("MOBILE not found via regex")
    # Find approximate location
    idx = content.find("mobile-safe toast")
    if idx >= 0:
        print(f"Found at {idx}")
        print(repr(content[idx:idx+300]))
    else:
        idx = content.find("Notification: mobile")
        if idx >= 0:
            print(f"Found 'Notification: mobile' at {idx}")

with open('public/auth-style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE")
