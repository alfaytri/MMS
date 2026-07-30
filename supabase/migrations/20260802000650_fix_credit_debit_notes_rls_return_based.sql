-- Hotfix: return-based credit_notes and debit_notes are invisible under the
-- Division Switcher RLS backfill (20260731000000_rls_division_scope_backfill.sql).
--
-- Symptom: /sales/credit-notes list shows 0 rows even for owner/accountant users
-- with "All Divisions" active. Confirmed on staging (mwvblpgbgxipvrevkeff):
--   select count(*), count(*) filter (where invoice_id is null and source_return_id is not null)
--     from public.credit_notes; → (21, 21) — 100% of rows return-based, all hidden.
--
-- Cause: the RESTRICTIVE policies check ONLY the invoice/bill parent:
--   USING (EXISTS (SELECT 1 FROM so_invoices i
--                    WHERE i.id = credit_notes.invoice_id
--                      AND is_division_visible(i.division_id)))
-- When invoice_id is NULL (return-based CN — the customer paid cash / never
-- invoiced / or the CN was booked directly against a return), the EXISTS
-- returns no rows → RESTRICTIVE policy denies → row invisible for everyone,
-- even is_division_visible-permissive users.
--
-- Same shape on debit_notes: bill_id can be NULL for return-based DNs; those
-- rows are equally invisible. (Not yet reported since Phase 8 focused on CNs,
-- but the RLS gap is symmetric — patching both here.)
--
-- Fix: rewrite each of the 8 policies (4 per table × 2 tables) to try the
-- invoice/bill parent FIRST, fall back to the return parent if invoice_id /
-- bill_id is NULL. Notes with neither parent (should not exist in practice
-- but defensively handled) are visible only to owner/accountant per JWT
-- user_type — same guard the write paths use elsewhere.
--
-- Reproducible test:
--   set role authenticated;
--   set request.jwt.claims to '{"role":"authenticated","user_type":"owner","division_ids":["<uuid>"]}';
--   select count(*) from public.credit_notes;  -- before fix: 0, after: 21
--   reset role; reset request.jwt.claims;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- credit_notes: invoice_id primary, source_return_id fallback
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS division_scope_select_r ON public.credit_notes;
DROP POLICY IF EXISTS division_scope_insert_r ON public.credit_notes;
DROP POLICY IF EXISTS division_scope_update_r ON public.credit_notes;
DROP POLICY IF EXISTS division_scope_delete_r ON public.credit_notes;

CREATE POLICY division_scope_select_r ON public.credit_notes AS RESTRICTIVE FOR SELECT USING (
  (credit_notes.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_invoices i
     WHERE i.id = credit_notes.invoice_id
       AND public.is_division_visible(i.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = credit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

CREATE POLICY division_scope_insert_r ON public.credit_notes AS RESTRICTIVE FOR INSERT WITH CHECK (
  (credit_notes.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_invoices i
     WHERE i.id = credit_notes.invoice_id
       AND public.is_division_visible(i.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = credit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

CREATE POLICY division_scope_update_r ON public.credit_notes AS RESTRICTIVE FOR UPDATE
  USING (
    (credit_notes.invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_invoices i
       WHERE i.id = credit_notes.invoice_id
         AND public.is_division_visible(i.division_id)
    ))
    OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_po_returns r
       WHERE r.id = credit_notes.source_return_id
         AND public.is_division_visible(r.division_id)
    ))
    OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NULL
        AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
  )
  WITH CHECK (
    (credit_notes.invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_invoices i
       WHERE i.id = credit_notes.invoice_id
         AND public.is_division_visible(i.division_id)
    ))
    OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_po_returns r
       WHERE r.id = credit_notes.source_return_id
         AND public.is_division_visible(r.division_id)
    ))
    OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NULL
        AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
  );

CREATE POLICY division_scope_delete_r ON public.credit_notes AS RESTRICTIVE FOR DELETE USING (
  (credit_notes.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_invoices i
     WHERE i.id = credit_notes.invoice_id
       AND public.is_division_visible(i.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = credit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (credit_notes.invoice_id IS NULL AND credit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

-- ═══════════════════════════════════════════════════════════════════════
-- debit_notes: bill_id primary, source_return_id fallback (mirror shape)
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS division_scope_select_r ON public.debit_notes;
DROP POLICY IF EXISTS division_scope_insert_r ON public.debit_notes;
DROP POLICY IF EXISTS division_scope_update_r ON public.debit_notes;
DROP POLICY IF EXISTS division_scope_delete_r ON public.debit_notes;

CREATE POLICY division_scope_select_r ON public.debit_notes AS RESTRICTIVE FOR SELECT USING (
  (debit_notes.bill_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bills b
     WHERE b.id = debit_notes.bill_id
       AND public.is_division_visible(b.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = debit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

CREATE POLICY division_scope_insert_r ON public.debit_notes AS RESTRICTIVE FOR INSERT WITH CHECK (
  (debit_notes.bill_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bills b
     WHERE b.id = debit_notes.bill_id
       AND public.is_division_visible(b.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = debit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

CREATE POLICY division_scope_update_r ON public.debit_notes AS RESTRICTIVE FOR UPDATE
  USING (
    (debit_notes.bill_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bills b
       WHERE b.id = debit_notes.bill_id
         AND public.is_division_visible(b.division_id)
    ))
    OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_po_returns r
       WHERE r.id = debit_notes.source_return_id
         AND public.is_division_visible(r.division_id)
    ))
    OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NULL
        AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
  )
  WITH CHECK (
    (debit_notes.bill_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bills b
       WHERE b.id = debit_notes.bill_id
         AND public.is_division_visible(b.division_id)
    ))
    OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.so_po_returns r
       WHERE r.id = debit_notes.source_return_id
         AND public.is_division_visible(r.division_id)
    ))
    OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NULL
        AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
  );

CREATE POLICY division_scope_delete_r ON public.debit_notes AS RESTRICTIVE FOR DELETE USING (
  (debit_notes.bill_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bills b
     WHERE b.id = debit_notes.bill_id
       AND public.is_division_visible(b.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.so_po_returns r
     WHERE r.id = debit_notes.source_return_id
       AND public.is_division_visible(r.division_id)
  ))
  OR (debit_notes.bill_id IS NULL AND debit_notes.source_return_id IS NULL
      AND (auth.jwt() ->> 'user_type') IN ('owner', 'accountant'))
);

COMMIT;
