-- Picture Transfer (v2) — let a SUB-CONTAINER RP receive transfers addressed to
-- their own sub-container. Contained to receive_transfer ONLY: dispatch,
-- custody-dispatch, and consumption authorization (the other is_field_rp_of
-- callers) are deliberately left unchanged.
--
-- Approach: a small membership helper + a drift-guarded in-place splice that
-- fetches the LIVE receive_transfer body and inserts one OR-branch into its
-- authorization check. The splice ABORTS if the auth block isn't present
-- verbatim (body drift) and is idempotent (no-op if already spliced) — so the
-- same migration is safe to run on staging and, later, on new-prod against
-- whatever the live body there is.
BEGIN;

-- 1. Membership helper — mirrors is_field_rp_of's shape (SQL / STABLE).
CREATE OR REPLACE FUNCTION public.is_sub_container_rp(p_profile_id uuid, p_sub_container_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id                            = p_sub_container_id
      AND  sc.responsible_person_profile_id = p_profile_id
  );
$$;

-- 2. Splice the OR-branch into receive_transfer's auth check.
DO $splice$
DECLARE
  v_src text;
  v_old text :=
'  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN';
  v_new text :=
'  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT is_sub_container_rp(p_received_by_profile_id, v_transfer.to_sub_container_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN';
BEGIN
  v_src := pg_get_functiondef('public.receive_transfer(uuid,uuid,text,jsonb)'::regprocedure);
  IF position('is_sub_container_rp' IN v_src) > 0 THEN
    RAISE NOTICE 'receive_transfer already carries the sub-RP branch — no-op.';
  ELSIF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'receive_transfer: auth block not found verbatim — body drifted, aborting splice.';
  ELSE
    EXECUTE replace(v_src, v_old, v_new);
  END IF;
END
$splice$;

NOTIFY pgrst, 'reload schema';
COMMIT;
