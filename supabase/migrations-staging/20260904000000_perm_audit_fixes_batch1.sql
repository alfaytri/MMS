-- Permission audit fixes — batch 1 (direct-insert tables only).
-- See docs/security/2026-08-16-permission-audit.md.
--
-- A1 — make roles.create real:
--   custom_roles INSERT checked master_data.roles.manage only, so the
--   "Create Role" permission was inert. Now .create OR .manage. Direct insert
--   (useRoles). Backward-compatible (manage still works).
--
-- A2/B — lock down wide-open master-data creation:
--   companies / company_divisions / warehouses / suppliers INSERT were
--   with_check = true — ANY authenticated user could insert directly via the
--   Data API (the UI hid the button, but RLS did not enforce it). Now require
--   the module's .create OR .manage. Safe (verified on new-prod 2026-08-16):
--   admins bypass via _user_has_permission; Purchase Manager/User hold the
--   suppliers keys; no non-admin role holds companies/divisions/warehouses keys
--   (those become admin-only until granted) and the UI already gates the button,
--   so no UX regression — this only closes the direct-API hole.
--
-- All checks resolve live from custom_roles (no JWT refresh). INSERT policies
-- take WITH CHECK only. Bills / invoices / credit-notes are created via
-- RPCs / multi-table flows and are handled separately (audit doc §A3), not here.

-- A1: roles.create
ALTER POLICY custom_roles_manage_insert ON public.custom_roles
  WITH CHECK (
    public._auth_user_has_permission('master_data.roles.create')
    OR public._auth_user_has_permission('master_data.roles.manage')
  );

-- A2/B: master-data create lockdown
ALTER POLICY "Admin can insert companies" ON public.companies
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'master_data.companies.create')
    OR public._user_has_permission(public._current_user_data_id(), 'master_data.companies.manage')
  );

ALTER POLICY "Admin can insert divisions" ON public.company_divisions
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'master_data.divisions.create')
    OR public._user_has_permission(public._current_user_data_id(), 'master_data.divisions.manage')
  );

ALTER POLICY "Internal users can insert warehouses" ON public.warehouses
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'master_data.warehouses.create')
    OR public._user_has_permission(public._current_user_data_id(), 'master_data.warehouses.manage')
  );

ALTER POLICY "Internal users can insert suppliers" ON public.suppliers
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'master_data.suppliers.create')
    OR public._user_has_permission(public._current_user_data_id(), 'master_data.suppliers.manage')
  );

NOTIFY pgrst, 'reload schema';
