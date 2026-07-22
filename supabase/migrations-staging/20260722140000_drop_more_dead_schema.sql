-- Second dead-schema cleanup pass, informed by staging schema audit.
-- Every drop below was verified against src/, RPC bodies, triggers, and
-- edge functions — none of these have any consumer in the app.
--
-- Dropped tables:
--   • customer_addresses — 14-column table with zero code refs. Feature
--     was scaffolded but never wired to any UI. Distinct from the dropped
--     service_customer_addresses (field-services flow).
--   • inventory_groups — grouping feature with JSONB items array, never
--     built. Fragile design; better to redesign as a proper join table
--     if grouping is prioritized later.
--
-- Dropped columns:
--   • notification_config: template_slug, requires_portal, portal_purpose,
--     has_media_followup, media_description, created_by — all belong to
--     a customer-portal / media-followup extension that never shipped.
--     Table itself stays (heavily used).
--   • brands.created_by — never populated, never read.
--   • app_settings.updated_by — never populated, never read.

BEGIN;

DROP TABLE IF EXISTS public.customer_addresses CASCADE;
DROP TABLE IF EXISTS public.inventory_groups CASCADE;

ALTER TABLE public.notification_config
  DROP COLUMN IF EXISTS template_slug,
  DROP COLUMN IF EXISTS requires_portal,
  DROP COLUMN IF EXISTS portal_purpose,
  DROP COLUMN IF EXISTS has_media_followup,
  DROP COLUMN IF EXISTS media_description,
  DROP COLUMN IF EXISTS created_by;

ALTER TABLE public.brands
  DROP COLUMN IF EXISTS created_by;

ALTER TABLE public.app_settings
  DROP COLUMN IF EXISTS updated_by;

COMMIT;
