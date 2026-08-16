-- Customers INSERT: honor the "Create Customers" permission.
--
-- Bug: policy customers_insert_manage checked master_data.customers.MANAGE
-- ("Edit Customers"), NOT master_data.customers.CREATE ("Create Customers").
-- So a role granted "Create Customers" still hit 42501 on insert — the create
-- permission was inert; only "Edit Customers" (.manage) or a system-admin could
-- create. Fix: allow INSERT for holders of .create OR .manage (keeping .manage
-- so existing edit-permission holders don't lose the ability to create).
--
-- _user_has_permission resolves live from custom_roles (no JWT refresh needed),
-- so this takes effect immediately. Strictly more permissive — no existing
-- inserter loses access. INSERT policies only take WITH CHECK (no USING).
ALTER POLICY customers_insert_manage ON public.customers
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'master_data.customers.create')
    OR public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage')
  );

NOTIFY pgrst, 'reload schema';
