-- ============================================================
-- Issue 5: Drop dead column receivals.landed_cost_id
--
-- This column is never read or written by any code.
-- The actual receival↔LC relationship uses
-- landed_costs.attached_receival_ids (uuid[] array).
-- ============================================================

ALTER TABLE public.receivals DROP COLUMN IF EXISTS landed_cost_id;
