-- Unified Invoice Hub, Task 9: tl_invoices write lockdown. This is the gate that must be applied BEFORE
-- the invoice dispatch cron (src/app/api/cron/dispatch-invoices) is enabled.
-- Design: docs/architecture/2026-10-20-unified-invoice-hub-design.md
--
-- WHY
--   20261154's trigger mirrors every tl_invoices row into the hub, and the cron dispatches hub rows that
--   are 'pending' (a Dibsy pay link + a WhatsApp to the row's customer_phone). tl_invoices had RLS OFF and
--   ALL privileges for BOTH anon and authenticated, so anyone holding the public anon key (not only a
--   logged-in user) could INSERT / UPDATE a TL invoice and, once the cron is on, make it send a pay link to
--   any phone, flip an invoice to paid, or rewrite what it says. so_invoices is permission-gated (RLS +
--   sales.invoices.manage) and contract_invoices is SELECT-only; tl_invoices was the one open door.
--
-- END STATE
--   tl_invoices   RLS on, one policy: SELECT for authenticated (USING true), so every UI read keeps working
--                 (useTlInvoices, pending payments, visit payment status, review dialog, payment pre-check).
--                 authenticated holds exactly SELECT; anon holds nothing (it was never a legitimate reader: the
--                 public /pay page uses the service role); INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES /
--                 TRIGGER (and MAINTAIN) are revoked from both. service_role (BYPASSRLS, own grants) and the
--                 table owner, and therefore every SECURITY DEFINER function, are unaffected. Mirrors the hub
--                 lockdown in 20261154.
--
-- EVERY WRITER OF tl_invoices (verified on the dev DB and in the repo, 2026-10-20)
--   server routes, all on the service role, unaffected:
--     api/payments/dibsy/webhook            UPDATE (settle)                    admin client
--     api/payments/dibsy/create-tl-invoice  UPDATE (Dibsy link)                admin client
--     api/notifications/send-invoice        UPDATE (Dibsy link)                service-key client
--     lib/orders/generate-tl-invoice-pdf    UPDATE (pdf_url); every caller passes a service client:
--                                           send-invoice, api/orders/invoices/[id]/pdf, lib/invoices/pdf-registry
--   database functions (pg_proc scan for every body that writes tl_invoices):
--     create_tl_invoice(...)                INSERT   SECURITY DEFINER already; the UI creates invoices through
--                                                    this RPC (useCreateTlInvoice)
--     sync_tl_invoice_paid_amount()         UPDATE   trigger fn on tl_invoice_payments. It was SECURITY INVOKER and
--                                                    the UI registers a payment with a plain browser INSERT into
--                                                    tl_invoice_payments (useRegisterTlInvoicePayment), so its UPDATE
--                                                    of tl_invoices ran as the logged-in user and would be DENIED by
--                                                    this lockdown. Converted to SECURITY DEFINER below.
--   There is no browser-client write to tl_invoices, and no view / rule / policy / pg_cron job / edge function
--   that writes it.
--
-- WHAT THIS MIGRATION DOES
--   1. ENABLE RLS on tl_invoices + the SELECT-only policy + the REVOKEs above.
--   2. sync_tl_invoice_paid_amount(): SECURITY DEFINER with a pinned search_path. The body is the LIVE body,
--      byte for byte (live functions get hot-patched, so the migration refuses to run if the live body is not
--      the one it was written against, rather than overwrite a hot-patch). EXECUTE is revoked from clients
--      (trigger-only function, same pattern as sync_invoice_hub()); triggers fire regardless of EXECUTE.
--   3. create_tl_invoice(): EXECUTE revoked from PUBLIC and anon (it is SECURITY DEFINER with no caller check and
--      was callable by anyone holding the anon key; every legitimate caller is a logged-in user, i.e.
--      authenticated, or the service role, both of which keep their explicit grants).
--   4. The rest of the TL money path (tl_invoice_payments, tl_invoice_lines, tl_payment_batches,
--      tl_payment_batch_items): anon is cut off. Section 2's DEFINER trigger lets a payment row move
--      tl_invoices.paid_amount / payment_status, so anon must not be able to insert one. Logged-in access is untouched.
--   5. app_settings: the cron's kill switch row ('invoice_dispatch_config') becomes admin-only (see section 5).
--   6. A self-check that raises, and so rolls the whole migration back, unless the end state above holds.
--
-- NOT CLOSED HERE (reported to the owner as follow-ups)
--   * create_tl_invoice() still has no caller authorization: any logged-in user can mint an invoice for any
--     visit id / phone. A TL-assignment / permission check belongs in the RPC (or a BEFORE INSERT trigger).
--   * tl_invoice_payments, tl_invoice_lines, tl_payment_batches and tl_payment_batch_items stay RLS-off with full
--     access for LOGGED-IN users (like most public tables on this DB). The browser registers a payment by inserting
--     into tl_invoice_payments directly, and the DEFINER trigger turns that row into tl_invoices.paid_amount /
--     payment_status, so a logged-in user can still move payment state through it. Closing that needs the payment
--     UI moved onto an RPC with a caller check.
--
-- Re-runnable: ENABLE RLS / REVOKE / GRANT are idempotent, policies are DROP IF EXISTS + CREATE, the function is
-- CREATE OR REPLACE behind the drift guard (its prosrc md5 does not change when re-applied).
--
-- Target: the whole-app dev DB only (wkmvjxxmzstsvahuiwsz). The guard below aborts anywhere the invoice hub
-- (public.invoices.detail_table, 20261153-155) does not exist; never apply this with a bare `supabase db push`.

BEGIN;

-- ── 0. Guard ──
DO $guard$
BEGIN
  IF to_regclass('public.tl_invoices') IS NULL
     OR NOT EXISTS (SELECT 1
                      FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name   = 'invoices'
                       AND column_name  = 'detail_table') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: public.tl_invoices and the invoice hub (public.invoices.detail_table, migrations 20261153-155) were not found - wrong database? Aborting.';
  END IF;
END
$guard$;

-- ── 1. tl_invoices: RLS on, read-only for authenticated, nothing for anon ──
ALTER TABLE public.tl_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_invoices_select ON public.tl_invoices;
CREATE POLICY tl_invoices_select ON public.tl_invoices
  FOR SELECT TO authenticated USING (true);

-- REVOKE ALL rather than only the write list: on Postgres 17 the default ACL also carries MAINTAIN (VACUUM /
-- ANALYZE / LOCK TABLE ...), which the list INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER leaves behind.
-- Then authenticated is given back exactly SELECT.
REVOKE ALL ON public.tl_invoices FROM authenticated, anon;
GRANT SELECT ON public.tl_invoices TO authenticated;

-- ── 2. sync_tl_invoice_paid_amount(): SECURITY DEFINER ──
-- Drift guard: only replace the body this migration was written against (md5 of the live prosrc, taken from
-- pg_get_functiondef on the dev DB). prosrc is unchanged by this CREATE OR REPLACE, so a re-run passes too.
DO $drift$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.sync_tl_invoice_paid_amount()')::oid;
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: public.sync_tl_invoice_paid_amount() not found';
  END IF;
  IF md5(v_src) <> 'ad2c8f9c41aedd55c9fd3c767a4187f8' THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: the live body of public.sync_tl_invoice_paid_amount() (md5 %) differs from the one this migration was written against (ad2c8f9c41aedd55c9fd3c767a4187f8). Dump pg_get_functiondef, review the difference and update this migration; do not overwrite a hot-patch.', md5(v_src);
  END IF;
END
$drift$;

CREATE OR REPLACE FUNCTION public.sync_tl_invoice_paid_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.tl_invoice_id, OLD.tl_invoice_id);
  v_paid       numeric;
  v_total      numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.tl_invoice_payments WHERE tl_invoice_id = v_invoice_id;
  SELECT total_amount INTO v_total
    FROM public.tl_invoices WHERE id = v_invoice_id;
  UPDATE public.tl_invoices
     SET paid_amount    = v_paid,
         payment_status = CASE
                            WHEN v_paid <= 0       THEN 'unpaid'
                            WHEN v_paid >= v_total THEN 'paid'
                            ELSE 'partial'
                          END,
         updated_at     = now()
   WHERE id = v_invoice_id;
  RETURN NULL;
END $function$;

-- Trigger-only function: not callable as an RPC / by clients. Triggers fire regardless of the writing role's
-- EXECUTE privilege, so the UI's payment registration keeps working (proved by the impersonation test).
REVOKE ALL ON FUNCTION public.sync_tl_invoice_paid_amount() FROM public, anon, authenticated;

-- ── 3. create_tl_invoice(): not callable by anon ──
-- SECURITY DEFINER, no auth check inside, and EXECUTE was granted to PUBLIC + anon: with direct table writes
-- closed this RPC was the remaining way for an unauthenticated caller to mint a TL invoice. The TL app calls it
-- as a logged-in user (authenticated) and keeps its explicit grant, as does service_role. CREATE OR REPLACE keeps
-- this ACL, but a later DROP FUNCTION + CREATE FUNCTION (e.g. a signature change) resets it to the schema default
-- (EXECUTE for PUBLIC and anon): repeat this REVOKE with the new signature then.
REVOKE EXECUTE ON FUNCTION public.create_tl_invoice(uuid, text, text, text, jsonb, numeric, numeric, numeric, numeric, text, uuid)
  FROM PUBLIC, anon;

-- ── 4. The rest of the TL money path: no anonymous access ──
-- Section 2 makes the paid-amount trigger SECURITY DEFINER, so a row inserted into tl_invoice_payments now moves
-- tl_invoices.paid_amount / payment_status on behalf of whoever inserted it. anon has no legitimate use of this
-- table or its siblings: the public /pay page, the Dibsy routes, the webhook and the cron all use the service
-- role, and the TL / office UI is a logged-in session. So anon is cut off from all four; the logged-in UI keeps
-- its access untouched (the browser registers payments by inserting into tl_invoice_payments directly).
REVOKE ALL ON public.tl_invoice_payments    FROM anon;
REVOKE ALL ON public.tl_invoice_lines       FROM anon;
REVOKE ALL ON public.tl_payment_batches     FROM anon;
REVOKE ALL ON public.tl_payment_batch_items FROM anon;

-- ── 5. app_settings: the dispatch gate row is admin-only ──
-- The baseline policies "Admin can insert / update app_settings" are named admin but their predicates are plain
-- `true`, so any logged-in user can write ANY key, including the row the cron reads to decide whether to send
-- ('invoice_dispatch_config'). Tightening every key to the admin check could lock non-admin config screens out
-- (QC rules, reminders, risk tiers, quotation validity and auto-generate-codes each upsert their own key from
-- the browser under their own screen permission), so only the gate key is guarded here. Two RESTRICTIVE policies
-- are AND-ed with the existing permissive ones: a non-admin can neither create the row, change it, rename it,
-- nor rename another row into it. public.has_admin_permission() is the project's admin check (a custom role with
-- is_system_admin, or master_data.users.manage). The service role bypasses RLS (the cron only reads the row).
DROP POLICY IF EXISTS app_settings_dispatch_gate_admin_insert ON public.app_settings;
CREATE POLICY app_settings_dispatch_gate_admin_insert ON public.app_settings
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (key <> 'invoice_dispatch_config' OR public.has_admin_permission());

DROP POLICY IF EXISTS app_settings_dispatch_gate_admin_update ON public.app_settings;
CREATE POLICY app_settings_dispatch_gate_admin_update ON public.app_settings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING      (key <> 'invoice_dispatch_config' OR public.has_admin_permission())
  WITH CHECK (key <> 'invoice_dispatch_config' OR public.has_admin_permission());

-- ── 6. Self-check: the migration commits only if the lockdown actually holds ──
DO $verify$
DECLARE
  v_role text;
  v_priv text;
  v_tbl  text;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.tl_invoices'::regclass) THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: RLS is not enabled on public.tl_invoices';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'tl_invoices'
                    AND policyname = 'tl_invoices_select' AND cmd = 'SELECT'
                    AND roles = '{authenticated}' AND qual = 'true') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: the SELECT policy for authenticated is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'tl_invoices' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: a non-SELECT policy exists on public.tl_invoices';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_role, 'public.tl_invoices', v_priv) THEN
        RAISE EXCEPTION 'tl_invoices_lockdown: % still holds % on public.tl_invoices', v_role, v_priv;
      END IF;
    END LOOP;
    IF has_any_column_privilege(v_role, 'public.tl_invoices', 'INSERT')
       OR has_any_column_privilege(v_role, 'public.tl_invoices', 'UPDATE')
       OR has_any_column_privilege(v_role, 'public.tl_invoices', 'REFERENCES') THEN
      RAISE EXCEPTION 'tl_invoices_lockdown: % still holds a column-level write privilege on public.tl_invoices', v_role;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.tl_invoices', 'SELECT') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: authenticated lost SELECT on public.tl_invoices (UI reads would break)';
  END IF;
  IF has_table_privilege('anon', 'public.tl_invoices', 'SELECT') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: anon still holds SELECT on public.tl_invoices';
  END IF;
  -- exact end state of the ACL (also catches privileges the loops above do not name, e.g. MAINTAIN on Postgres 17+)
  IF (SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
        FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = 'public.tl_invoices'::regclass
         AND a.grantee = (SELECT r.oid FROM pg_roles r WHERE r.rolname = 'authenticated')) IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: authenticated must hold exactly SELECT on public.tl_invoices';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
              WHERE c.oid = 'public.tl_invoices'::regclass
                AND (a.grantee = 0 OR a.grantee = (SELECT r.oid FROM pg_roles r WHERE r.rolname = 'anon'))) THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: anon / PUBLIC still hold a privilege on public.tl_invoices';
  END IF;

  -- the server-side writers must be untouched
  IF NOT (SELECT r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'service_role') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: service_role does not bypass RLS';
  END IF;
  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.tl_invoices', v_priv) THEN
      RAISE EXCEPTION 'tl_invoices_lockdown: service_role lost % on public.tl_invoices', v_priv;
    END IF;
  END LOOP;

  -- the paid-amount trigger function: DEFINER, pinned search_path, live body untouched, not client-callable
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.sync_tl_invoice_paid_amount()')::oid
                    AND p.prosecdef
                    AND p.proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: sync_tl_invoice_paid_amount() is not SECURITY DEFINER with search_path=public';
  END IF;
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.sync_tl_invoice_paid_amount()')::oid)
       <> 'ad2c8f9c41aedd55c9fd3c767a4187f8' THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: the body of sync_tl_invoice_paid_amount() changed';
  END IF;
  IF has_function_privilege('anon', 'public.sync_tl_invoice_paid_amount()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_tl_invoice_paid_amount()', 'EXECUTE') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: sync_tl_invoice_paid_amount() is still client-executable';
  END IF;

  -- the create RPC: closed to anon, still open to the logged-in TL app
  IF has_function_privilege('anon', 'public.create_tl_invoice(uuid, text, text, text, jsonb, numeric, numeric, numeric, numeric, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: anon can still execute create_tl_invoice()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_tl_invoice(uuid, text, text, text, jsonb, numeric, numeric, numeric, numeric, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: authenticated lost EXECUTE on create_tl_invoice() (TL invoice creation would break)';
  END IF;

  -- the rest of the TL money path: anon out, the logged-in UI still in (payments are registered by a browser INSERT)
  FOREACH v_tbl IN ARRAY ARRAY['tl_invoice_payments', 'tl_invoice_lines', 'tl_payment_batches', 'tl_payment_batch_items'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('anon', 'public.' || v_tbl, v_priv) THEN
        RAISE EXCEPTION 'tl_invoices_lockdown: anon still holds % on public.%', v_priv, v_tbl;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
                WHERE c.oid = ('public.' || v_tbl)::regclass
                  AND (a.grantee = 0 OR a.grantee = (SELECT r.oid FROM pg_roles r WHERE r.rolname = 'anon'))) THEN
      RAISE EXCEPTION 'tl_invoices_lockdown: anon / PUBLIC still hold a privilege on public.%', v_tbl;
    END IF;
  END LOOP;
  IF NOT (has_table_privilege('authenticated', 'public.tl_invoice_payments', 'SELECT')
          AND has_table_privilege('authenticated', 'public.tl_invoice_payments', 'INSERT')) THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: authenticated lost SELECT/INSERT on public.tl_invoice_payments (payment registration would break)';
  END IF;

  -- the dispatch gate row guard
  IF (SELECT count(*) FROM pg_policy pol
       WHERE pol.polrelid = 'public.app_settings'::regclass
         AND NOT pol.polpermissive
         AND pol.polname IN ('app_settings_dispatch_gate_admin_insert', 'app_settings_dispatch_gate_admin_update')) <> 2 THEN
    RAISE EXCEPTION 'tl_invoices_lockdown: the app_settings dispatch-gate policies are missing';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
