-- 20261005000100_autostick_item_division.sql
create or replace function public._autostick_item_division()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_item uuid; v_div uuid;
begin
  if new.remaining_qty is null or new.remaining_qty <= 0 then return new; end if;
  select sc.division_id into v_div
    from public.warehouse_sub_containers sc where sc.id = new.sub_container_id;
  if v_div is null then return new; end if;
  select bv.item_id into v_item
    from public.inventory_item_brand_variants bv where bv.id = new.brand_variant_id;
  if v_item is null then return new; end if;
  insert into public.inventory_item_divisions (item_id, division_id, category_id)
  select v_item, v_div, (select category_id from public.inventory_items where id = v_item)
  on conflict (item_id, division_id) do nothing;   -- additive; never removes
  return new;
end;
$function$;

drop trigger if exists trg_autostick_item_division on public.fifo_cost_layers;
create trigger trg_autostick_item_division
  after insert on public.fifo_cost_layers
  for each row execute function public._autostick_item_division();
