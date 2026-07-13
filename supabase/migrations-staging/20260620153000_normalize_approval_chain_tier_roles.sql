-- Normalize legacy snake_case role slugs in approval_chain_tiers.required_roles
-- to the current custom_roles.name (Title Case).
--
-- Background: tiers were originally created when the approver list was a fixed
-- enum of slugs ('purchase_manager', 'accountant', 'owner'). After the unified
-- roles migration, custom_roles.name became the source of truth and uses Title
-- Case display names. The UI compares required_roles against custom_roles.name,
-- so any tier still holding a slug shows up as "no assignees" even when users
-- are correctly assigned to the corresponding role.
--
-- workflow_approval_steps.step_key still carries the legacy slug and
-- workflow_approval_steps.role_id points to the matching custom_roles row, so
-- the slug → display-name mapping is recoverable from the DB itself rather
-- than hardcoded.

WITH slug_map AS (
  SELECT DISTINCT wf.step_key AS old_slug, cr.name AS new_name
  FROM workflow_approval_steps wf
  JOIN custom_roles cr ON cr.id = wf.role_id
  WHERE wf.workflow = 'po'
    AND wf.archived_at IS NULL
    AND cr.deleted_at IS NULL
)
UPDATE approval_chain_tiers t
SET required_roles = (
  SELECT array_agg(
    COALESCE((SELECT new_name FROM slug_map WHERE old_slug = elem), elem)
  )
  FROM unnest(t.required_roles) AS elem
)
WHERE t.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(t.required_roles) AS elem
    WHERE elem IN (SELECT old_slug FROM slug_map)
  );
