-- Phase 3 hotfix: cast p_resolution to credit_note_resolution_type when
-- stamping credit_notes.resolution_type. Without the cast Postgres raises
-- "column resolution_type is of type credit_note_resolution_type but
-- expression is of type text".

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
      set resolution_type = p_resolution::public.credit_note_resolution_type
      where id = v_credit_note_id;
  end if;
end;
$$;
