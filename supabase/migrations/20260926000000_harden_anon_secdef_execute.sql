-- Harden anon exposure of SECURITY DEFINER functions (DB audit 2026-08-20).
--
-- The audit found 29 SECURITY DEFINER functions executable by the public `anon`
-- role. SECURITY DEFINER bypasses RLS, so a function with no internal auth check
-- is a public endpoint for anyone holding the anon key (it ships in the browser
-- bundle). Two readers leaked data with no guard —
--   • get_custody_master_list        → custody locations + responsible-person names/phones
--   • get_category_stock_aggregates  → stock quantities / values
-- the rest self-check auth but are locked down here as defense-in-depth.
--
-- This revokes anon + public EXECUTE and grants authenticated + service_role on
-- every SECURITY DEFINER function in `public`, EXCEPT:
--   • resolve_login_email — login resolves username→email BEFORE auth (needs anon)
--   • any function referenced inside an RLS policy — the querying role needs
--     EXECUTE on it for policy evaluation, so revoking would break reads
--   • trigger functions — not callable as RPCs; they fire as the table owner
--     regardless of EXECUTE grants
--
-- SECURITY DEFINER→DEFINER calls are unaffected (a definer function runs its
-- callees with the owner's rights, not the caller's). Dynamic + idempotent, so it
-- applies identically to staging and new-prod and re-checks the RLS-policy /
-- login exclusions against whatever is live at apply time.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and p.proname <> 'resolve_login_email'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1
        from pg_policy pol
        where pg_get_expr(pol.polqual, pol.polrelid) ilike '%' || p.proname || '%'
           or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%' || p.proname || '%'
      )
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
