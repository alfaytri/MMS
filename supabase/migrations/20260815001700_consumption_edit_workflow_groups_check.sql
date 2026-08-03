-- Teams + Places + Consumption — Task 9 revision follow-up
--
-- Missed CHECK constraint. The Approval Workflows admin UI creates a row
-- in `approval_workflow_groups` when the operator clicks "Add path" on a
-- workflow section. That table has its own workflow-list CHECK
-- (approval_workflow_groups_workflow_check, defined in 20260629120000)
-- separate from the one on `approval_workflow_steps` that migration
-- 20260815001600 already widened.
--
-- Widen it so `consumption_edit` paths can be created. Same allowlist as
-- approval_workflow_steps.
--
-- Repro: Master Data → Admin → Approval Workflows → Consumption —
-- Cancellation Approval → Add path → 23514
-- "new row for relation ... violates check constraint
--  approval_workflow_groups_workflow_check".

BEGIN;

ALTER TABLE public.approval_workflow_groups
  DROP CONSTRAINT IF EXISTS approval_workflow_groups_workflow_check;

ALTER TABLE public.approval_workflow_groups
  ADD  CONSTRAINT approval_workflow_groups_workflow_check
    CHECK (workflow = ANY (ARRAY[
      'po','inv_check','stock_adj','sales_margin','sales_credit',
      'credit_group','receival_edit','consumption_edit'
    ]));

COMMIT;
