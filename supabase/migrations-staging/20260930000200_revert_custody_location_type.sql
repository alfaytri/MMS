-- Revert 20260930000100 (custody location_type). The operator keeps custody
-- organized as separate tabs/warehouses (Projects / Teams / Van), each already
-- grantable via the existing per-warehouse "Custody Warehouse Access" section,
-- so the per-type / per-division keys were redundant. Restore
-- get_custody_master_list to its pre-000100 shape and drop location_type.

drop function if exists public.get_custody_master_list(uuid);
create function public.get_custody_master_list(p_warehouse_id uuid default null)
returns table(
  id uuid, name text, warehouse_id uuid, warehouse_name text,
  division_id uuid, division_name text, is_active boolean,
  responsible_person_profile_id uuid, responsible_person_name text,
  responsible_person_phone text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select sc.id,
         sc.name,
         w.id   as warehouse_id,
         w.name as warehouse_name,
         sc.division_id,
         d.name as division_name,
         sc.is_active,
         sc.responsible_person_profile_id,
         u.full_name as responsible_person_name,
         u.phone     as responsible_person_phone,
         sc.created_at,
         sc.updated_at
  from   public.warehouse_sub_containers sc
  join   public.warehouses         w on w.id = sc.warehouse_id
  left   join public.company_divisions d on d.id = sc.division_id
  left   join public.user_data     u on u.id = sc.responsible_person_profile_id
  where  w.warehouse_kind = 'custody'
    and  (p_warehouse_id is null or w.id = p_warehouse_id)
  order  by w.name, d.name, sc.name;
$function$;
revoke all on function public.get_custody_master_list(uuid) from public;
revoke all on function public.get_custody_master_list(uuid) from anon;
grant execute on function public.get_custody_master_list(uuid) to authenticated, service_role;

alter table public.warehouse_sub_containers drop column if exists location_type;
