-- 20261042000000_stamp_delivery_creator.sql
--
-- Deliveries created via create_and_confirm_delivery had NULL created_by /
-- created_by_name (the RPC inserted sale_deliveries without a creator), so the
-- delivery detail's "Created By" always showed "—". Both overloads are
-- SECURITY DEFINER, so stamp the authenticated caller inside the RPC (no client
-- change needed): created_by = _current_user_data_id() (the profile id, same as
-- sale_orders.created_by) and created_by_name = that profile's full_name.
--
-- Drift-proof in-place transform via exact substring replace() over the live
-- body (anchors are the column names + param names, identical in both the 5-arg
-- and 6-arg overloads). Idempotent; asserts or aborts.

DO $do$
DECLARE
  r record; v_def text; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_and_confirm_delivery'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('created_by, created_by_name' in v_def) > 0 THEN
      RAISE NOTICE 'create_and_confirm_delivery oid % already stamps creator — skip', r.oid;
      CONTINUE;
    END IF;

    -- add the two columns to the sale_deliveries insert column list
    v_new := replace(
      v_def,
      'warehouse_name, date, status',
      'warehouse_name, date, status, created_by, created_by_name');
    -- add the matching values (the authenticated caller)
    v_new := replace(
      v_new,
      $q$p_warehouse_name, p_date, 'pending'$q$,
      $q$p_warehouse_name, p_date, 'pending',
    public._current_user_data_id(),
    (SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id())$q$);

    IF v_new = v_def OR position('created_by, created_by_name' in v_new) = 0 THEN
      RAISE EXCEPTION 'creator-stamp transform did not apply to oid %', r.oid;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'create_and_confirm_delivery oid %: creator stamp added', r.oid;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
