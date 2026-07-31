-- Phase 9 — Sub-task 9.5: return-from-repair RPC.
--
-- Closes the send-for-repair loop opened by 9.4. Given an in-transit
-- damaged_repair_out transfer, mark it as received with an outcome split of
-- (good units back to inventory) + (write-off units gone). Repair cost is
-- amortized over the good units' unit cost (writeoff units eat none of it —
-- that repair spend is treated as a sunk expense at the source warehouse).
--
-- Live-body archaeology (per feedback_rewrite_functions_from_live_db):
--   stock_movement_type enum          <- 20260726150000_enum_pass3_batch_5_columns.sql (14 values)
--   fifo_cost_layers                  <- baseline + 20260704150000 (source_type) + 20260726260000 (source_id)
--   inventory_item_brand_variants     <- renamed from inventory_brand_variants 2026-07-24
--   generate_transfer_number()        <- baseline (returns 'WT-YYYY-NNNNN')
--   inventory_stock_movements insert  <- pattern from 20260728030000 receival + 20260726260000 rpc_process_return_restock
--   warehouse_transfers shape         <- baseline + 20260802000300 (transfer_kind + shape CHECK)
--
-- Corrections vs. the plan's illustrative SQL (Task 6 in the plan doc):
--   - Plan names the enum `inventory_stock_movement_type`; the real name is
--     `stock_movement_type` (created in 20260726150000).
--   - Plan assumes helper `_add_good_stock_layer` exists; it does not.
--     Inline the good-stock addition using the receival/adjustment pattern
--     (fifo_cost_layers insert + inventory_item_brand_variants.stock_level
--     bump + inventory_stock_movements row + recalc_average_cost call).
--   - Plan links the two new inbound transfers back to the outbound via a
--     `notes` JSON string ({"returns_from_transfer_id":...}). Rejected:
--     `warehouse_transfers.source_return_line_disposition_id` already exists
--     and the 9.2 CHECK permits it for the return kinds. Setting it on the
--     inbound rows to the SAME disposition as the outbound keeps them
--     linkable by a normal join instead of parsing text-JSON at read time.
--   - Plan uses `warehouse_transfers.items` jsonb; real transfer model uses
--     BOTH header + normalized `warehouse_transfer_items` child rows (matches
--     `create_transfer_v2` + the 9.4 `rpc_send_damaged_for_repair` pattern).
--   - Return_lines has no unit_price/unit_cost column; the outbound transfer's
--     items jsonb (written by 9.4 with unit_cost from _return_line_fifo_unit_cost)
--     is the authoritative source of original cost basis. Read it from there.
--   - p_repair_cost defaults to 0 (many repairs are warranty-covered).

-- ─── 1. Extend stock_movement_type with the return-from-repair-as-good value ─
-- Postgres 15+ allows ALTER TYPE ... ADD VALUE inside a transaction as long
-- as the new value is not USED in the same transaction. Our RPC body below
-- only references it as a text literal cast at CALL time (executed later,
-- not during this migration), so this is safe. IF NOT EXISTS makes the
-- migration idempotent if it ever gets re-run.
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'damaged_return_from_repair_as_good';

-- ─── 2. rpc_return_damaged_from_repair ──────────────────────────────────
-- Reads the in-transit damaged_repair_out transfer created by 9.4, splits
-- the units into (good, writeoff) per operator input, and books the ledger
-- accordingly. Marks the outbound transfer received and creates 1–2 new
-- inbound transfer rows so the Damaged Stock overview page's "Out for repair"
-- tab drops the row and the movement history shows the closure.

create or replace function public.rpc_return_damaged_from_repair(
  p_transfer_id   uuid,
  p_outcome       text,     -- 'good' | 'writeoff' | 'mixed' (sanity check only)
  p_qty_good      numeric,
  p_qty_writeoff  numeric,
  p_repair_cost   numeric default 0,
  p_notes         text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer       record;
  v_disp_id        uuid;
  v_variant        uuid;
  v_qty_out        numeric;
  v_unit_cost_base numeric;
  v_unit_cost_good numeric;
  v_wh_source      uuid;
  v_wh_vendor      uuid;
  v_item_name      text;
  v_item_sku       text;
  v_new_transfer   uuid;
  v_transfer_num   text;
begin
  -- ─ Input validation ──────────────────────────────────────────────────
  if p_outcome not in ('good','writeoff','mixed') then
    raise exception 'rpc_return_damaged_from_repair: invalid outcome % (expected good | writeoff | mixed)', p_outcome;
  end if;
  if coalesce(p_qty_good, 0) < 0 or coalesce(p_qty_writeoff, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: qty values must be >= 0';
  end if;
  if coalesce(p_repair_cost, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: repair_cost must be >= 0';
  end if;
  -- Outcome must match qty shape (defensive — catches operator UI bugs where
  -- the outcome pick and the qty inputs drift out of sync).
  if p_outcome = 'good'     and coalesce(p_qty_writeoff, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=good but qty_writeoff=%', p_qty_writeoff;
  end if;
  if p_outcome = 'writeoff' and coalesce(p_qty_good, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=writeoff but qty_good=%', p_qty_good;
  end if;
  if p_outcome = 'mixed'    and (coalesce(p_qty_good, 0) = 0 or coalesce(p_qty_writeoff, 0) = 0) then
    raise exception 'rpc_return_damaged_from_repair: outcome=mixed requires both qty_good and qty_writeoff > 0';
  end if;

  -- ─ Locate + lock the outbound transfer ───────────────────────────────
  -- warehouse_transfers.items jsonb was dropped in 20260715140000 — items
  -- live only in the normalized warehouse_transfer_items child rows now.
  select id, transfer_kind, status, from_warehouse_id, to_warehouse_id,
         repair_vendor_id, source_return_line_disposition_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'rpc_return_damaged_from_repair: transfer % not found', p_transfer_id;
  end if;
  if v_transfer.transfer_kind <> 'damaged_repair_out' then
    raise exception 'rpc_return_damaged_from_repair: transfer % kind is % (expected damaged_repair_out)',
      p_transfer_id, v_transfer.transfer_kind;
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'rpc_return_damaged_from_repair: transfer % status is % (expected in_transit)',
      p_transfer_id, v_transfer.status;
  end if;

  v_disp_id   := v_transfer.source_return_line_disposition_id;
  v_wh_source := v_transfer.from_warehouse_id;   -- our warehouse (units originally left from here)
  v_wh_vendor := v_transfer.to_warehouse_id;     -- vendor virtual warehouse (units currently sit here)

  -- ─ Read the outbound transfer's original item metadata ───────────────
  -- 9.4's rpc_send_damaged_for_repair writes exactly one warehouse_transfer_items
  -- row per outbound transfer, so LIMIT 1 is safe. If the child row is
  -- missing the transfer is malformed — raise rather than silently proceed.
  select brand_variant_id, item_name, sku, requested_qty::numeric, unit_cost
    into v_variant, v_item_name, v_item_sku, v_qty_out, v_unit_cost_base
    from public.warehouse_transfer_items
    where transfer_id = p_transfer_id
    order by created_at
    limit 1;

  if v_variant is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no warehouse_transfer_items row', p_transfer_id;
  end if;

  if coalesce(p_qty_good, 0) + coalesce(p_qty_writeoff, 0) <> v_qty_out then
    raise exception 'rpc_return_damaged_from_repair: qty_good (%) + qty_writeoff (%) must equal transfer qty (%)',
      p_qty_good, p_qty_writeoff, v_qty_out;
  end if;

  -- Good units carry the original cost plus the amortized repair cost.
  -- Writeoff units eat no repair cost — that spend is a sunk expense.
  v_unit_cost_good := coalesce(v_unit_cost_base, 0)
                    + case when coalesce(p_qty_good, 0) > 0
                           then coalesce(p_repair_cost, 0) / p_qty_good
                           else 0 end;

  -- ─ Good branch: back to inventory_stock via a fresh FIFO layer ───────
  if p_qty_good > 0 then
    -- (a) FIFO layer at source warehouse
    insert into public.fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) values (
      v_variant, v_wh_source, current_date,
      p_qty_good::integer, v_unit_cost_good, 0, v_unit_cost_good, p_qty_good::integer,
      'damaged_repair_return', p_transfer_id
    );

    -- (b) Bump aggregate stock level
    update public.inventory_item_brand_variants
       set stock_level = stock_level + p_qty_good::integer,
           updated_at  = now()
     where id = v_variant;

    -- (c) Stamp the stock-movement ledger
    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) values (
      v_wh_source, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      'damaged_return_from_repair_as_good'::public.stock_movement_type,
      p_qty_good::integer, v_unit_cost_good,
      'warehouse_transfer', p_transfer_id,
      coalesce(p_notes, format('Return from repair (transfer %s) — %s units good, repair cost %s',
                               v_transfer.repair_vendor_id, p_qty_good, coalesce(p_repair_cost, 0)))
    );

    -- (d) Weighted-average recompute
    perform public.recalc_average_cost(v_variant);

    -- (e) Inbound transfer row (vendor -> source, kind=return_good)
    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id, repair_cost,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_good', v_transfer.repair_vendor_id, v_disp_id, p_repair_cost,
      auth.uid(), auth.uid(), now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_good::integer, v_unit_cost_good, p_qty_good::integer
    );
  end if;

  -- ─ Writeoff branch: damaged-side ledger only, no good stock touched ──
  if p_qty_writeoff > 0 then
    -- Damaged-movement row: writeoff type, source both the disposition
    -- (for the return-line trail) and the outbound transfer (for the
    -- send-cycle trail). unit_cost is the original — no repair cost, as
    -- writeoff units don't inherit any of the repair spend.
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, source_transfer_id, notes, created_by)
    values (
      'return_from_repair_as_writeoff', p_qty_writeoff, v_wh_source, v_variant, coalesce(v_unit_cost_base, 0),
      v_disp_id, p_transfer_id,
      coalesce(p_notes, format('Return from repair — %s units written off (unrecoverable)', p_qty_writeoff)),
      auth.uid()
    );

    -- Inbound transfer row (vendor -> source, kind=return_writeoff).
    -- No warehouse_transfer_items child needed since no stock is added;
    -- but we still stamp one so the "Out for repair" tab's join logic
    -- doesn't have to special-case the empty-items shape.
    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_writeoff', v_transfer.repair_vendor_id, v_disp_id,
      auth.uid(), auth.uid(), now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_writeoff::integer, coalesce(v_unit_cost_base, 0), 0
    );
  end if;

  -- ─ Close the outbound transfer ───────────────────────────────────────
  update public.warehouse_transfers
     set status                 = 'received',
         received_at            = now(),
         received_by_profile_id = auth.uid(),
         repair_cost            = coalesce(p_repair_cost, 0)
   where id = p_transfer_id;
end;
$$;

grant execute on function public.rpc_return_damaged_from_repair(uuid, text, numeric, numeric, numeric, text)
  to authenticated, service_role;

comment on function public.rpc_return_damaged_from_repair is
  'Closes a damaged_repair_out transfer with an outcome split (qty_good, qty_writeoff). Good units return to inventory_stock at source warehouse with unit cost = original + amortized repair_cost (fresh FIFO layer + stock_level bump + damaged_return_from_repair_as_good movement + recalc_average_cost). Writeoff units emit a return_from_repair_as_writeoff damaged movement with no stock change. Creates 1–2 new inbound damaged_repair_return_good/_writeoff transfer rows linked to the same disposition, and marks the outbound transfer received with the repair_cost stamped.';
