-- Unified Invoice Hub: harden public.invoices + add dispatch / denormalised-customer columns.
-- Design: docs/architecture/2026-10-20-unified-invoice-hub-design.md
--
-- public.invoices was created as the intended unified invoice hub but never hardened:
-- 36 columns, NO primary key, NO indexes, RLS OFF. No DB function or trigger reads or writes
-- it yet (the sync triggers, backfill, dispatch cron and webhook settlement arrive in later
-- hub tasks), so this is low-risk schema work. It adds:
--   • PRIMARY KEY (id) + UNIQUE INDEX (detail_table, detail_id) — the upsert key the sync triggers use
--   • detail_table / detail_id — which per-type detail row (so_invoices / tl_invoices /
--     contract_invoices + that row's id) a hub row mirrors
--   • btree indexes on the columns the hub is filtered / joined / webhook-looked-up by
--   • dispatch tracking: sent_at, dispatch_status (CHECK whitelist), dispatch_error
--   • denormalised customer_name / customer_phone — the service and contract detail tables
--     carry only text customer fields, so dispatch reads the phone generically from the hub
--   • RLS baseline: authenticated-only (division-scoped RLS is deliberately deferred)
--
-- NAMING — do not "tidy" these to the obvious names. so_invoices was renamed from an older
-- `invoices` table and kept its legacy relation names (invoices_pkey, idx_invoices_customer,
-- idx_invoices_division_id, idx_invoices_sale_order_id, ...). PK / index names are
-- SCHEMA-wide, so reusing them here would either fail (the PK) or — worse — be silently
-- skipped by CREATE INDEX IF NOT EXISTS, leaving the hub without that index. Every
-- hub-owned relation therefore carries an `invoices_hub_` / `idx_invoices_hub_` prefix.
--
-- Re-runnable: columns/indexes use IF NOT EXISTS; the CHECK and the policy are dropped then
-- re-added; the PK is guarded by a catalog check; the superseded unique key is DROPped IF EXISTS.
--
-- Existing callers are unaffected: the Dibsy routes and the public /pay page use the
-- service-role client (bypasses RLS); the one browser reader (Contact Centre orders
-- lazyFetch) runs as an authenticated user. The only DB object built on this table is the
-- supplier_bills view (security_invoker, direction = 'ap'); it has no readers or writers
-- today, and through it `anon` now loses the access it incidentally had (RLS was off).

BEGIN;

-- ── Dispatch tracking + denormalised customer columns ──
-- (payment_status / invoice_type / dibsy_* / pdf_url / phone_id already exist on the table.)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS dispatch_error  text,
  ADD COLUMN IF NOT EXISTS customer_name   text,
  ADD COLUMN IF NOT EXISTS customer_phone  text;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_dispatch_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_dispatch_status_check
  CHECK (dispatch_status IN ('pending', 'sent', 'failed', 'skipped'));

-- ── Detail-row key columns ──
-- Which per-type detail row this hub row mirrors: detail_table = 'so_invoices' |
-- 'tl_invoices' | 'contract_invoices' (open-ended on purpose — no CHECK whitelist, so a new
-- invoicing module needs no schema change) and detail_id = that row's id (all three are uuid).
-- Both nullable: a row without a detail key is simply never matched by the key below.
-- The existing `source` (invoice_source enum: sale_order / contract / quotation) and
-- `invoice_type` (invoice_type enum: cash / credit) columns are shared with so_invoices /
-- supplier_bills and keep that meaning — they are deliberately NOT used as the detail key.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS detail_table text,
  ADD COLUMN IF NOT EXISTS detail_id    uuid;

-- ── Keys ──
-- id is uuid NOT NULL DEFAULT gen_random_uuid(), so the PK is safe on a populated table
-- too (a duplicate id would abort this transaction cleanly). Guard on "any PK exists"
-- rather than on the name so an alternately-named PK also skips.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_hub_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- (detail_table, detail_id) is the hub's upsert key: the sync triggers use
-- ON CONFLICT (detail_table, detail_id). A plain (non-partial) unique index so that column-list
-- inference works; NULLs are distinct, so rows without a detail key never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_hub_detail ON public.invoices (detail_table, detail_id);

-- Superseded key: an earlier revision of this migration (already applied to the dev DB) keyed
-- the hub by UNIQUE (source, source_id). `source` is an enum that cannot carry the detail table
-- name (see above), so that constraint is dropped; this is a no-op on a DB that never had it.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_hub_source_source_id_key;

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_invoices_hub_customer_id      ON public.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_invoice_type     ON public.invoices (invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_payment_status   ON public.invoices (payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_dibsy_payment_id ON public.invoices (dibsy_payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_sale_order_id    ON public.invoices (sale_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_division         ON public.invoices (division);
CREATE INDEX IF NOT EXISTS idx_invoices_hub_created_at       ON public.invoices (created_at);

-- ── RLS baseline (authenticated-only; division-scoped RLS is deferred) ──
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_rw ON public.invoices;
CREATE POLICY invoices_rw ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.invoices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
