-- Phase 7 — Sub-task 7.1 part 2:
--   (a) Backfill the two new ledger tables from return_line_resolutions
--       BEFORE replacing the views, so views don't briefly show "nothing
--       resolved" for existing returns.
--   (b) CREATE OR REPLACE return_line_progress + return_progress. Postgres
--       requires CREATE OR REPLACE VIEW to preserve existing column names
--       and positions, so all Phase 6 columns stay first (with semantics
--       matching the customer dimension, which is what Phase 6 UI showed),
--       and the new dual-ledger columns are appended at the end.
--
-- The legacy return_line_resolutions table is preserved for rollback; drop
-- in a Phase 8 cleanup once Phase 7 has been in production for a stability
-- window.

-- ─── (a) Backfill ────────────────────────────────────────────────────────
insert into public.return_line_customer_resolutions (
  id, return_line_id, resolution_type, qty,
  sale_delivery_id, credit_note_id, notes, created_at, created_by
)
select
  gen_random_uuid(), r.return_line_id, r.resolution_type, r.qty,
  r.sale_delivery_id, r.credit_note_id, r.notes, r.created_at, r.created_by
from public.return_line_resolutions r
where r.resolution_type in ('refund','replacement','store_credit');

insert into public.return_line_inventory_dispositions (
  id, return_line_id, disposition_type, qty,
  inventory_stock_movement_id, notes, created_at, created_by
)
select
  gen_random_uuid(), r.return_line_id, 'write_off', r.qty,
  r.inventory_stock_movement_id, r.notes, r.created_at, r.created_by
from public.return_line_resolutions r
where r.resolution_type = 'write_off';

-- ─── (b) Rebuild return_line_progress ────────────────────────────────────
-- Column order MUST match the existing view for CREATE OR REPLACE:
--   1 return_line_id, 2 return_id, 3 brand_variant_id, 4 item_name,
--   5 sku, 6 returned_qty, 7 condition, 8 resolved_qty, 9 remaining_qty,
--   10 resolutions_by_type
-- New dual-ledger columns (customer_*, inventory_*) are appended at the end.
create or replace view public.return_line_progress as
with cust as (
  select return_line_id, sum(qty) as sum_qty
  from public.return_line_customer_resolutions
  group by return_line_id
),
inv as (
  select return_line_id, sum(qty) as sum_qty
  from public.return_line_inventory_dispositions
  group by return_line_id
),
cust_mix as (
  select return_line_id,
         jsonb_object_agg(resolution_type, sum_qty) as by_type
  from (
    select return_line_id, resolution_type, sum(qty) as sum_qty
    from public.return_line_customer_resolutions
    group by return_line_id, resolution_type
  ) x
  group by return_line_id
),
inv_mix as (
  select return_line_id,
         jsonb_object_agg(disposition_type, sum_qty) as by_type
  from (
    select return_line_id, disposition_type, sum(qty) as sum_qty
    from public.return_line_inventory_dispositions
    group by return_line_id, disposition_type
  ) x
  group by return_line_id
)
select
  rl.id                                                                                     as return_line_id,
  rl.return_id,
  rl.brand_variant_id,
  rl.item_name,
  rl.sku,
  rl.qty                                                                                    as returned_qty,
  rl.condition,
  -- Legacy Phase 6 columns kept in original positions; now semantically the
  -- customer dimension (backward-compat for callers reading these names).
  coalesce(cust.sum_qty, 0)::numeric                                                        as resolved_qty,
  greatest(0, rl.qty - coalesce(cust.sum_qty, 0))::numeric                                  as remaining_qty,
  cust_mix.by_type                                                                          as resolutions_by_type,
  -- Phase 7 dual-ledger columns appended at the end.
  coalesce(cust.sum_qty, 0)::numeric                                                        as customer_resolved_qty,
  greatest(0, rl.qty - coalesce(cust.sum_qty, 0))::numeric                                  as customer_remaining_qty,
  case when rl.condition = 'damaged' then coalesce(inv.sum_qty, 0)::numeric
       else null::numeric end                                                               as inventory_resolved_qty,
  case when rl.condition = 'damaged' then greatest(0, rl.qty - coalesce(inv.sum_qty, 0))::numeric
       else 0::numeric end                                                                  as inventory_remaining_qty,
  cust_mix.by_type                                                                          as customer_resolutions_by_type,
  inv_mix.by_type                                                                           as inventory_dispositions_by_type
from public.return_lines rl
left join cust     on cust.return_line_id     = rl.id
left join inv      on inv.return_line_id      = rl.id
left join cust_mix on cust_mix.return_line_id = rl.id
left join inv_mix  on inv_mix.return_line_id  = rl.id;

comment on view public.return_line_progress is
  'Per-line coverage across BOTH customer and inventory ledgers. Damaged rows require both dimensions to reach 0 remaining before the return can close. Legacy Phase 6 columns (resolved_qty / remaining_qty / resolutions_by_type) point at the customer dimension for backward compat — drop in Phase 8 cleanup.';

-- ─── (b) Rebuild return_progress ─────────────────────────────────────────
-- Column order MUST preserve the existing view:
--   1 return_id, 2 return_number, 3 status, 4 total_returned,
--   5 total_resolved, 6 total_remaining, 7 resolutions_by_type,
--   8 coverage_status
-- Phase 7 dual-ledger columns appended.
create or replace view public.return_progress as
with per_return as (
  select
    r.id                                                 as return_id,
    r.return_number,
    r.status,
    sum(rl.qty)::numeric                                 as total_returned,
    sum(coalesce(p.customer_resolved_qty, 0))::numeric   as customer_resolved,
    sum(coalesce(p.customer_remaining_qty, 0))::numeric  as customer_remaining,
    sum(case when rl.condition = 'damaged' then rl.qty else 0 end)::numeric                                       as total_damaged,
    sum(case when rl.condition = 'damaged' then coalesce(p.inventory_resolved_qty, 0) else 0 end)::numeric        as inventory_resolved,
    sum(case when rl.condition = 'damaged' then coalesce(p.inventory_remaining_qty, 0) else 0 end)::numeric       as inventory_remaining
  from public.so_po_returns r
  join public.return_lines rl on rl.return_id = r.id
  join public.return_line_progress p on p.return_line_id = rl.id
  group by r.id
),
cust_mix as (
  select rl2.return_id,
         jsonb_object_agg(resolution_type, sum_qty) as by_type
  from (
    select rl2.return_id, cr.resolution_type, sum(cr.qty) as sum_qty
    from public.return_lines rl2
    join public.return_line_customer_resolutions cr on cr.return_line_id = rl2.id
    group by rl2.return_id, cr.resolution_type
  ) x
  join public.return_lines rl2 on rl2.return_id = x.return_id
  group by rl2.return_id
),
inv_mix as (
  select rl2.return_id,
         jsonb_object_agg(disposition_type, sum_qty) as by_type
  from (
    select rl2.return_id, idp.disposition_type, sum(idp.qty) as sum_qty
    from public.return_lines rl2
    join public.return_line_inventory_dispositions idp on idp.return_line_id = rl2.id
    group by rl2.return_id, idp.disposition_type
  ) x
  join public.return_lines rl2 on rl2.return_id = x.return_id
  group by rl2.return_id
)
select
  pr.return_id,
  pr.return_number,
  pr.status,
  pr.total_returned,
  -- Legacy Phase 6 columns — customer dimension.
  pr.customer_resolved                                                                    as total_resolved,
  pr.customer_remaining                                                                   as total_remaining,
  cust_mix.by_type                                                                        as resolutions_by_type,
  case when pr.customer_remaining > 0 or pr.inventory_remaining > 0 then 'in_progress'
       else 'fully_resolved' end                                                          as coverage_status,
  -- Phase 7 dual-ledger columns.
  pr.customer_resolved,
  pr.customer_remaining,
  pr.total_damaged,
  pr.inventory_resolved,
  pr.inventory_remaining,
  cust_mix.by_type                                                                        as customer_resolutions_by_type,
  inv_mix.by_type                                                                         as inventory_dispositions_by_type,
  case when pr.customer_remaining > 0 then 'in_progress' else 'fully_resolved' end       as customer_status,
  case when pr.total_damaged = 0 then 'not_applicable'
       when pr.inventory_remaining > 0 then 'in_progress'
       else 'fully_resolved' end                                                          as inventory_status,
  case when pr.customer_remaining > 0 or pr.inventory_remaining > 0 then 'in_progress'
       else 'fully_resolved' end                                                          as overall_coverage_status,
  (pr.total_damaged > 0
   and pr.inventory_remaining = 0
   and pr.customer_remaining > 0)                                                         as compensation_missing
from per_return pr
left join cust_mix on cust_mix.return_id = pr.return_id
left join inv_mix  on inv_mix.return_id  = pr.return_id;

comment on view public.return_progress is
  'Per-return aggregate across both ledgers. compensation_missing = damaged units fully dispositioned inventory-wise but customer received nothing (seller-fault-style bookkeeping bug indicator). Legacy columns (total_resolved / total_remaining / resolutions_by_type / coverage_status) point at the customer dimension for Phase 6 callers.';

grant select on public.return_line_progress to anon, authenticated, service_role;
grant select on public.return_progress      to anon, authenticated, service_role;

-- ─── Verification log ────────────────────────────────────────────────────
do $$
declare
  v_missing int;
  v_cust    int;
  v_inv     int;
begin
  select count(*) into v_cust from public.return_line_customer_resolutions;
  select count(*) into v_inv  from public.return_line_inventory_dispositions;
  select count(*) into v_missing from public.return_progress where compensation_missing = true;
  raise notice 'Phase 7.1 backfill: % customer resolution rows, % inventory disposition rows populated.', v_cust, v_inv;
  raise notice 'Phase 7.1 backfill: % return(s) flagged compensation_missing.', v_missing;
end $$;
