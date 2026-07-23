-- Remove all markup/margin concepts from the schema.
--   * inventory_items.markup_percent          (per-item markup, unused in calcs)
--   * inventory_brand_variants.margin_percent (per-variant markup — used only
--     by the LC Price Review dialog, which is also being removed)
--   * batch_update_variant_prices RPC — simplified to update selling_price only
--
-- No app code path reads these columns after this migration.

-- Drop the columns
alter table public.inventory_items
  drop column if exists markup_percent;

alter table public.inventory_brand_variants
  drop column if exists margin_percent;

-- Rewrite the batch price update RPC without margin_percent
create or replace function public.batch_update_variant_prices(p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates) loop
    update inventory_brand_variants
       set selling_price = (v_update->>'selling_price')::numeric
     where id = (v_update->>'id')::uuid;
  end loop;
end;
$$;

grant execute on function public.batch_update_variant_prices(jsonb) to authenticated;

notify pgrst, 'reload schema';
