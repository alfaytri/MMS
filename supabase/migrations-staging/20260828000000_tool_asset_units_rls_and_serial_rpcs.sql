-- 20260828000000_tool_asset_units_rls_and_serial_rpcs.sql
-- Standalone security fix (NOT part of the Bulk Tools task list).
--
-- BEFORE: public.tool_asset_units had ONE policy —
--   "Authenticated users can manage tool_asset_units" FOR ALL USING(true) WITH CHECK(true)
--   => ANY authenticated user could INSERT/UPDATE/DELETE any column on any row
--   directly via PostgREST, sidestepping rpc_transfer_tool_unit's
--   inventory.catalog.manage gate. (The division_id column was already closed by
--   trg_guard_tool_unit_division_write in 20260827000200; this closes the rest.)
--
-- AFTER (operator-chosen "Option A"): direct table writes require
-- inventory.catalog.manage (mirrors inventory_item_divisions iid_* in
-- 20260825000400). The two legitimate NON-manager write paths in the receival
-- serialization flow are routed through SECURITY DEFINER RPCs gated on
-- (inventory.catalog.manage OR purchase.receivals.create) so receivers keep
-- working without catalog.manage:
--   (1) NEW rpc_confirm_tool_serial(...) — replaces PlaceholderUnitRow's direct UPDATE.
--   (2) auto_generate_tool_serials — gains the same gate (was an ungated DEFINER fn).
--
-- Why this is safe (live-verified 2026-08-16, mwvblpgbgxipvrevkeff):
--   tool_asset_units is owned by postgres with FORCE ROW LEVEL SECURITY = false,
--   and every DEFINER writer (this RPC, auto_generate_tool_serials, the receival
--   unit-spawn trigger create_tool_units_on_receival_layer, rpc_transfer_tool_unit)
--   is owned by postgres => they BYPASS RLS. Only the direct client hooks
--   (useCreateToolAssetUnit / useUpdateToolAssetUnit, run as the authenticated
--   role via the catalog Edit dialog) are subject to the tightened policy.
--   Identical ownership/FORCE setup to inventory_item_divisions, which already
--   runs manage-only write policies + a DEFINER writer (rpc_set_item_divisions)
--   in production.
--   Columns confirmed: tool_asset_units(id,item_id,serial_number,brand,condition,
--     status,expiry,assigned_to,created_at,receival_item_id,is_placeholder,division_id).
--   Helpers _user_has_permission(uuid,text) + _current_user_data_id() confirmed live
--   (already used by rpc_transfer_tool_unit + trg_guard_tool_unit_division_write).
--   auto_generate_tool_serials(p_item_id uuid): single overload; body below is the
--   live definition preserved verbatim, with ONLY the permission gate prepended.
BEGIN;

-- (1) Serial-confirm RPC — the sanctioned non-manager path to finalize a
--     placeholder unit's serial during/after receival. DEFINER => bypasses the
--     tightened RLS; gated so only catalog managers OR receival creators call it.
CREATE OR REPLACE FUNCTION public.rpc_confirm_tool_serial(
  p_unit_id uuid,
  p_serial  text,
  p_brand   text,
  p_expiry  date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')
    OR _user_has_permission(_current_user_data_id(), 'purchase.receivals.create')
  ) THEN
    RAISE EXCEPTION 'not authorized to confirm tool serials' USING ERRCODE = '42501';
  END IF;
  IF p_serial IS NULL OR btrim(p_serial) = '' THEN
    RAISE EXCEPTION 'serial number is required';
  END IF;

  UPDATE public.tool_asset_units
     SET serial_number  = btrim(p_serial),
         brand          = COALESCE(NULLIF(btrim(p_brand), ''), brand),
         expiry         = p_expiry,
         is_placeholder = false
   WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tool unit % not found', p_unit_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_confirm_tool_serial(uuid, text, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_tool_serial(uuid, text, text, date) TO authenticated, service_role;

-- (2) Gate the previously-ungated auto-serial RPC. Body preserved verbatim from
--     the live definition; ONLY the permission check is prepended + grants locked down.
CREATE OR REPLACE FUNCTION public.auto_generate_tool_serials(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sku       text;
  v_next_ord  int;
  v_unit      RECORD;
  v_serial    text;
  v_updated   int := 0;
BEGIN
  IF NOT (
    _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')
    OR _user_has_permission(_current_user_data_id(), 'purchase.receivals.create')
  ) THEN
    RAISE EXCEPTION 'not authorized to generate tool serials' USING ERRCODE = '42501';
  END IF;

  SELECT sku INTO v_sku FROM inventory_items WHERE id = p_item_id;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no SKU', p_item_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || p_item_id::text));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = p_item_id
    AND serial_number ~ ('^' || v_sku || '-\d+$');

  FOR v_unit IN
    SELECT id FROM tool_asset_units
    WHERE item_id = p_item_id
      AND is_placeholder = true
      AND serial_number IS NULL
    ORDER BY created_at
  LOOP
    v_next_ord := v_next_ord + 1;
    v_serial   := v_sku || '-' || LPAD(v_next_ord::text, 3, '0');

    UPDATE tool_asset_units
       SET serial_number  = v_serial,
           is_placeholder = false
     WHERE id = v_unit.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'sku_prefix',    v_sku
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_generate_tool_serials(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.auto_generate_tool_serials(uuid) TO authenticated, service_role;

-- (3) Replace the blanket ALL/true policy: read stays open to authenticated;
--     INSERT/UPDATE/DELETE require inventory.catalog.manage. Mirrors
--     inventory_item_divisions iid_* (20260825000400). RLS already enabled.
DROP POLICY IF EXISTS "Authenticated users can manage tool_asset_units" ON public.tool_asset_units;

CREATE POLICY tau_select ON public.tool_asset_units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tau_ins ON public.tool_asset_units
  FOR INSERT TO authenticated
  WITH CHECK (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
CREATE POLICY tau_upd ON public.tool_asset_units
  FOR UPDATE TO authenticated
  USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'))
  WITH CHECK (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
CREATE POLICY tau_del ON public.tool_asset_units
  FOR DELETE TO authenticated
  USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));

NOTIFY pgrst, 'reload schema';
COMMIT;
