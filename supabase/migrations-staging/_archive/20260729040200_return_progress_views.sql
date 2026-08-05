-- Phase 6.1: per-line and per-return progress views over the ledger.
--
-- return_line_progress  : per return_line — returned, resolved (from ledger), remaining, resolutions_by_type
-- return_progress       : per return    — sums, resolutions_by_type mix, coverage_status ('in_progress' / 'fully_resolved')

create or replace view public.return_line_progress as
select
  rl.id as return_line_id,
  rl.return_id,
  rl.brand_variant_id,
  rl.item_name,
  rl.sku,
  rl.qty as returned_qty,
  rl.condition,
  coalesce(sum(res.qty), 0)::numeric as resolved_qty,
  greatest(0, rl.qty - coalesce(sum(res.qty), 0))::numeric as remaining_qty,
  -- resolutions_by_type: {"replacement": 7, "write_off": 2} for a line that saw both.
  (
    select jsonb_object_agg(rt.resolution_type, rt.total)
    from (
      select r2.resolution_type, sum(r2.qty) as total
      from public.return_line_resolutions r2
      where r2.return_line_id = rl.id
      group by r2.resolution_type
    ) rt
  ) as resolutions_by_type
from public.return_lines rl
left join public.return_line_resolutions res on res.return_line_id = rl.id
group by rl.id;

comment on view public.return_line_progress is
  'Per return_line — returned qty, resolved qty (sum from ledger), remaining, and per-type breakdown.';

create or replace view public.return_progress as
select
  r.id as return_id,
  r.return_number,
  r.status,
  coalesce(sum(p.returned_qty), 0)::numeric as total_returned,
  coalesce(sum(p.resolved_qty), 0)::numeric as total_resolved,
  coalesce(sum(p.remaining_qty), 0)::numeric as total_remaining,
  -- Aggregated mix across all lines. Line-level jsonb_object_agg would collide keys.
  (
    select jsonb_object_agg(mix.resolution_type, mix.total)
    from (
      select res.resolution_type, sum(res.qty) as total
      from public.return_lines rl2
      join public.return_line_resolutions res on res.return_line_id = rl2.id
      where rl2.return_id = r.id
      group by res.resolution_type
    ) mix
  ) as resolutions_by_type,
  case
    when coalesce(sum(p.remaining_qty), 0) > 0 then 'in_progress'
    else 'fully_resolved'
  end as coverage_status
from public.so_po_returns r
left join public.return_lines rl on rl.return_id = r.id
left join public.return_line_progress p on p.return_line_id = rl.id
group by r.id;

comment on view public.return_progress is
  'Per return — total returned/resolved/remaining, resolution mix, and coverage status.';

grant select on public.return_line_progress to anon, authenticated, service_role;
grant select on public.return_progress to anon, authenticated, service_role;
