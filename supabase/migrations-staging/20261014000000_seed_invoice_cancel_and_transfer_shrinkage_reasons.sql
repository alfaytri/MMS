-- ─────────────────────────────────────────────────────────────────────────────
-- Seed two reason-list categories the app already references but that were never
-- populated:
--   * invoice_cancel     — VoidInvoiceDialog reads reason_lists('invoice_cancel'),
--                          but the category was never created, so that "Void
--                          Invoice → Reason" dropdown rendered EMPTY (latent bug).
--   * transfer_shrinkage — replaces the hardcoded SHRINKAGE_REASONS TS array in
--                          WhTransfersTab so the shrinkage options become
--                          admin-managed from Master Data › Reason Lists. The
--                          receive RPCs treat shrinkage_reason as free text
--                          ('Shrinkage: ' || reason), so storing the label going
--                          forward is safe and reads better than the old slug.
--
-- Categories must exist before their reasons (the reason_lists_category_must_exist
-- trigger). Idempotent — a re-run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO public.reason_list_categories (slug, label, sort_order, active) VALUES
  ('invoice_cancel',     'Invoice Void / Cancel', 100, true),
  ('transfer_shrinkage', 'Transfer Shrinkage',    110, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.reason_lists (category, label, sort_order, active)
SELECT v.category, v.label, v.sort_order, true
FROM (VALUES
  ('invoice_cancel',     'Issued in error',               10),
  ('invoice_cancel',     'Duplicate invoice',             20),
  ('invoice_cancel',     'Wrong amount',                  30),
  ('invoice_cancel',     'Customer cancelled order',      40),
  ('invoice_cancel',     'Replaced by corrected invoice', 50),
  ('transfer_shrinkage', 'Damaged in Transit',            10),
  ('transfer_shrinkage', 'Missing',                       20),
  ('transfer_shrinkage', 'Wrong Item',                    30),
  ('transfer_shrinkage', 'Other',                         40)
) AS v(category, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reason_lists r
  WHERE r.category = v.category
    AND r.label = v.label
    AND r.deleted_at IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
