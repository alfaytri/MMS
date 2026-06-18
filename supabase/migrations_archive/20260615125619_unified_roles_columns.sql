-- Unified Roles schema — additive column changes.
-- After this migration, the rest of the system keeps working unchanged
-- because no code yet references the new columns.
BEGIN;

ALTER TABLE custom_roles
  ADD COLUMN IF NOT EXISTS is_approval_slot BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_custom_roles
  ADD COLUMN IF NOT EXISTS approval_scopes TEXT[] DEFAULT NULL;

-- Workflow scope values are constrained to the three known approval workflows.
-- NULL = global (eligible in every chain). An empty array is normalized to NULL
-- by the UI on save.
ALTER TABLE user_custom_roles
  DROP CONSTRAINT IF EXISTS user_custom_roles_approval_scopes_chk;

ALTER TABLE user_custom_roles
  ADD CONSTRAINT user_custom_roles_approval_scopes_chk
  CHECK (
    approval_scopes IS NULL
    OR approval_scopes <@ ARRAY['po','inv_check','stock_adj']::text[]
  );

COMMIT;
