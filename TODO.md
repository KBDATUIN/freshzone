# FreshZone GDPR / Data Retention Implementation

## Step 1: Fix data_retention_policy.sql schema mismatches ✅
- [x] Remove non-existent tables: email_logs, sessions
- [x] Add actual tables: system_logs (logged_at), contact_tickets (created_at), push_subscriptions (created_at)
- [x] Update sp_hard_delete_user_data to use actual FK paths (no recipient_email on push_notifications)
- [x] Add deleted_at / deletion_reason / is_active columns to accounts with safe IF NOT EXISTS
- [x] Add data_retention_config and data_retention_audit tables
- [x] Add stored procedures: sp_cleanup_expired_data, sp_run_all_retention_cleanups, sp_soft_delete_account, sp_hard_delete_user_data
- [x] Add v_data_retention_status view

## Step 2: Wire daily retention cron into server.js ✅
- [x] Add cron.schedule('0 2 * * *', ...) block calling CALL sp_run_all_retention_cleanups()
- [x] Add logger info/error lines for audit trail

## Step 3: Update api/profile.js with soft-delete + GDPR hard-delete ✅
- [x] DELETE /api/profile → calls sp_soft_delete_account (sets deleted_at, is_active = 0)
- [x] POST /api/profile/hard-delete → calls sp_hard_delete_user_data (GDPR Right to Erasure)
- [x] Both endpoints require auth and return proper success/error JSON

## Step 4: Verify cookie-consent.js + DPO footer on all public pages ✅
- [x] auth.html — already had cookie-consent.js + DPO footer
- [x] dashboard.html — already had cookie-consent.js + DPO footer
- [x] privacy.html — already had cookie-consent.js + DPO footer
- [x] terms.html — already had cookie-consent.js + DPO footer
- [x] about.html — updated footer + added cookie-consent.js
- [x] contact.html — updated footer + added cookie-consent.js
- [x] history.html — updated footer + added cookie-consent.js
- [x] profile.html — updated footer + added cookie-consent.js
- [x] smoke.html — updated footer + added cookie-consent.js
- [x] offline.html — updated footer + added cookie-consent.js

## Step 5: Testing & Verification (Pending)
- [ ] Run data_retention_policy.sql against freshzone_db in phpMyAdmin
- [ ] Verify data_retention_config table populated with correct retention periods
- [ ] Test CALL sp_run_all_retention_cleanups() manually and check data_retention_audit
- [ ] Test soft-delete endpoint: DELETE /api/profile with auth token
- [ ] Test hard-delete endpoint: POST /api/profile/hard-delete with auth token
- [ ] Verify cookie consent banner appears on all pages in incognito mode
- [ ] Verify DPO footer links work on all pages

## Notes
- node-cron is already in package.json dependencies (v3.0.3)
- The SQL uses DELIMITER // for stored procedures — run via phpMyAdmin SQL tab, not Node.js
- sp_hard_delete_user_data anonymizes detection_events.acknowledged_by instead of deleting rows (preserves compliance data)
- All HTML pages now link to terms.html, privacy.html, and mailto:dpo@freshzone.space

