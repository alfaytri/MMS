-- Unified Invoice Hub: backfill existing invoices into the hub.
-- Design: docs/architecture/2026-10-20-unified-invoice-hub-design.md
--
-- 20261154 attached sync_invoice_hub() to so_invoices / tl_invoices / contract_invoices, so every
-- invoice written from then on mirrors one public.invoices (hub) row. Invoices that already existed
-- have no hub row until some later write to them happens to create one. This migration creates the
-- missing rows in one pass: one hub row per detail row, keyed by (detail_table, detail_id).
--
-- THE MAPPING IS sync_invoice_hub()'s, COLUMN FOR COLUMN (see the table in the header of
-- 20261154000000_invoice_hub_sync_triggers.sql), so a backfilled row is identical to the one the
-- trigger would have produced for the same detail row:
--   • detail_table / detail_id, direction = 'ar', and source / source_id / invoice_type = NULL
--     written explicitly (omitting invoice_type would leak the hub's legacy 'credit' default);
--   • so_invoices: customer name / primary phone / division name resolved through customers /
--     customer_phones / company_divisions (snapshot, as in the trigger); subtotal / total / paid
--     NULL -> 0; no Dibsy columns to copy;
--   • tl_invoices: subtotal + spare_parts_amount; issued_date = created_at::date, due on issue;
--   • contract_invoices: issued_date = created_at::date; due_date, else issued_date;
--   • tl_ / contract_invoices: text payment_status 'partial' -> enum 'partially_paid'; the detail
--     row's Dibsy link is copied so the hub reuses it instead of minting a second one.
-- If that mapping ever changes, change it here as well before this file is re-run anywhere.
--
-- THE TWO DELIBERATE DIFFERENCES from the trigger:
--   • dispatch_status = 'sent'. The column default is 'pending', which the dispatch worker acts on:
--     it would mint a Dibsy link and WhatsApp a pay link for every historical invoice. Historical
--     invoices are never auto-dispatched (the trigger does the same when an UPDATE finds no hub
--     row). sent_at / dispatch_error stay NULL, as there.
--   • created_at = the detail row's own created_at (now() if it has none), so a historical row keeps
--     its real invoice date. The trigger leaves the hub default, i.e. the time of first touch.
--
-- Re-runnable: each statement skips a detail row that already has a hub row, testing the whole
-- (detail_table, detail_id) key. An existing hub row is never rewritten (the trigger keeps those in
-- sync), so a second run inserts nothing. Only public.invoices is written, so no detail trigger fires.

BEGIN;

-- ── so_invoices (sales) ──
INSERT INTO public.invoices (
  detail_table, detail_id, direction,
  source, source_id, invoice_type,
  invoice_id, customer_name, customer_phone,
  issued_date, due_date,
  subtotal, discount_amount, total_amount, paid_amount, payment_status,
  pdf_url, division,
  dibsy_payment_id, dibsy_checkout_url,
  dispatch_status, created_at
)
SELECT
  'so_invoices', d.id, 'ar',
  NULL, NULL, NULL,
  d.invoice_id,
  (SELECT c.name FROM public.customers c WHERE c.id = d.customer_id),
  (SELECT cp.phone FROM public.customer_phones cp
    WHERE cp.customer_id = d.customer_id
    ORDER BY cp.is_primary DESC, cp.created_at, cp.id
    LIMIT 1),
  d.issued_date, d.due_date,
  COALESCE(d.subtotal, 0), d.discount_amount, COALESCE(d.total_amount, 0), COALESCE(d.paid_amount, 0), d.payment_status,
  d.pdf_url,
  (SELECT cd.name FROM public.company_divisions cd WHERE cd.id = d.division_id),
  NULL, NULL,
  'sent', COALESCE(d.created_at, now())
FROM public.so_invoices d
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoices i
   WHERE i.detail_table = 'so_invoices' AND i.detail_id = d.id
);

-- ── tl_invoices (service / field, incl. emergency) ──
INSERT INTO public.invoices (
  detail_table, detail_id, direction,
  source, source_id, invoice_type,
  invoice_id, customer_name, customer_phone,
  issued_date, due_date,
  subtotal, discount_amount, total_amount, paid_amount, payment_status,
  pdf_url, division,
  dibsy_payment_id, dibsy_checkout_url,
  dispatch_status, created_at
)
SELECT
  'tl_invoices', d.id, 'ar',
  NULL, NULL, NULL,
  d.invoice_number, d.customer_name, d.customer_phone,
  COALESCE(d.created_at, now())::date, COALESCE(d.created_at, now())::date,
  d.subtotal + d.spare_parts_amount, d.discount_amount, d.total_amount, d.paid_amount,
  (CASE d.payment_status WHEN 'partial' THEN 'partially_paid' ELSE d.payment_status END)::public.invoice_payment_status,
  d.pdf_url, NULL,
  d.dibsy_payment_id, d.dibsy_checkout_url,
  'sent', COALESCE(d.created_at, now())
FROM public.tl_invoices d
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoices i
   WHERE i.detail_table = 'tl_invoices' AND i.detail_id = d.id
);

-- ── contract_invoices ──
INSERT INTO public.invoices (
  detail_table, detail_id, direction,
  source, source_id, invoice_type,
  invoice_id, customer_name, customer_phone,
  issued_date, due_date,
  subtotal, discount_amount, total_amount, paid_amount, payment_status,
  pdf_url, division,
  dibsy_payment_id, dibsy_checkout_url,
  dispatch_status, created_at
)
SELECT
  'contract_invoices', d.id, 'ar',
  NULL, NULL, NULL,
  d.invoice_number, d.customer_name, d.customer_phone,
  COALESCE(d.created_at, now())::date, COALESCE(d.due_date, COALESCE(d.created_at, now())::date),
  d.subtotal, d.discount_amount, d.total_amount, d.paid_amount,
  (CASE d.payment_status WHEN 'partial' THEN 'partially_paid' ELSE d.payment_status END)::public.invoice_payment_status,
  d.pdf_url, NULL,
  d.dibsy_payment_id, d.dibsy_checkout_url,
  'sent', COALESCE(d.created_at, now())
FROM public.contract_invoices d
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoices i
   WHERE i.detail_table = 'contract_invoices' AND i.detail_id = d.id
);

NOTIFY pgrst, 'reload schema';

COMMIT;
