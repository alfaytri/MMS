-- ─────────────────────────────────────────────────────────────────────────────
-- Tier 2 of the reason-list cleanup: give the free-text reason fields a managed
-- list to pick from. Seeds reasons for two already-existing categories
-- (adjustment, cancellation) and adds a new `write_off` category.
--
--   adjustment   → stock adjustment reason (WhAdjustmentDialog)
--   write_off    → damaged-stock write-off reason (WriteOffDamagedStockDialog) [new category]
--   cancellation → inventory-check cancel reason (WhInventoryCheckDetail); later SO cancel
--
-- Categories must exist before their reasons (reason_lists_category_must_exist
-- trigger). Idempotent — a re-run is a no-op. Seed wordings are just defaults;
-- admins edit them in Master Data › Reason Lists.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO public.reason_list_categories (slug, label, sort_order, active) VALUES
  ('write_off', 'Write-off', 120, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.reason_lists (category, label, sort_order, active)
SELECT v.category, v.label, v.sort_order, true
FROM (VALUES
  ('adjustment',   'Physical count correction', 10),
  ('adjustment',   'Damaged',                   20),
  ('adjustment',   'Expired',                   30),
  ('adjustment',   'Lost / Missing',            40),
  ('adjustment',   'Found / Surplus',           50),
  ('adjustment',   'Data entry correction',     60),
  ('adjustment',   'Sample / Testing',          70),
  ('write_off',    'Beyond economical repair',  10),
  ('write_off',    'Damaged beyond use',        20),
  ('write_off',    'Expired',                   30),
  ('write_off',    'Obsolete',                  40),
  ('write_off',    'Contaminated / Spoiled',    50),
  ('cancellation', 'Created by mistake',        10),
  ('cancellation', 'Duplicate',                 20),
  ('cancellation', 'No longer needed',          30),
  ('cancellation', 'Superseded / Re-doing',     40),
  ('cancellation', 'Data entry error',          50)
) AS v(category, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reason_lists r
  WHERE r.category = v.category
    AND r.label = v.label
    AND r.deleted_at IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
