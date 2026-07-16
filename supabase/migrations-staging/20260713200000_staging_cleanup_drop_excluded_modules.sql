-- ============================================================================
-- STAGING CLEANUP — drop tables/views/functions not needed for inventory build
-- ============================================================================
-- Modules removed:
--   Services/Orders, Contracts, Subscriptions, Chat/Contact Centre,
--   Teams/Employees, Promotions/Vouchers, QC, QuickBooks, standalone RFQs,
--   Reminders, Traccar, Tool Assets, Media Downloads
-- ============================================================================

BEGIN;

-- ── 1. Drop views first (depend on tables) ──────────────────────────────────

DROP VIEW IF EXISTS public.calendar_visits CASCADE;
DROP VIEW IF EXISTS public.subscription_packages_with_counts CASCADE;
DROP VIEW IF EXISTS public.v_team_monthly_overtime CASCADE;

-- ── 2. Drop tables — Services / Orders (field service) ──────────────────────

DROP TABLE IF EXISTS public.order_quotation_line_items CASCADE;
DROP TABLE IF EXISTS public.order_quotation_log CASCADE;
DROP TABLE IF EXISTS public.order_quotations CASCADE;
DROP TABLE IF EXISTS public.order_services CASCADE;
DROP TABLE IF EXISTS public.order_team_assignments CASCADE;
DROP TABLE IF EXISTS public.order_visit_dates CASCADE;
DROP TABLE IF EXISTS public.order_log CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.site_visit_team_assignments CASCADE;
DROP TABLE IF EXISTS public.site_visit_dates CASCADE;
DROP TABLE IF EXISTS public.site_visits CASCADE;
DROP TABLE IF EXISTS public.installed_products CASCADE;
DROP TABLE IF EXISTS public.instructions CASCADE;
DROP TABLE IF EXISTS public.service_brands CASCADE;
DROP TABLE IF EXISTS public.service_customer_addresses CASCADE;
DROP TABLE IF EXISTS public.service_customer_phones CASCADE;
DROP TABLE IF EXISTS public.service_customers CASCADE;
DROP TABLE IF EXISTS public.service_edit_requests CASCADE;
DROP TABLE IF EXISTS public.service_instructions CASCADE;
DROP TABLE IF EXISTS public.service_inventory CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;

-- ── 3. Drop tables — Contracts ──────────────────────────────────────────────

DROP TABLE IF EXISTS public.contract_visits CASCADE;
DROP TABLE IF EXISTS public.contract_milestones CASCADE;
DROP TABLE IF EXISTS public.contract_payments CASCADE;
DROP TABLE IF EXISTS public.contract_services CASCADE;
DROP TABLE IF EXISTS public.contracts CASCADE;

-- ── 4. Drop tables — Subscriptions ──────────────────────────────────────────

DROP TABLE IF EXISTS public.subscription_package_services CASCADE;
DROP TABLE IF EXISTS public.customer_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_usage_log CASCADE;
DROP TABLE IF EXISTS public.subscription_packages CASCADE;

-- ── 5. Drop tables — Chat / Contact Centre ──────────────────────────────────

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_conversations CASCADE;
DROP TABLE IF EXISTS public.call_records CASCADE;
DROP TABLE IF EXISTS public.follow_up_requests CASCADE;

-- ── 6. Drop tables — Teams / Employees / Vehicles ───────────────────────────

DROP TABLE IF EXISTS public.team_schedule_assignments CASCADE;
DROP TABLE IF EXISTS public.team_activity_log CASCADE;
DROP TABLE IF EXISTS public.team_live_locations CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.employee_services CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.schedules CASCADE;

-- ── 7. Drop tables — Promotions / Vouchers ──────────────────────────────────

DROP TABLE IF EXISTS public.voucher_redemptions CASCADE;
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.promotion_rules CASCADE;
DROP TABLE IF EXISTS public.promotion_campaigns CASCADE;

-- ── 8. Drop tables — QC (Quality Control) ───────────────────────────────────

DROP TABLE IF EXISTS public.qc_inspection_results CASCADE;
DROP TABLE IF EXISTS public.qc_schedule CASCADE;
DROP TABLE IF EXISTS public.qc_team_scores CASCADE;
DROP TABLE IF EXISTS public.qc_checklists CASCADE;

-- ── 9. Drop tables — QuickBooks sync ────────────────────────────────────────

DROP TABLE IF EXISTS public.qb_accounts CASCADE;
DROP TABLE IF EXISTS public.qb_division_mappings CASCADE;
DROP TABLE IF EXISTS public.qb_items CASCADE;
DROP TABLE IF EXISTS public.sync_state CASCADE;

-- ── 10. Drop tables — Standalone RFQs ───────────────────────────────────────

DROP TABLE IF EXISTS public.rfq_quotes CASCADE;
DROP TABLE IF EXISTS public.rfq_line_items CASCADE;
DROP TABLE IF EXISTS public.rfqs CASCADE;

-- ── 11. Drop tables — Other excluded ────────────────────────────────────────

DROP TABLE IF EXISTS public.reminders CASCADE;
DROP TABLE IF EXISTS public.reminder_categories CASCADE;
DROP TABLE IF EXISTS public.traccar_geofences CASCADE;
DROP TABLE IF EXISTS public.tool_assignments CASCADE;
DROP TABLE IF EXISTS public.tool_asset_units CASCADE;
DROP TABLE IF EXISTS public.tool_asset_items CASCADE;
DROP TABLE IF EXISTS public.media_download_jobs CASCADE;
DROP TABLE IF EXISTS public.purge_batches CASCADE;

-- ── 12. Drop orphaned functions for excluded modules ────────────────────────

DROP FUNCTION IF EXISTS public.save_employee CASCADE;
DROP FUNCTION IF EXISTS public.upsert_chat_message CASCADE;
DROP FUNCTION IF EXISTS public.is_contract_visible CASCADE;
DROP FUNCTION IF EXISTS public.dedup_chat_messages CASCADE;

-- ── 13. Drop orphaned enum types for excluded modules ───────────────────────

DROP TYPE IF EXISTS public.campaign_status CASCADE;
DROP TYPE IF EXISTS public.confirmation_status CASCADE;
DROP TYPE IF EXISTS public.contract_status CASCADE;
DROP TYPE IF EXISTS public.contract_type CASCADE;
DROP TYPE IF EXISTS public.employee_status CASCADE;
DROP TYPE IF EXISTS public.follow_up_request_status CASCADE;

COMMIT;
