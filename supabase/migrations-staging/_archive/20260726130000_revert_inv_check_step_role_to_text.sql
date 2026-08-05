-- Same class of bug as stock_adjustment_approvals_role_chk (fixed in
-- 20260726100000): Pass 1 typed inventory_check_approvals.step_role to a
-- hardcoded 5-value enum, but the workflow admin lets orgs configure any
-- role slug (admin, purchase_manager, custom roles). When
-- build_inv_check_approval_chain returns a role outside those five, the
-- app's INSERT into inventory_check_approvals fails — silently, since the
-- caller in useCompleteAssignment didn't error-check that insert.
--
-- Fix: revert the column to text. approval_workflow_steps is the source
-- of truth for valid roles, not a standalone type. The client insert is
-- separately being tightened to check its error so future breaks surface.

BEGIN;

-- Drop the enum constraint by retyping back to text. Existing values
-- stay intact.
ALTER TABLE public.inventory_check_approvals
  ALTER COLUMN step_role TYPE text USING step_role::text;

-- Force PostgREST to reload — otherwise the client keeps sending inserts
-- typed against the old enum signature and 400s on unknown values.
NOTIFY pgrst, 'reload schema';

COMMIT;
