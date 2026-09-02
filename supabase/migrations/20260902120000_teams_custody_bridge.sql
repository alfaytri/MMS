-- 20260902120000_teams_custody_bridge.sql
-- Phase 1: link custody locations to real teams; designate one Teams custody warehouse.
-- Applied manually to the whole-app dev DB (wkmvjxxmzstsvahuiwsz) — NOT pushed to staging/prod.

-- 1. Activate the dormant bridge: warehouse_sub_containers.team_id -> teams.id
alter table public.warehouse_sub_containers
  drop constraint if exists wsc_team_id_fkey;
alter table public.warehouse_sub_containers
  add constraint wsc_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete set null;

-- One custody location per team (partial: only linked rows are constrained).
create unique index if not exists uq_wsc_team_id
  on public.warehouse_sub_containers (team_id) where team_id is not null;

-- 2. Designate the single Teams custody warehouse (symmetric with is_project_warehouse).
alter table public.warehouses
  add column if not exists is_team_warehouse boolean not null default false;

-- At most one warehouse may be the Teams warehouse.
create unique index if not exists uq_one_team_warehouse
  on public.warehouses (is_team_warehouse) where is_team_warehouse;

-- 3. get_custody_master_list: add team_id + team_name (return type changes -> drop first).
drop function if exists public.get_custody_master_list(uuid);
create function public.get_custody_master_list(p_warehouse_id uuid default null::uuid)
 returns table(id uuid, name text, warehouse_id uuid, warehouse_name text, division_id uuid,
               division_name text, is_active boolean, responsible_person_profile_id uuid,
               responsible_person_name text, responsible_person_phone text,
               created_at timestamptz, updated_at timestamptz,
               team_id uuid, team_name text)
 language sql stable security definer set search_path to 'public'
as $function$
  select sc.id, sc.name, w.id as warehouse_id, w.name as warehouse_name,
         sc.division_id, d.name as division_name, sc.is_active,
         sc.responsible_person_profile_id, u.full_name as responsible_person_name,
         u.phone as responsible_person_phone, sc.created_at, sc.updated_at,
         sc.team_id, t.name_en as team_name
  from   public.warehouse_sub_containers sc
  join   public.warehouses         w on w.id = sc.warehouse_id
  left   join public.company_divisions d on d.id = sc.division_id
  left   join public.user_data     u on u.id = sc.responsible_person_profile_id
  left   join public.teams         t on t.id = sc.team_id
  where  w.warehouse_kind = 'custody'
    and  (p_warehouse_id is null or w.id = p_warehouse_id)
  order  by w.name, d.name, sc.name;
$function$;

-- 4. rpc_upsert_warehouse_sub_container: add p_team_id (arg list changes -> drop first).
-- Drop BOTH the old 6-arg and the new 7-arg signature so re-applying this file is idempotent.
drop function if exists public.rpc_upsert_warehouse_sub_container(uuid,text,uuid,uuid,boolean,uuid);
drop function if exists public.rpc_upsert_warehouse_sub_container(uuid,text,uuid,uuid,boolean,uuid,uuid);
create function public.rpc_upsert_warehouse_sub_container(
  p_warehouse_id uuid, p_name text, p_division_id uuid default null::uuid,
  p_id uuid default null::uuid, p_is_active boolean default null::boolean,
  p_responsible_person_profile_id uuid default null::uuid,
  p_team_id uuid default null::uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_wh_kind text;
  v_is_virtual boolean;
  v_new_id uuid;
begin
  if p_warehouse_id is null then raise exception 'warehouse_id is required'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'name is required'; end if;

  select warehouse_kind, is_virtual into v_wh_kind, v_is_virtual
    from public.warehouses where id = p_warehouse_id;
  if not found then raise exception 'Warehouse % not found', p_warehouse_id; end if;

  if v_wh_kind = 'custody' then
    if p_division_id is null then
      raise exception 'Division is required for custody sub-containers.';
    end if;
  elsif not coalesce(v_is_virtual, false) then
    if p_division_id is null then
      raise exception 'Division is required for real-warehouse sub-containers.';
    end if;
  end if;

  if p_id is null then
    insert into public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active, responsible_person_profile_id, team_id
    ) values (
      p_warehouse_id, p_division_id, btrim(p_name), coalesce(p_is_active, true),
      p_responsible_person_profile_id, p_team_id
    ) returning id into v_new_id;
    return v_new_id;
  end if;

  if not exists (
    select 1 from public.warehouse_sub_containers
    where id = p_id and warehouse_id = p_warehouse_id
  ) then
    raise exception 'Sub-container % is not under warehouse %.', p_id, p_warehouse_id;
  end if;

  update public.warehouse_sub_containers
     set name                          = btrim(p_name),
         division_id                   = coalesce(p_division_id, division_id),
         is_active                     = coalesce(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         team_id                       = coalesce(p_team_id, team_id),
         updated_at                    = now()
   where id = p_id;
  return p_id;
end;
$function$;

-- 5. Provision (insert-or-sync) a team's custody location. Idempotent by team_id.
create or replace function public.rpc_provision_team_custody(p_team_id uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_wh uuid; v_name text; v_div uuid; v_leader uuid; v_profile uuid; v_sub uuid;
begin
  select id into v_wh from public.warehouses
    where is_team_warehouse order by name limit 1;
  if v_wh is null then
    raise exception 'No Teams custody warehouse designated. Set is_team_warehouse on one custody warehouse.';
  end if;

  select coalesce(nullif(btrim(name_en), ''), name), division_id, leader_id
    into v_name, v_div, v_leader
    from public.teams where id = p_team_id and deleted_at is null;
  if not found then raise exception 'Team % not found or archived', p_team_id; end if;
  if v_div is null then
    raise exception 'Assign the team a division before enabling custody.';
  end if;

  if v_leader is not null then
    select profile_id into v_profile from public.employees where id = v_leader;
  end if;

  select id into v_sub from public.warehouse_sub_containers where team_id = p_team_id;

  return public.rpc_upsert_warehouse_sub_container(
    p_warehouse_id                  => v_wh,
    p_name                          => v_name,
    p_division_id                   => v_div,
    p_id                            => v_sub,
    p_is_active                     => true,
    p_responsible_person_profile_id => v_profile,
    p_team_id                       => p_team_id
  );
end;
$function$;

-- 6. Deactivate a team's custody location (keeps the link for later re-enable).
create or replace function public.rpc_deactivate_team_custody(p_team_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.warehouse_sub_containers
     set is_active = false, updated_at = now()
   where team_id = p_team_id;
end;
$function$;

-- 7. Grants (SECURITY DEFINER funcs: allow authenticated, deny anon).
revoke all on function public.rpc_provision_team_custody(uuid) from public, anon;
revoke all on function public.rpc_deactivate_team_custody(uuid) from public, anon;
grant execute on function public.rpc_provision_team_custody(uuid) to authenticated;
grant execute on function public.rpc_deactivate_team_custody(uuid) to authenticated;
grant execute on function public.rpc_upsert_warehouse_sub_container(uuid,text,uuid,uuid,boolean,uuid,uuid) to authenticated;
grant execute on function public.get_custody_master_list(uuid) to authenticated;
