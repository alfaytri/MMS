-- Drop dead schema — no rows, no readers, no writers.
--
-- Identified via the column-usage audit on 2026-07-22:
--   • 4 entirely-dead tables (0 rows, 0 code refs across src/ + edge fns)
--   • 8 dead columns on otherwise-live tables
--
-- If any of these features come back, the schema gets designed with the
-- code that actually needs it — no orphan tables/columns lying around.

BEGIN;

-- ── Entirely dead tables ────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.payment_sessions       CASCADE;
DROP TABLE IF EXISTS public.notification_trail     CASCADE;
DROP TABLE IF EXISTS public.webhook_logs           CASCADE;
DROP TABLE IF EXISTS public.warehouse_manager_log  CASCADE;

-- ── Dead columns on live tables ─────────────────────────────────────────────
ALTER TABLE public.customers                DROP COLUMN IF EXISTS pending_balance;
ALTER TABLE public.customers                DROP COLUMN IF EXISTS subscription_tag;
ALTER TABLE public.inventory_brand_variants DROP COLUMN IF EXISTS incoming_eta;
ALTER TABLE public.notification_templates   DROP COLUMN IF EXISTS button_type;
ALTER TABLE public.notification_templates   DROP COLUMN IF EXISTS button_url_suffix_param;
ALTER TABLE public.notification_templates   DROP COLUMN IF EXISTS has_buttons;
ALTER TABLE public.notification_templates   DROP COLUMN IF EXISTS param_count;
ALTER TABLE public.notification_templates   DROP COLUMN IF EXISTS param_names;

COMMIT;
