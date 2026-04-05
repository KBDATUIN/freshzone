// ============================================================
//  FRESHZONE — role-guard.js
//  Centralised auth & role utilities
// ============================================================

const currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (!currentUser) {
    alert('Please login first.');
    window.location.href = 'auth.html';
}

function isAdmin() {
    return currentUser?.position === 'Administrator';
}

function isStaff() {
    return currentUser?.position === 'Staff / Teachers';
}

function requireAdmin() {
    if (!isAdmin()) {
        alert('Access denied: Administrator only.');
        window.location.href = 'dashboard.html';
    }
}