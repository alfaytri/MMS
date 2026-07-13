-- Fix: consolidate summary + products into a single CTE chain so
-- current_with_meta is visible for both aggregations.

create or replace function public.rpc_product_profitability(
  p_start_date date,
  p_end_date   date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days        integer;
  v_prev_start  date;
  v_prev_end    date;
  v_summary     jsonb;
  v_products    jsonb;
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'p_start_date and p_end_date are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'p_end_date must be >= p_start_date';
  end if;

  v_days := (p_end_date - p_start_date) + 1;
  v_prev_end   := p_start_date - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  with current_window as (
    select
      ce.brand_variant_id,
      sum(ce.qty)::numeric                            as qty,
      sum(ce.qty * sol.unit_price)                    as revenue,
      sum(ce.total_cost)                              as cogs,
      (array_agg(sol.item_name order by sol.created_at desc))[1] as item_name,
      (array_agg(sol.sku       order by sol.created_at desc))[1] as sku
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    where ce.date >= p_start_date
      and ce.date <= p_end_date
    group by ce.brand_variant_id
  ),
  current_with_meta as (
    select
      cw.brand_variant_id,
      cw.sku,
      cw.item_name  as name,
      bv.brand      as brand_name,
      cw.qty,
      cw.revenue,
      cw.cogs,
      (cw.revenue - cw.cogs) as profit,
      case when cw.revenue = 0 then null
           else round(((cw.revenue - cw.cogs) / cw.revenue) * 100, 2)
      end as margin_pct
    from current_window cw
    left join inventory_brand_variants bv on bv.id = cw.brand_variant_id
  ),
  current_totals as (
    select
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cogs), 0)    as cogs
    from current_with_meta
  ),
  prev_totals as (
    select
      coalesce(sum(ce.qty * sol.unit_price), 0)  as revenue,
      coalesce(sum(ce.total_cost), 0)            as cogs
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    where ce.date >= v_prev_start
      and ce.date <= v_prev_end
  ),
  products_agg as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'brand_variant_id', brand_variant_id,
          'sku',              sku,
          'name',             name,
          'brand_name',       brand_name,
          'qty',              qty,
          'revenue',          revenue,
          'cogs',             cogs,
          'profit',           profit,
          'margin_pct',       margin_pct
        )
        order by profit desc nulls last
      ),
      '[]'::jsonb
    ) as products
    from current_with_meta
  )
  select
    jsonb_build_object(
      'revenue',           ct.revenue,
      'cogs',              ct.cogs,
      'gross_profit',      (ct.revenue - ct.cogs),
      'margin_pct',        case when ct.revenue = 0 then null
                                else round(((ct.revenue - ct.cogs) / ct.revenue) * 100, 2)
                           end,
      'prev_revenue',      pt.revenue,
      'prev_cogs',         pt.cogs,
      'prev_gross_profit', (pt.revenue - pt.cogs),
      'prev_margin_pct',   case when pt.revenue = 0 then null
                                else round(((pt.revenue - pt.cogs) / pt.revenue) * 100, 2)
                           end
    ),
    pa.products
  into v_summary, v_products
  from current_totals ct, prev_totals pt, products_agg pa;

  return jsonb_build_object(
    'summary',  v_summary,
    'products', v_products
  );
end;
$$;

grant execute on function public.rpc_product_profitability(date, date) to authenticated;

notify pgrst, 'reload schema';
