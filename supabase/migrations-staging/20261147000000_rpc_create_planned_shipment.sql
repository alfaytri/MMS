-- Create a plan-ahead shipment (status 'planned') from forecast lines, before any
-- PO exists; links each open forecast to it. (#3, phase 3b)
create or replace function public.rpc_create_planned_shipment(
  p_mode public.shipment_mode,
  p_forecast_ids uuid[],
  p_tracking text default null,
  p_carrier text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_ship uuid;
begin
  if coalesce(array_length(p_forecast_ids, 1), 0) = 0 then
    raise exception 'Pick at least one forecast line';
  end if;
  insert into public.shipments (mode, status, tracking_number, carrier)
  values (p_mode, 'planned', nullif(p_tracking, ''), nullif(p_carrier, ''))
  returning id into v_ship;
  update public.purchase_forecasts
     set shipment_id = v_ship
   where id = any(p_forecast_ids) and status = 'open';
  return v_ship;
end $$;
