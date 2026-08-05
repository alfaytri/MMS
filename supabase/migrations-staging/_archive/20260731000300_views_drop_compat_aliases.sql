-- Phase 8 Sub-task 8.4: Retire the Phase 6 backward-compat aliases from
-- return_line_progress and return_progress.
--
-- The Phase 7.1 rebuild (20260730000100_dual_ledger_views_and_backfill.sql)
-- kept these column names to avoid breaking Phase 6 UI during the transition:
--   return_line_progress: resolved_qty, remaining_qty, resolutions_by_type
--   return_progress:      total_resolved, total_remaining, resolutions_by_type, coverage_status
-- Every column above simply aliased the equivalent customer_* field. Phase
-- 8.1a migrated the last live callers off these aliases, and 8.1's grep
-- verification is now clean. Time to retire them.
--
-- Postgres note: CREATE OR REPLACE VIEW cannot drop columns; it can only
-- append. So we DROP and CREATE. return_progress depends on
-- return_line_progress via SQL join (tracked in pg_depend), so drop order
-- matters — return_progress first. The internal plpgsql readers
-- (_maybe_close_return / _record_customer_resolution / _record_inventory_
-- disposition) reference these views by name; plpgsql parses at first call,
-- not at DROP time, so their bodies are unaffected by the DROP+CREATE cycle
-- as long as the view name is present again by the time they next execute.

drop view if exists public.return_progress;
drop view if exists public.return_line_progress;

-- ─── return_line_progress (canonical Phase 7 columns only) ────────────────
create view public.return_line_progress as
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
  'Per-line coverage across BOTH customer and inventory ledgers. Damaged rows require both dimensions to reach 0 remaining before the return can close. Phase 8.4 dropped the Phase 6 backward-compat aliases (resolved_qty / remaining_qty / resolutions_by_type) — customer_* fields are canonical.';

-- ─── return_progress (canonical Phase 7 columns only) ─────────────────────
create view public.return_progress as
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
  'Per-return aggregate across both ledgers. compensation_missing = damaged units fully dispositioned inventory-wise but customer received nothing. Phase 8.4 dropped the Phase 6 backward-compat aliases (total_resolved / total_remaining / resolutions_by_type / coverage_status) — customer_* / inventory_* / overall_coverage_status fields are canonical.';

grant select on public.return_line_progress to anon, authenticated, service_role;
grant select on public.return_progress      to anon, authenticated, service_role;

notify pgrst, 'reload schema';
