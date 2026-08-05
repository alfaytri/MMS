-- Phase 8 Sub-task 8.1b (folds 8.6): rewrite _record_customer_resolution and
-- _maybe_close_return with CN status auto-transitions AND the store_credit
-- resolution_type stamp fix.
--
-- Recorder change:
--   After inserting a customer resolution row, flip credit_notes.status:
--   open → in_progress for the linked CN(s). Idempotent — only fires when
--   the CN is still `open`. The terminal `resolved` transition is handled by
--   _maybe_close_return once the customer ledger reaches 0 remaining.
--
-- Closer change (Phase 8.6 fold):
--   The existing CASE mapped resolved_credit → 'refund' always, so pure-
--   store-credit returns (e.g. SR-00007) got stamped as `refund` even though
--   the customer ledger held no refund rows. Rewrite computes the customer
--   ledger mix (bool_and per type + distinct-count) and stamps:
--     pure replacement → 'replacement'
--     pure store_credit → 'store_credit'
--     pure refund       → 'refund'
--     mixed / empty     → NULL  (banner readers fall back to the ledger)
--   Additionally sets credit_notes.status = 'resolved' when the close fires,
--   completing the in_progress → resolved transition. Rows already at `void`
--   stay `void`.
--
-- After both function rewrites, the migration re-runs _maybe_close_return
-- for every return with a linked CN. This corrects any historical stamp
-- errors and ensures existing resolved rows carry the right status/type.

-- ─── _record_customer_resolution ───────────────────────────────────────────
create or replace function public._record_customer_resolution(
  p_return_line_id   uuid,
  p_resolution_type  text,
  p_qty              numeric,
  p_sale_delivery_id uuid default null,
  p_credit_note_id   uuid default null,
  p_notes            text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_new_id    uuid;
  v_return_id uuid;
begin
  if p_resolution_type not in ('refund','replacement','store_credit') then
    raise exception '_record_customer_resolution: invalid resolution_type %', p_resolution_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_customer_resolution: qty must be > 0 (got %)', p_qty;
  end if;

  select customer_remaining_qty into v_remaining
    from public.return_line_progress
    where return_line_id = p_return_line_id;
  if v_remaining is null then
    raise exception '_record_customer_resolution: return_line % not found', p_return_line_id;
  end if;
  if p_qty > v_remaining then
    raise exception '_record_customer_resolution: qty % exceeds customer remaining %', p_qty, v_remaining;
  end if;

  insert into public.return_line_customer_resolutions (
    return_line_id, resolution_type, qty,
    sale_delivery_id, credit_note_id, notes, created_by
  ) values (
    p_return_line_id, p_resolution_type, p_qty,
    p_sale_delivery_id, p_credit_note_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  -- Phase 8.1b: bump linked CN(s) from open → in_progress on first resolution.
  -- Terminal resolved flip is handled by _maybe_close_return.
  select rl.return_id into v_return_id
    from public.return_lines rl
    where rl.id = p_return_line_id;
  update public.credit_notes cn
    set status = 'in_progress'::public.credit_note_status
    where cn.source_return_id = v_return_id
      and cn.status = 'open'::public.credit_note_status;

  return v_new_id;
end;
$$;

comment on function public._record_customer_resolution is
  'Internal. Inserts one row in return_line_customer_resolutions after validating qty <= customer_remaining_qty, then flips any linked CN from open → in_progress. Called by the action wrappers only.';

-- ─── _maybe_close_return ───────────────────────────────────────────────────
create or replace function public._maybe_close_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_remaining   numeric;
  v_inventory_remaining  numeric;
  v_new_status           public.return_status;
  v_cn_id                uuid;
  v_all_replacement      boolean;
  v_all_store_credit     boolean;
  v_all_refund           boolean;
  v_new_resolution_type  public.credit_note_resolution_type;
begin
  select customer_remaining, inventory_remaining
    into v_customer_remaining, v_inventory_remaining
    from public.return_progress
    where return_id = p_return_id;

  if v_customer_remaining is null or v_customer_remaining > 0 then
    return;
  end if;
  if coalesce(v_inventory_remaining, 0) > 0 then
    return;
  end if;

  v_new_status := public._return_resolution_status(p_return_id);
  if v_new_status is null then
    return;
  end if;

  update public.so_po_returns
    set status = v_new_status, updated_at = now()
    where id = p_return_id
      and status not in (
        'cancelled',
        'resolved_credit',
        'resolved_replacement',
        'resolved_partial'
      );

  -- Stamp the CN with the resolution_type + terminal status.
  select credit_note_id into v_cn_id
    from public.so_po_returns where id = p_return_id;
  if v_cn_id is null then
    return;
  end if;

  -- Phase 8.6 fix: compute the customer-ledger mix and stamp the correct
  -- resolution_type. Pure store_credit now gets its own arm (was silently
  -- collapsing to 'refund' before).
  select
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  into
    v_all_replacement, v_all_store_credit, v_all_refund
  from public.return_line_customer_resolutions cr
  join public.return_lines rl on rl.id = cr.return_line_id
  where rl.return_id = p_return_id;

  v_new_resolution_type := case
    when v_all_replacement  then 'replacement'::public.credit_note_resolution_type
    when v_all_store_credit then 'store_credit'::public.credit_note_resolution_type
    when v_all_refund       then 'refund'::public.credit_note_resolution_type
    else null
  end;

  update public.credit_notes cn
    set resolution_type = v_new_resolution_type,
        status = case
          when cn.status = 'void'::public.credit_note_status
            then 'void'::public.credit_note_status
          else 'resolved'::public.credit_note_status
        end
    where cn.id = v_cn_id;
end;
$$;

comment on function public._maybe_close_return is
  'Internal. Flips so_po_returns.status to the derived resolved_* value ONLY when BOTH customer_remaining and inventory_remaining reach 0 in return_progress. Stamps credit_notes.resolution_type from the customer-ledger mix (replacement / store_credit / refund / null for mixed) and flips credit_notes.status to `resolved` (unless already void). No-op while either dimension has remaining qty.';

-- ─── Backfill: re-run _maybe_close_return on every return with a CN ────────
-- Corrects historical rows where the old CASE stamped `refund` on pure
-- store_credit returns, and stamps status='resolved' on any linked CN whose
-- return is already fully compensated.
do $$
declare
  r record;
begin
  for r in
    select id from public.so_po_returns
    where credit_note_id is not null
  loop
    perform public._maybe_close_return(r.id);
  end loop;
end;
$$;
