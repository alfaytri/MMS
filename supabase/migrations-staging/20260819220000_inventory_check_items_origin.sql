-- Warehouse Origin Visibility — Task 2
-- inventory_check_items rows are point-in-time snapshots (they already
-- denormalize item_name / brand / sku). Add a country_name snapshot so a
-- physical counter can tell two same-item+same-brand piles apart by origin.
-- Mirrors the existing `brand` text column exactly (no FK). Nullable; no
-- backfill (test server — historic checks are irrelevant).

ALTER TABLE public.inventory_check_items
  ADD COLUMN IF NOT EXISTS country_name text;
