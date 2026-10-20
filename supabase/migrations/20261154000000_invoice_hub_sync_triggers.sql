-- Unified Invoice Hub: detail -> hub sync triggers + hub write lockdown.
-- Design: docs/architecture/2026-10-20-unified-invoice-hub-design.md
--
-- public.invoices is the hub: one row per customer-facing invoice. The per-type detail tables
-- (so_invoices / tl_invoices / contract_invoices) stay canonical for accounting; each of them now
-- mirrors ONE hub row automatically, so the hub cannot be "forgotten" by some code path. The
-- direction is strictly detail -> hub.
--
--   • public.sync_invoice_hub() — an AFTER INSERT OR UPDATE row-trigger function. One branch per
--     detail table (TG_TABLE_NAME) maps that table's columns onto the hub's common columns; ONE
--     shared upsert then writes the hub row, keyed by (detail_table, detail_id) = (table, NEW.id)
--     through idx_invoices_hub_detail. Three triggers attach it.
--   • Hub write lockdown (last section): the SECURITY DEFINER function is now the only
--     authenticated-side writer, so 20261153's broad FOR ALL policy / write grants are removed.
--
-- COLUMN MAPPING (the three detail tables do not share a schema):
--
--   hub column        so_invoices                   tl_invoices                       contract_invoices
--   ----------------  ----------------------------  --------------------------------  --------------------------
--   invoice_id        invoice_id                    invoice_number                    invoice_number
--   customer_name     customers.name (customer_id)  customer_name                     customer_name
--   customer_phone    primary customer_phones row   customer_phone                    customer_phone
--   issued_date       issued_date                   created_at::date                  created_at::date
--   due_date          due_date                      issued_date (due on issue)        due_date, else issued_date
--   subtotal          subtotal (NULL -> 0)          subtotal + spare_parts_amount     subtotal
--   discount_amount   discount_amount               discount_amount                   discount_amount
--   total / paid      total_amount, paid_amount     total_amount, paid_amount         total_amount, paid_amount
--   payment_status    payment_status (same enum)    'partial' -> 'partially_paid'     'partial' -> 'partially_paid'
--   pdf_url           pdf_url                       pdf_url                           pdf_url
--   division          company_divisions.name        NULL                              NULL
--   dibsy_*           NULL (no such columns)        dibsy_payment_id / _checkout_url  same
--
--   Always set: detail_table, detail_id, direction = 'ar', and source / source_id / invoice_type
--   = NULL explicitly (invoice_type keeps DEFAULT 'credit' on the hub; omitting it would leak that
--   legacy cash/credit value onto every hub row). The business-line kind (sales / service /
--   contract) is NOT stored; it is derived from detail_table in code. Hub columns not listed
--   (status, doc_status, tax, customer_id, sale_order_id, phone_id, ...) keep their defaults.
--
--   Notes on the mapping:
--   • The hub's payment_status is the enum invoice_payment_status (unpaid / partially_paid / paid /
--     overdue / void), but tl_ / contract_invoices store text constrained to unpaid / partial / paid.
--     A bare cast would raise on 'partial' and roll back the detail row's own write, so it is mapped.
--   • tl_invoices keeps spare parts outside subtotal (subtotal + spare_parts_amount - discount_amount
--     = total_amount); they are folded into the hub subtotal so the hub row stays self-consistent.
--   • issued_date / due_date are NOT NULL on the hub; tl_invoices has neither and contract_invoices
--     has no issued_date, hence the derivations above.
--   • customer_name / customer_phone for so_invoices are a snapshot taken at the last write to that
--     invoice (later edits to the customer's phone numbers are not pushed).
--
-- ON CONFLICT (the hub row already exists):
--   • The mirrored columns above are overwritten from the detail row — the detail is canonical.
--   • dispatch_status / dispatch_error / sent_at and the Dibsy link are HUB-owned once the row
--     exists: the dispatch worker stores the link on the hub only, so an unrelated detail UPDATE (a
--     payment, a PDF url, ...) must never wipe them or flip a sent invoice back to pending.
--   • The detail's Dibsy link is copied in on INSERT, and on UPDATE only when that write changed it
--     (a legacy path attached a link after the row was created). The hub then reuses that link
--     instead of minting a second one. Copying it on every UPDATE would resurrect a stale link
--     after the hub had cleared it for an amount change (below).
--   • STALE LINK: when total_amount moves while money is still owed (payment_status neither 'paid'
--     nor 'void' — i.e. unpaid, partially_paid or overdue), any link / message for the old amount is
--     wrong. The hub link is cleared and dispatch_status goes back to 'pending' (error cleared) so
--     the dispatch worker issues a fresh one. "Moved" is measured against the total the hub row
--     last saw. A paid or void invoice owes nothing, so its total changing re-dispatches nothing.
--
-- NEW HUB ROWS: a detail INSERT creates the hub row 'pending' (dispatch worker picks it up). A
-- detail UPDATE that finds no hub row (an invoice that pre-dates this migration and has not been
-- backfilled yet) creates it as 'sent' — historical invoices must never be auto-dispatched.
--
-- NOT SYNCED: a detail DELETE (including contracts' ON DELETE CASCADE) leaves its hub row behind.
-- Triggers are INSERT / UPDATE only, per the design.
--
-- Re-runnable: CREATE OR REPLACE the function, DROP TRIGGER / POLICY IF EXISTS before re-creating,
-- REVOKE / GRANT are idempotent. Do NOT re-apply 20261153 after this migration: it re-creates the
-- broad invoices_rw policy and write grants this migration removes (re-apply this one after it).
--
-- Existing callers are unaffected: the Dibsy routes, the public /pay page, the webhook and the
-- dispatch cron use the service role (BYPASSRLS, own grants); the one browser reader (Contact Centre
-- orders lazyFetch) only SELECTs. This migration touches no existing row — backfill is separate.

BEGIN;

-- ── Sync function ──
-- SECURITY DEFINER (owner: the hub's owner, so it writes the hub regardless of the caller's grants /
-- RLS) with a pinned search_path; relations and the enum type are schema-qualified besides.
CREATE OR REPLACE FUNCTION public.sync_invoice_hub()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id     text;
  v_customer_name  text;
  v_customer_phone text;
  v_issued_date    date;
  v_due_date       date;
  v_subtotal       numeric;
  v_discount       numeric;
  v_total          numeric;
  v_paid           numeric;
  v_status         public.invoice_payment_status;
  v_pdf_url        text;
  v_division       text;
  v_dibsy_id       text;
  v_dibsy_url      text;
  v_link_changed   boolean := false;  -- this write set / changed the detail row's Dibsy link
  v_stale          boolean := false;  -- total moved while money is still owed
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'sync_invoice_hub: % row has no id; the hub key (detail_table, detail_id) must be set', TG_TABLE_NAME;
  END IF;

  -- ── Per-table mapping (the decision: see the table in the header) ──
  IF TG_TABLE_NAME = 'so_invoices' THEN
    v_invoice_id  := NEW.invoice_id;
    v_issued_date := NEW.issued_date;
    v_due_date    := NEW.due_date;
    v_subtotal    := COALESCE(NEW.subtotal, 0);
    v_discount    := NEW.discount_amount;
    v_total       := COALESCE(NEW.total_amount, 0);
    v_paid        := COALESCE(NEW.paid_amount, 0);
    v_status      := NEW.payment_status;
    v_pdf_url     := NEW.pdf_url;
    -- No customer text columns here: resolve from the customer (primary phone first, like the app).
    SELECT c.name INTO v_customer_name
      FROM public.customers c
     WHERE c.id = NEW.customer_id;
    SELECT cp.phone INTO v_customer_phone
      FROM public.customer_phones cp
     WHERE cp.customer_id = NEW.customer_id
     ORDER BY cp.is_primary DESC, cp.created_at, cp.id
     LIMIT 1;
    SELECT d.name INTO v_division
      FROM public.company_divisions d
     WHERE d.id = NEW.division_id;
    -- so_invoices has no Dibsy columns: the hub mints the link, nothing to copy.

  ELSIF TG_TABLE_NAME = 'tl_invoices' THEN
    v_invoice_id     := NEW.invoice_number;
    v_customer_name  := NEW.customer_name;
    v_customer_phone := NEW.customer_phone;
    v_issued_date    := COALESCE(NEW.created_at, now())::date;
    v_due_date       := v_issued_date;
    v_subtotal       := NEW.subtotal + NEW.spare_parts_amount;
    v_discount       := NEW.discount_amount;
    v_total          := NEW.total_amount;
    v_paid           := NEW.paid_amount;
    v_status         := (CASE NEW.payment_status WHEN 'partial' THEN 'partially_paid' ELSE NEW.payment_status END)::public.invoice_payment_status;
    v_pdf_url        := NEW.pdf_url;
    v_dibsy_id       := NEW.dibsy_payment_id;
    v_dibsy_url      := NEW.dibsy_checkout_url;
    IF TG_OP = 'INSERT' THEN
      v_link_changed := true;
    ELSE
      v_link_changed := NEW.dibsy_payment_id   IS DISTINCT FROM OLD.dibsy_payment_id
                     OR NEW.dibsy_checkout_url IS DISTINCT FROM OLD.dibsy_checkout_url;
    END IF;

  ELSIF TG_TABLE_NAME = 'contract_invoices' THEN
    v_invoice_id     := NEW.invoice_number;
    v_customer_name  := NEW.customer_name;
    v_customer_phone := NEW.customer_phone;
    v_issued_date    := COALESCE(NEW.created_at, now())::date;
    v_due_date       := COALESCE(NEW.due_date, v_issued_date);
    v_subtotal       := NEW.subtotal;
    v_discount       := NEW.discount_amount;
    v_total          := NEW.total_amount;
    v_paid           := NEW.paid_amount;
    v_status         := (CASE NEW.payment_status WHEN 'partial' THEN 'partially_paid' ELSE NEW.payment_status END)::public.invoice_payment_status;
    v_pdf_url        := NEW.pdf_url;
    v_dibsy_id       := NEW.dibsy_payment_id;
    v_dibsy_url      := NEW.dibsy_checkout_url;
    IF TG_OP = 'INSERT' THEN
      v_link_changed := true;
    ELSE
      v_link_changed := NEW.dibsy_payment_id   IS DISTINCT FROM OLD.dibsy_payment_id
                     OR NEW.dibsy_checkout_url IS DISTINCT FROM OLD.dibsy_checkout_url;
    END IF;

  ELSE
    RAISE EXCEPTION 'sync_invoice_hub: no hub mapping for table %', TG_TABLE_NAME;
  END IF;

  -- ── Stale link? (money still owed AND the total moved since the hub row last saw it) ──
  -- No hub row yet -> SELECT yields NULL -> not stale.
  IF v_status NOT IN ('paid', 'void') THEN
    SELECT i.total_amount IS DISTINCT FROM v_total
      INTO v_stale
      FROM public.invoices i
     WHERE i.detail_table = TG_TABLE_NAME
       AND i.detail_id    = NEW.id;
    v_stale := COALESCE(v_stale, false);
  END IF;

  -- ── Upsert the one hub row for this detail row ──
  INSERT INTO public.invoices AS inv (
    detail_table, detail_id, direction,
    source, source_id, invoice_type,
    invoice_id, customer_name, customer_phone,
    issued_date, due_date,
    subtotal, discount_amount, total_amount, paid_amount, payment_status,
    pdf_url, division,
    dibsy_payment_id, dibsy_checkout_url,
    dispatch_status
  ) VALUES (
    TG_TABLE_NAME, NEW.id, 'ar',
    NULL, NULL, NULL,
    v_invoice_id, v_customer_name, v_customer_phone,
    v_issued_date, v_due_date,
    v_subtotal, v_discount, v_total, v_paid, v_status,
    v_pdf_url, v_division,
    v_dibsy_id, v_dibsy_url,
    CASE WHEN TG_OP = 'INSERT' THEN 'pending' ELSE 'sent' END
  )
  ON CONFLICT (detail_table, detail_id) DO UPDATE SET
    invoice_id         = EXCLUDED.invoice_id,
    customer_name      = EXCLUDED.customer_name,
    customer_phone     = EXCLUDED.customer_phone,
    issued_date        = EXCLUDED.issued_date,
    due_date           = EXCLUDED.due_date,
    subtotal           = EXCLUDED.subtotal,
    discount_amount    = EXCLUDED.discount_amount,
    total_amount       = EXCLUDED.total_amount,
    paid_amount        = EXCLUDED.paid_amount,
    payment_status     = EXCLUDED.payment_status,
    pdf_url            = EXCLUDED.pdf_url,
    division           = EXCLUDED.division,
    updated_at         = now(),
    dibsy_payment_id   = CASE WHEN v_link_changed THEN EXCLUDED.dibsy_payment_id
                              WHEN v_stale        THEN NULL
                              ELSE inv.dibsy_payment_id END,
    dibsy_checkout_url = CASE WHEN v_link_changed THEN EXCLUDED.dibsy_checkout_url
                              WHEN v_stale        THEN NULL
                              ELSE inv.dibsy_checkout_url END,
    dispatch_status    = CASE WHEN v_stale THEN 'pending' ELSE inv.dispatch_status END,
    dispatch_error     = CASE WHEN v_stale THEN NULL      ELSE inv.dispatch_error  END;

  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$function$;

-- Trigger-only function: never callable as an RPC / by clients (same pattern as the other internal
-- DEFINER helpers). Triggers fire regardless of the writing role's EXECUTE privilege.
REVOKE ALL ON FUNCTION public.sync_invoice_hub() FROM public, anon, authenticated;

-- ── Triggers ──
DROP TRIGGER IF EXISTS trg_so_invoices_sync_hub ON public.so_invoices;
CREATE TRIGGER trg_so_invoices_sync_hub
  AFTER INSERT OR UPDATE ON public.so_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_hub();

DROP TRIGGER IF EXISTS trg_tl_invoices_sync_hub ON public.tl_invoices;
CREATE TRIGGER trg_tl_invoices_sync_hub
  AFTER INSERT OR UPDATE ON public.tl_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_hub();

DROP TRIGGER IF EXISTS trg_contract_invoices_sync_hub ON public.contract_invoices;
CREATE TRIGGER trg_contract_invoices_sync_hub
  AFTER INSERT OR UPDATE ON public.contract_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_hub();

-- ── Hub write lockdown ──
-- 20261153 left the hub FOR ALL to every authenticated user, so any logged-in user could flip
-- payment_status / paid_amount or re-trigger a send. The DEFINER trigger above now does the
-- detail -> hub writes and every other writer (Dibsy routes, webhook, pay page, dispatch cron)
-- uses the service role, which bypasses RLS and keeps its own grants. Authenticated keeps read-only
-- access: SELECT policy + SELECT grant, no INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER.
-- anon stays fully revoked (20261153).
DROP POLICY IF EXISTS invoices_rw ON public.invoices;
DROP POLICY IF EXISTS invoices_hub_select ON public.invoices;
CREATE POLICY invoices_hub_select ON public.invoices
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.invoices FROM authenticated;
GRANT SELECT ON public.invoices TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
