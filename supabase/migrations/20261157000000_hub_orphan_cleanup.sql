-- Unified Invoice Hub, ruling C8: delete the hub row when its detail row is deleted.
-- Design: docs/architecture/2026-10-20-unified-invoice-hub-design.md
--
-- WHY
--   20261154's sync triggers are INSERT / UPDATE only, so hard-deleting a detail row (so_invoices /
--   tl_invoices / contract_invoices, including contract_invoices rows that go with a deleted contract through
--   ON DELETE CASCADE) used to leave its hub row behind. An orphan 'pending' hub row would still be picked up
--   by the dispatch cron (a pay link + WhatsApp for an invoice that no longer exists, failing at the PDF step at
--   best) and would keep showing on the All Invoices page. Detail -> hub stays the only direction; this adds the
--   missing DELETE leg of it.
--
-- WHAT
--   public.delete_hub_invoice_on_detail_delete()  AFTER DELETE row-trigger function, SECURITY DEFINER with a
--   pinned search_path (authenticated has no write privilege on the hub since 20261154, so the delete must run
--   as the function owner, exactly like sync_invoice_hub()):
--       DELETE FROM public.invoices WHERE detail_table = TG_TABLE_NAME AND detail_id = OLD.id;
--   plus three triggers, trg_<table>_delete_hub, on tl_invoices, contract_invoices and so_invoices. The hub row
--   is keyed by (detail_table, detail_id) = (table, id) through the unique index idx_invoices_hub_detail, so the
--   delete is an index lookup and can only ever match the one row mirrored from the deleted detail row; legacy
--   hub rows (detail_table IS NULL) can never match. Nothing references hub rows by foreign key, so the delete
--   cannot fail on a constraint.
--
-- NOT COVERED: TRUNCATE does not fire row triggers (TRUNCATE on tl_invoices is revoked from clients by
--   20261156; the API cannot issue it). Hub rows that were ALREADY orphaned before this migration are not
--   touched (none on the dev DB at the time of writing).
--
-- Re-runnable: CREATE OR REPLACE the function, DROP TRIGGER IF EXISTS before re-creating, REVOKE is idempotent.
-- Apply after 20261154 (the hub write lockdown that makes the DEFINER necessary).

BEGIN;

-- ── 0. Guard ──
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1
                   FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name   = 'invoices'
                    AND column_name  = 'detail_table')
     OR to_regclass('public.tl_invoices')       IS NULL
     OR to_regclass('public.contract_invoices') IS NULL
     OR to_regclass('public.so_invoices')       IS NULL THEN
    RAISE EXCEPTION 'hub_orphan_cleanup: the invoice hub (public.invoices.detail_table, migrations 20261153-155) and the three detail tables were not found - wrong database? Aborting.';
  END IF;
END
$guard$;

-- ── 1. Trigger function ──
CREATE OR REPLACE FUNCTION public.delete_hub_invoice_on_detail_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.invoices
   WHERE detail_table = TG_TABLE_NAME
     AND detail_id    = OLD.id;
  RETURN OLD;
END;
$function$;

-- Trigger-only function: never callable as an RPC / by clients (same pattern as sync_invoice_hub()).
REVOKE ALL ON FUNCTION public.delete_hub_invoice_on_detail_delete() FROM public, anon, authenticated;

-- ── 2. Triggers ──
DROP TRIGGER IF EXISTS trg_tl_invoices_delete_hub ON public.tl_invoices;
CREATE TRIGGER trg_tl_invoices_delete_hub
  AFTER DELETE ON public.tl_invoices
  FOR EACH ROW EXECUTE FUNCTION public.delete_hub_invoice_on_detail_delete();

DROP TRIGGER IF EXISTS trg_contract_invoices_delete_hub ON public.contract_invoices;
CREATE TRIGGER trg_contract_invoices_delete_hub
  AFTER DELETE ON public.contract_invoices
  FOR EACH ROW EXECUTE FUNCTION public.delete_hub_invoice_on_detail_delete();

DROP TRIGGER IF EXISTS trg_so_invoices_delete_hub ON public.so_invoices;
CREATE TRIGGER trg_so_invoices_delete_hub
  AFTER DELETE ON public.so_invoices
  FOR EACH ROW EXECUTE FUNCTION public.delete_hub_invoice_on_detail_delete();

-- ── 3. Self-check: the migration commits only if the three triggers and the DEFINER function are in place ──
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.delete_hub_invoice_on_detail_delete()')::oid
                    AND p.prosecdef
                    AND p.proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'hub_orphan_cleanup: delete_hub_invoice_on_detail_delete() is not SECURITY DEFINER with search_path=public';
  END IF;
  IF has_function_privilege('anon', 'public.delete_hub_invoice_on_detail_delete()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.delete_hub_invoice_on_detail_delete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hub_orphan_cleanup: delete_hub_invoice_on_detail_delete() is client-executable';
  END IF;
  -- tgtype 9 = ROW (1) + DELETE (8), AFTER (the BEFORE bit, 2, is clear); tgenabled 'O' = fires in origin mode
  IF (SELECT count(*) FROM pg_trigger t
       WHERE t.tgfoid = to_regprocedure('public.delete_hub_invoice_on_detail_delete()')::oid
         AND NOT t.tgisinternal
         AND t.tgtype = 9
         AND t.tgenabled = 'O'
         AND t.tgrelid IN ('public.tl_invoices'::regclass, 'public.contract_invoices'::regclass, 'public.so_invoices'::regclass)) <> 3 THEN
    RAISE EXCEPTION 'hub_orphan_cleanup: expected exactly 3 enabled AFTER DELETE row triggers (tl_invoices, contract_invoices, so_invoices)';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
