-- Enable Row Level Security on the contract tables (audit finding #1).
--
-- Until now RLS was DISABLED on every contract table, so any authenticated user
-- could read, write, and delete every contract, payment, and visit in the
-- company — cross-division, with no permission at all. These policies scope
-- access to the same predicate the rest of the app was built around
-- (is_contract_visible: system-admin, owner/accountant, or division overlap +
-- a contracts permission). Money-bearing writes now go through SECURITY DEFINER
-- RPCs (which bypass RLS as the definer), so these policies chiefly gate the
-- direct client reads and the direct child-row edits the UI still performs.
BEGIN;

-- ---- Parent ---------------------------------------------------------------
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select ON public.contracts
  FOR SELECT TO authenticated
  USING (public.is_contract_visible(id));

CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    public._auth_user_has_permission('contracts.quotations.create')
    OR public._auth_user_has_permission('contracts.quotations.manage')
    OR public._auth_user_has_permission('contracts.live.manage')
  );

CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE TO authenticated
  USING (public.is_contract_visible(id))
  WITH CHECK (public.is_contract_visible(id));

CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE TO authenticated
  USING (
    public._auth_user_has_permission('contracts.quotations.manage')
    OR public._auth_user_has_permission('contracts.live.manage')
  );

-- ---- Children: touch a child row iff you can see its parent contract -------
-- (INSERT also admits contract create/manage permission so a create-only user
--  can seed the line items of a quotation they just created.)
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_services','contract_milestones','contract_visits','contract_payments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY %1$s_access ON public.%1$I
        FOR ALL TO authenticated
        USING (public.is_contract_visible(contract_id))
        WITH CHECK (
          public.is_contract_visible(contract_id)
          OR public._auth_user_has_permission('contracts.quotations.create')
          OR public._auth_user_has_permission('contracts.quotations.manage')
          OR public._auth_user_has_permission('contracts.live.manage')
        )
    $p$, t);
  END LOOP;
END
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';
