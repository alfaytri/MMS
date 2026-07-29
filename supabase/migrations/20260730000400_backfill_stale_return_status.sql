-- Phase 7 — Sub-task 7.7: backfill stale return status on historical returns.
--
-- Context. Phase 6 stamped so_po_returns.status = 'resolved_replacement' /
-- 'resolved_credit' / 'resolved_partial' as soon as the first replacement /
-- refund / store-credit action landed, without waiting for BOTH dimensions of
-- the dual ledger to clear. Phase 7.2's rewritten _maybe_close_return only
-- pushes status forward — it never demotes — so historical returns can now sit
-- in a state where the status pill reads "Resolved" while customer_remaining
-- and/or inventory_remaining are still non-zero and the UI is (correctly)
-- offering "Resolve Remaining" + the "Compensation not recorded" chip.
--
-- Example on staging: SR-00003 pill says `Resolved · Replacement` but
-- customer_remaining = 2 (compensation-missing) and the "Resolve Remaining (2)"
-- button is shown.
--
-- Fix. One-shot UPDATE demoting any return that is stamped resolved_* while
-- either dimension still has open qty. `restocked` is the correct pre-
-- resolution state — good units are back in stock, damaged units may still
-- need dispositioning, customer may still need compensation. credit_notes.
-- resolution_type is cleared in lockstep so the CN detail banner reflects the
-- open state.

update public.so_po_returns r
  set status = 'restocked'::public.return_status,
      updated_at = now()
  from public.return_progress p
  where p.return_id = r.id
    and r.status in (
      'resolved_replacement',
      'resolved_credit',
      'resolved_partial'
    )
    and (
      coalesce(p.customer_remaining, 0) > 0
      or coalesce(p.inventory_remaining, 0) > 0
    );

update public.credit_notes cn
  set resolution_type = null,
      updated_at = now()
  from public.so_po_returns r
  join public.return_progress p on p.return_id = r.id
  where cn.id = r.credit_note_id
    and r.status = 'restocked'
    and cn.resolution_type is not null
    and (
      coalesce(p.customer_remaining, 0) > 0
      or coalesce(p.inventory_remaining, 0) > 0
    );
