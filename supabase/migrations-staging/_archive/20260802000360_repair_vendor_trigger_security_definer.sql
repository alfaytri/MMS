-- 9.2 patch: repair_vendor auto-provision trigger function was created in
-- 20260802000200 without `security definer` / `set search_path = public`.
-- Task-reviewer flagged as Critical: the trigger writes to `warehouses`
-- (RLS-enabled) on behalf of an authenticated user whose INSERT policy on
-- warehouses may reject virtual (null division_id) rows. Elevating with
-- security definer + fixing search_path is the standard remedy for
-- trigger functions that write to RLS-protected tables.

create or replace function public._repair_vendor_provision_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh_id uuid;
begin
  insert into public.warehouses (name, is_virtual, repair_vendor_id, location)
  values ('Repair: ' || new.name, true, new.id, 'Off-site repair vendor')
  returning id into v_wh_id;

  update public.repair_vendors
     set virtual_warehouse_id = v_wh_id
   where id = new.id;

  return new;
end;
$$;
