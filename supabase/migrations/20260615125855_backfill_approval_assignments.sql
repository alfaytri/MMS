-- Backfill: every active approval_role_assignments row becomes a
-- user_custom_roles row pointing at the matching seeded custom_role.
-- approval_scopes is left NULL so eligibility stays global (matches today).
BEGIN;

INSERT INTO user_custom_roles (profile_id, role_id, approval_scopes)
SELECT  ara.profile_id,
        cr.id,
        NULL
FROM    approval_role_assignments ara
JOIN    custom_roles cr ON cr.name = (
  CASE ara.role::text
    WHEN 'purchase_manager'  THEN 'Purchase Manager'
    WHEN 'accountant'        THEN 'Accountant'
    WHEN 'owner'             THEN 'Owner'
    WHEN 'employee'          THEN 'Employee'
    WHEN 'warehouse_manager' THEN 'Warehouse Manager'
    WHEN 'brand_manager'     THEN 'Brand Manager'
  END
)
WHERE   ara.deleted_at IS NULL
  AND   cr.deleted_at IS NULL
ON CONFLICT (profile_id, role_id) DO NOTHING;

COMMIT;
