-- Phase 6.9 fix: two competing delivery-number sequences.
--
-- Historically, create_and_confirm_delivery (used by the app's "Create Delivery"
-- button) minted numbers via nextval('sale_delivery_number_seq'), while
-- next_delivery_number() (used by rpc_create_partial_replacement and other
-- paths) minted via nextval('delivery_number_seq'). The two advanced
-- independently — a delivery minted by one path was invisible to the other's
-- counter. Eventually one sequence tried to reuse a number the other had
-- already taken, tripping the sale_deliveries_delivery_number_key unique
-- constraint.
--
-- This migration:
--   1. Rewrites create_and_confirm_delivery to use next_delivery_number() so
--      every new delivery number comes from one source of truth.
--   2. Bumps both sequences to (current max DEL-N) + 1 so the very next
--      nextval() from either is safely past every existing row.
--
-- sale_delivery_number_seq is left in place (not dropped) in case any other
-- code path or default references it — dropping is a follow-up cleanup.

do $$
declare
  v_max int;
begin
  select coalesce(max(nullif(regexp_replace(delivery_number, '^DEL-0*', ''), '')::int), 0)
    into v_max
    from public.sale_deliveries
    where delivery_number ~ '^DEL-[0-9]+$';

  -- Align both sequences to max+1 so nextval() returns a safe value.
  perform setval('public.delivery_number_seq', v_max, true);
  perform setval('public.sale_delivery_number_seq', v_max, true);
end $$;

create or replace function public.create_and_confirm_delivery(
  p_so_id uuid,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_date date,
  p_items jsonb
)
returns table(id uuid, delivery_number text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_delivery_number text;
  v_new_id          uuid;
  v_line            jsonb;
begin
  -- Single source of truth: use the canonical minter that
  -- rpc_create_partial_replacement and every other creator already use.
  v_delivery_number := public.next_delivery_number();

  insert into sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status
  ) values (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending'
  )
  returning sale_deliveries.id into v_new_id;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_new_id,
      case when v_line->>'brand_variant_id' is not null
           and v_line->>'brand_variant_id' != 'null'
           then (v_line->>'brand_variant_id')::uuid end,
      coalesce(v_line->>'item_name', 'Item'),
      nullif(v_line->>'sku', ''),
      coalesce((v_line->>'qty_delivered')::integer, 0)
    );
  end loop;

  perform complete_delivery_inventory(v_new_id, p_so_id);

  return query select v_new_id, v_delivery_number;
end;
$function$;
