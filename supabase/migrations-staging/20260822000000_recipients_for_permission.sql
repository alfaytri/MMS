-- Phase 2 notification routing — single source of truth for
-- "who should be notified for permission X".
--
-- Archetype-A (request/actionable) notifications derive recipients from a
-- feature permission: a user is a recipient iff a non-deleted role they hold
-- grants p_perm (or full system-admin, or an optional override key).
-- Warehouse-scoped types additionally require the perm-holder to be an RP of
-- the given warehouse; override-holders (e.g. warehouse.transfer.approve) are
-- always included regardless of RP status.
--
-- SECURITY DEFINER: reads the role tables past RLS and returns only user_data
-- ids (the profile_id used by notifications.profile_id). Read-only.

create or replace function public.recipients_for_permission(
  p_perm         text,
  p_warehouse_id uuid default null,
  p_override     text default null
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ucr.profile_id
  from public.user_custom_roles ucr
  join public.custom_roles cr on cr.id = ucr.role_id
  where cr.deleted_at is null
    -- role grants the permission (or is a full system admin, or holds the override)
    and (
      p_perm = any(cr.permissions)
      or 'system.admin' = any(cr.permissions)
      or coalesce(cr.is_system_admin, false)
      or (p_override is not null and p_override = any(cr.permissions))
    )
    -- warehouse scope: perm-holders must be an RP of the warehouse; override-holders bypass
    and (
      p_warehouse_id is null
      or exists (
        select 1 from public.warehouse_responsible_persons rp
        where rp.warehouse_id = p_warehouse_id
          and rp.profile_id = ucr.profile_id
      )
      or (p_override is not null and p_override = any(cr.permissions))
    );
$$;

revoke all on function public.recipients_for_permission(text, uuid, text) from public;
grant execute on function public.recipients_for_permission(text, uuid, text) to authenticated, service_role;
