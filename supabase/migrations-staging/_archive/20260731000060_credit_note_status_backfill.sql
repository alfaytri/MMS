-- Phase 8 Sub-task 8.1b: Backfill credit_notes.status + debit_notes.status
-- to the new vocabulary introduced in 20260731000050.
--
-- Rename-in-place already handled the 1:1 mappings (issued→open, redeemed→
-- resolved) at the catalog level — no row updates needed for those.
-- This migration handles:
--  1. Legacy `draft` / `approved` rows → `open` (both tables).
--  2. Return-linked credit_notes: recompute lifecycle from the customer ledger.
--       customer_resolved > 0 AND customer_remaining > 0 → in_progress
--       customer_remaining = 0 AND customer_resolved > 0 → resolved
--     (Rows that pass the redeemed→resolved rename stay resolved.)
--  3. Debit notes with a resolution_type set → resolved. DN has no ledger
--     equivalent yet (Phase 9), so this manual-transition backfill matches
--     the manual-transition write path that lands in the same phase.

-- Step 1: reassign legacy vocabulary rows to `open`.
update public.credit_notes
  set status = 'open'::public.credit_note_status
  where status not in (
    'open'::public.credit_note_status,
    'in_progress'::public.credit_note_status,
    'resolved'::public.credit_note_status,
    'void'::public.credit_note_status
  );

update public.debit_notes
  set status = 'open'::public.credit_note_status
  where status not in (
    'open'::public.credit_note_status,
    'in_progress'::public.credit_note_status,
    'resolved'::public.credit_note_status,
    'void'::public.credit_note_status
  );

-- Step 2: return-linked CNs — derive `in_progress` and `resolved` from the
-- customer ledger. Guard with `status = 'open'` so we do not overwrite the
-- resolved rows produced by the redeemed→resolved rename or existing voids.
update public.credit_notes cn
  set status = 'resolved'::public.credit_note_status
  from public.return_progress rp
  where cn.source_return_id = rp.return_id
    and cn.status = 'open'::public.credit_note_status
    and rp.customer_remaining = 0
    and rp.customer_resolved > 0;

update public.credit_notes cn
  set status = 'in_progress'::public.credit_note_status
  from public.return_progress rp
  where cn.source_return_id = rp.return_id
    and cn.status = 'open'::public.credit_note_status
    and rp.customer_resolved > 0
    and rp.customer_remaining > 0;

-- Step 3: DNs with a manual resolution flag get bumped to resolved.
update public.debit_notes
  set status = 'resolved'::public.credit_note_status
  where resolution_type is not null
    and status = 'open'::public.credit_note_status;
