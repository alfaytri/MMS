BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rewrite user_can_action_adjustment_step to use the dynamic role binding
--    from workflow_approval_steps instead of hardcoded role names + permission.
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- Admin override
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    -- Responsible person: warehouse field RP
    OR (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_field_rps
        WHERE  profile_id   = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
    )
    -- Dynamic: user holds the role currently bound to this step
    OR (
      p_step_role <> 'responsible_person'
      AND EXISTS (
        SELECT 1
        FROM   workflow_approval_steps was
        JOIN   user_custom_roles      ucr ON ucr.role_id = was.role_id
        WHERE  was.workflow    = 'stock_adj'
          AND  was.step_key    = p_step_role
          AND  was.archived_at IS NULL
          AND  ucr.profile_id  = p_profile_id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION user_can_action_adjustment_step TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Strip dropped permissions from every custom_roles.permissions array.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE custom_roles
SET permissions = ARRAY(
  SELECT p
  FROM   unnest(permissions) AS p
  WHERE  p NOT IN (
    'warehouse.adjustment.approve',
    'warehouse.check.approve',
    'purchase.approvals.manage'
  )
)
WHERE permissions && ARRAY[
  'warehouse.adjustment.approve',
  'warehouse.check.approve',
  'purchase.approvals.manage'
]::text[];

COMMIT;
