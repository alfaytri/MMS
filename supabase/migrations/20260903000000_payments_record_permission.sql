-- "Record Payments" permission — split the payments INSERT gate by payment type.
--
-- Was: the sole PERMISSIVE insert policy (payments_insert_manage) required
-- purchase.payments.manage for EVERY payment — even customer payments — and there
-- was no "record" permission distinct from Edit/Delete. So a Sales role could
-- never record a customer payment without the Accounting-gated Edit/Delete key,
-- and customer payments were (oddly) gated on the *purchase*-side key.
--
-- Now: gate by payment type, honoring a new granular "record" key OR the existing
-- "manage" (edit/delete) key:
--   customer payment (invoice_id set OR source_type = sale_order)
--     → sales.payments.record   OR sales.payments.manage
--   supplier payment (bill_id set OR source_type = purchase_order)
--     → purchase.payments.record OR purchase.payments.manage
--
-- Same type categorization as the existing RESTRICTIVE division_scope_insert_r
-- policy (still applies on top — division visibility). No regression: the only
-- current recorders (Accounting Jr/Sr) hold BOTH .manage keys, so both branches
-- still pass for them; admins bypass. New catalog keys sales.payments.record /
-- purchase.payments.record are added to the permission tree (operators grant
-- them per role). _user_has_permission resolves live from custom_roles — no JWT
-- refresh needed. INSERT policies take WITH CHECK only.
ALTER POLICY payments_insert_manage ON public.payments
WITH CHECK (
  (
    (invoice_id IS NOT NULL OR source_type = 'sale_order'::payment_source_type)
    AND (
      public._user_has_permission(public._current_user_data_id(), 'sales.payments.record')
      OR public._user_has_permission(public._current_user_data_id(), 'sales.payments.manage')
    )
  )
  OR
  (
    (bill_id IS NOT NULL OR source_type = 'purchase_order'::payment_source_type)
    AND (
      public._user_has_permission(public._current_user_data_id(), 'purchase.payments.record')
      OR public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage')
    )
  )
);

NOTIFY pgrst, 'reload schema';
