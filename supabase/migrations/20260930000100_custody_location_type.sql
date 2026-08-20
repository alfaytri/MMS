-- ─── Custody location type (items 6 & 7 foundation) ────────────────────────
-- Gate custody visibility by location TYPE (team / van / project) and by
-- division. Custody locations (warehouse_sub_containers under a
-- warehouse_kind='custody' warehouse) had no type field — team/van/project was
-- only a name guess. Add location_type + backfill, and surface it in the
-- master-list RPC so the custody page + role editor can gate on it.

alter table public.warehouse_sub_containers
  add column if not exists location_type text;

comment on column public.warehouse_sub_containers.location_type is
  'Custody location kind: team / van / project. Backfilled from project_id + name; drives the custody.type.<kind>.view permission keys.';

-- Backfill custody locations only (parent warehouse_kind='custody').
update public.warehouse_sub_containers sc
set location_type = case
  when sc.project_id is not null then 'project'
  when sc.name ilike '%van%' or sc.name ilike '%vehicle%' then 'van'
  else 'team'
end
from public.warehouses w
where w.id = sc.warehouse_id
  and w.warehouse_kind = 'custody'
  and sc.location_type is null;

-- Surface location_type in the master-list RPC. Return-type change → drop+create.
drop function if exists public.get_custody_master_list(uuid);
create function public.get_custody_master_list(p_warehouse_id uuid default null)
returns table(
  id uuid, name text, warehouse_id uuid, warehouse_name text,
  division_id uuid, division_name text, is_active boolean,
  responsible_person_profile_id uuid, responsible_person_name text,
  responsible_person_phone text, location_type text,
  created_at timestamptz, updated_at timestamptz
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
         sc.location_type,
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

-- Match the anon-hardening posture (migration 20260926000000): no anon/public
-- EXECUTE; authenticated + service_role only.
revoke all on function public.get_custody_master_list(uuid) from public;
revoke all on function public.get_custody_master_list(uuid) from anon;
grant execute on function public.get_custody_master_list(uuid) to authenticated, service_role;
