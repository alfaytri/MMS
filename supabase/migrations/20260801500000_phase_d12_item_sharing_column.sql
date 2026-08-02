-- Phase D.12 Task 1 — selective cross-division item sharing (metadata column)
--
-- Adds `inventory_items.shared_with_division_ids uuid[]` — the list of
-- divisions (other than the item's normal owners) that are allowed to
-- consume this item's stock via the sales cascade picker.
--
-- Semantics defined in later tasks:
--   - Task 2/3 wire the item edit dialog + master-list filter chips.
--   - Task 4 extends the sales cascade to include shared items for the
--     caller's active division.
--   - Task 5 amends the FIFO deduction path to tag COGS to the consumer
--     division when the item was consumed via a share (not via ownership).
--
-- This migration is metadata-only: no RLS relaxation yet. Items already
-- have a permissive `USING (true)` policy for authenticated (see baseline
-- schema line ~16774), so the column is readable/writable by anyone with
-- a session. The consumption gate lives on the stock tables (fifo layers,
-- warehouse_stock_summary) — those stay untouched until Task 4.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS shared_with_division_ids uuid[]
    NOT NULL DEFAULT ARRAY[]::uuid[];

-- GIN index so `WHERE shared_with_division_ids @> ARRAY[<div>]` is fast when
-- the cascade picker starts filtering by "shared with my active division".
CREATE INDEX IF NOT EXISTS idx_inventory_items_shared_with_division_ids
  ON public.inventory_items USING gin (shared_with_division_ids);

COMMENT ON COLUMN public.inventory_items.shared_with_division_ids IS
  'Phase D.12 — divisions granted cross-division consumption access to this item. Empty array = default (no additional sharing). Item catalog itself is globally visible; this list expands who can DEDUCT stock of the item through the sales cascade.';
