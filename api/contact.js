// ============================================================
//  api/contact.js — Submit & manage support tickets
// ============================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── POST /api/contact ─────────────────────────────────────────
// Any logged-in user can submit a ticket
router.post('/', authMiddleware, async (req, res) => {
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim().slice(0, 200) : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    const name    = (req.body.name || req.user.full_name || req.user.name || '').toString().slice(0, 100);
    const email   = (req.body.email || req.user.email || '').toString().slice(0, 255);

    const validSubjects = ['Vape Alert Feedback', 'Device Maintenance', 'General Suggestion', 'Bug Report', 'Other'];
    if (!subject || !validSubjects.includes(subject))
        return res.status(400).json({ success: false, message: 'Please select a valid subject.' });

    if (!message)
        return res.status(400).json({ success: false, message: 'Message is required.' });

    if (message.length < 10)
        return res.status(400).json({ success: false, message: 'Message is too short (min 10 characters).' });

    const ticketRef = 'TK-' + Date.now().toString().slice(-6);

    try {
        await db.query(
            `INSERT INTO contact_tickets
                (ticket_ref, account_id, submitter_name, submitter_email, subject, message)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ticketRef, req.user.id, name, email, subject, message.trim()]
        );

        res.json({
            success: true,
            message: `Report submitted! Ticket ID: ${ticketRef}`,
            ticket_ref: ticketRef
        });
    } catch (err) {
        console.error('Contact POST error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/contact ──────────────────────────────────────────
// Admin inbox — all tickets
router.get('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ct.*, a.full_name AS resolved_by_name
             FROM contact_tickets ct
             LEFT JOIN accounts a ON a.id = ct.resolved_by
             ORDER BY ct.created_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/contact/:id/resolve ────────────────────────────
router.post('/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
    try {
        await db.query(
            `UPDATE contact_tickets
             SET ticket_status = 'Resolved', resolved_by = ?, resolved_at = NOW()
             WHERE id = ?`,
            [req.user.id, req.params.id]
        );
        res.json({ success: true, message: 'Ticket marked as resolved.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── DELETE /api/contact/:id ───────────────────────────────────
// Admin only — permanently delete a ticket/message
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const [result] = await db.query(
            `DELETE FROM contact_tickets WHERE id = ?`,
            [req.params.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Ticket not found.' });
        }
        res.json({ success: true, message: 'Ticket deleted successfully.' });
    } catch (err) {
        console.error('Contact DELETE error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
