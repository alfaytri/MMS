-- Phase 3 (cont.): rpc_close_return — the only path that resolves a return.
--
-- Runs after 20260729030000 has committed the new enum values.

create or replace function public.rpc_close_return(
  p_return_id uuid,
  p_resolution text  -- 'refund' | 'replacement' | 'store_credit' | 'partial'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_status public.return_status;
  v_credit_note_id uuid;
begin
  if p_resolution not in ('refund', 'replacement', 'store_credit', 'partial') then
    raise exception 'rpc_close_return: invalid resolution %', p_resolution;
  end if;

  v_new_status := case p_resolution
    when 'refund'        then 'resolved_credit'
    when 'store_credit'  then 'resolved_credit'
    when 'replacement'   then 'resolved_replacement'
    when 'partial'       then 'resolved_partial'
  end::public.return_status;

  update public.so_po_returns
    set status = v_new_status,
        updated_at = now()
    where id = p_return_id
      and status = 'restocked'
    returning credit_note_id into v_credit_note_id;

  if not found then
    raise exception 'rpc_close_return: return % is not in restocked status (or does not exist)', p_return_id;
  end if;

  if v_credit_note_id is not null and p_resolution <> 'partial' then
    update public.credit_notes
      set resolution_type = p_resolution
      where id = v_credit_note_id;
  end if;
end;
$$;

grant execute on function public.rpc_close_return(uuid, text) to authenticated, service_role;

comment on function public.rpc_close_return is
  'Atomically closes a customer return: sets return status to the matching resolved_* value and stamps credit_notes.resolution_type. Only path that closes a return. p_resolution: refund | replacement | store_credit | partial.';
