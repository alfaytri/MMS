BEGIN;

CREATE OR REPLACE FUNCTION user_can_action_adjustment_step(
  p_profile_id   UUID,
  p_step_role    TEXT,
  p_warehouse_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    OR CASE p_step_role
      WHEN 'accounting_manager' THEN
        user_has_approval_role_in_scope(p_profile_id, ARRAY['Accountant'], 'stock_adj')

      WHEN 'inventory_manager' THEN EXISTS (
        SELECT 1
        FROM   user_custom_roles ucr
        JOIN   custom_roles cr ON cr.id = ucr.role_id
        WHERE  ucr.profile_id = p_profile_id
          AND  cr.deleted_at IS NULL
          AND  'warehouse.adjustment.approve' = ANY(cr.permissions)
      )

      WHEN 'responsible_person' THEN EXISTS (
        SELECT 1 FROM warehouse_field_rps
        WHERE  profile_id = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )

      WHEN 'brand_manager' THEN
        user_has_approval_role_in_scope(p_profile_id, ARRAY['Brand Manager'], 'stock_adj')

      WHEN 'owner' THEN
        user_has_approval_role_in_scope(p_profile_id, ARRAY['Owner'], 'stock_adj')

      ELSE false
    END
$$;

GRANT EXECUTE ON FUNCTION user_can_action_adjustment_step TO authenticated;

COMMIT;
