-- 20261077000000_services_no_inventory_needed.sql
-- Service Links redesign: mark a service as needing no inventory, so the UI can
-- distinguish "reviewed — needs nothing" (grey) from "not yet linked" (amber).
-- Lets the Needs-supply queue exclude services that genuinely require no items.
BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS no_inventory_needed boolean NOT NULL DEFAULT false;

COMMIT;
