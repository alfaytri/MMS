-- Sales Approval Chains — schema foundation.
--
-- Adds two new workflows (`sales_margin`, `sales_credit`) to the existing
-- workflow-steps machinery, and two matching scope values to user-role
-- assignments. Extends `approval_requests` with the columns it needs to act
-- as a per-role slip log (mirroring `po_approvals`).
BEGIN;

-- ─── Extend workflow_approval_steps.workflow CHECK ──────────────────────────
ALTER TABLE public.workflow_approval_steps
  DROP CONSTRAINT IF EXISTS workflow_approval_steps_workflow_check;
ALTER TABLE public.workflow_approval_steps
  ADD CONSTRAINT workflow_approval_steps_workflow_check
  CHECK (workflow = ANY (ARRAY['po','inv_check','stock_adj','sales_margin','sales_credit']));

-- ─── Extend user_custom_roles.approval_scopes CHECK ─────────────────────────
ALTER TABLE public.user_custom_roles
  DROP CONSTRAINT IF EXISTS user_custom_roles_approval_scopes_chk;
ALTER TABLE public.user_custom_roles
  ADD CONSTRAINT user_custom_roles_approval_scopes_chk
  CHECK (
    approval_scopes IS NULL
    OR approval_scopes <@ ARRAY['po','inv_check','stock_adj','sales_margin','sales_credit']::text[]
  );

-- ─── Extend approval_requests with per-role-slip columns ────────────────────
-- approval_requests currently stores ONE row per slip. We extend it so each
-- approval chain step lives as its own row (just like po_approvals).
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS step_role  TEXT,
  ADD COLUMN IF NOT EXISTS step_order INT DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS iteration  INT DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- New invariant: when status moves off 'pending', stamp decided_at via trigger
CREATE OR REPLACE FUNCTION public.set_approval_request_decided_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
    NEW.decided_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_requests_decided_at ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_decided_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_approval_request_decided_at();

-- Indexes for the queue queries
CREATE INDEX IF NOT EXISTS approval_requests_pending_idx
  ON public.approval_requests (source_id, approval_type, iteration)
  WHERE status = 'pending' AND is_active = true;

CREATE INDEX IF NOT EXISTS approval_requests_source_idx
  ON public.approval_requests (source_type, source_id, approval_type, iteration);

COMMIT;
