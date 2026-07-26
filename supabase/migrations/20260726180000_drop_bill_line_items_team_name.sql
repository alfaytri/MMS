-- ============================================================
-- Drop unused bill_line_items.team_name column
--
-- Context: bill_line_items was cloned from the legacy
-- invoice_line_items table by migration 20260721140000. The
-- backfill carried team_name over, but no code writes to it
-- going forward — bill_line_items serves supplier AP bills where
-- "which team performed the work" doesn't apply (that concept
-- belonged on the old service-invoice model). No hook, RPC,
-- trigger, or UI writes to this column, and no reader depends
-- on it.
-- ============================================================

ALTER TABLE public.bill_line_items
  DROP COLUMN IF EXISTS team_name;

NOTIFY pgrst, 'reload schema';
