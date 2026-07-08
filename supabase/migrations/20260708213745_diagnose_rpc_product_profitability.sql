-- Diagnostic: confirm rpc_product_profitability actually exists,
-- and dump its signature + owner + acl. Migration will raise NOTICE
-- output visible in `supabase db push` logs.
do $$
declare
  r record;
  found_count int := 0;
begin
  for r in
    select
      p.proname                           as name,
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_userbyid(p.proowner)          as owner,
      p.prosecdef                          as security_definer,
      array_to_string(p.proacl::text[], ',')  as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_product_profitability'
  loop
    found_count := found_count + 1;
    raise notice 'FOUND function %.%(%): owner=% security_definer=% acl=%',
      'public', r.name, r.args, r.owner, r.security_definer, r.acl;
  end loop;
  if found_count = 0 then
    raise notice 'NOT FOUND: public.rpc_product_profitability does not exist';
  end if;
end $$;

-- Re-notify PostgREST just in case
notify pgrst, 'reload schema';
