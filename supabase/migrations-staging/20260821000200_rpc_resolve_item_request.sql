-- Resolve a warehouse item request (fulfil or dismiss) and clear its bell
-- notifications. Guarded to the request's warehouse RP(s), super-viewers
-- (owner/accountant) and system admins. SECURITY DEFINER so it can update the
-- other users' notification rows past RLS.
create or replace function public.rpc_resolve_item_request(
  p_request_id uuid,
  p_status     text,
  p_note       text default null
) returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid    := public._current_user_data_id();
  v_wh    uuid;
  v_is_rp boolean;
  v_super boolean := coalesce((auth.jwt() ->> 'user_type') in ('owner', 'accountant'), false);
  v_admin boolean := public._auth_user_has_permission('system.admin');
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;
  if p_status not in ('fulfilled', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select warehouse_id into v_wh from public.warehouse_item_requests where id = p_request_id;
  if v_wh is null then
    raise exception 'Request not found.';
  end if;

  select exists (
    select 1 from public.warehouse_responsible_persons
    where warehouse_id = v_wh and profile_id = v_uid
  ) into v_is_rp;

  if not (v_is_rp or v_super or v_admin) then
    raise exception 'You are not allowed to resolve this request.';
  end if;

  update public.warehouse_item_requests
     set status          = p_status,
         resolved_by     = v_uid,
         resolved_at     = now(),
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request_id and status = 'pending';

  update public.notifications
     set actioned_at = now(),
         read_at     = coalesce(read_at, now())
   where related_type = 'item_request' and related_id = p_request_id and actioned_at is null;
end;
$function$;

grant execute on function public.rpc_resolve_item_request(uuid, text, text)
  to authenticated, service_role;
