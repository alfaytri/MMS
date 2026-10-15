-- Link a forecast line to a PO (convert-to-PO or attach-existing). Sets po_id +
-- status='ordered'; rejects a forecast that isn't 'open'. (#3, phase 3a)
create or replace function public.rpc_link_forecast_po(p_forecast_id uuid, p_po_id uuid)
  returns void language plpgsql security definer set search_path to 'public' as $$
declare v_status text;
begin
  select status into v_status from public.purchase_forecasts where id = p_forecast_id;
  if v_status is null then raise exception 'Forecast not found'; end if;
  if v_status <> 'open' then raise exception 'Forecast is not open (status: %)', v_status; end if;
  if not exists (select 1 from public.purchase_orders where id = p_po_id) then
    raise exception 'Purchase order not found';
  end if;
  update public.purchase_forecasts
     set po_id = p_po_id, status = 'ordered'
   where id = p_forecast_id;
end $$;
