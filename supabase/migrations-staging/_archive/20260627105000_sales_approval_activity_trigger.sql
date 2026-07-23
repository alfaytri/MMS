-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-log every sales approval decision into activity_log.
--
-- Background: the client-side `void logActivity(...)` in the approve / reject /
-- force-approve hooks was unreliable — the request races the mutation success
-- and the modal closing, and in some browsers the fetch was being cancelled
-- before it landed. The user reported approval details missing from the SO
-- detail Activity tab even on freshly-approved SOs.
--
-- Fix: a single AFTER UPDATE trigger on approval_requests. When a row moves
-- from status='pending' to 'approved' or 'rejected' (for source_type='sale_order'),
-- the trigger writes an activity_log entry stamped with the approver's name,
-- the chain (margin/credit), the role they decided as, force-approve flag, and
-- the comment. Always wins because it runs in the same transaction as the
-- status change.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.log_sales_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action  TEXT;
  v_details TEXT;
BEGIN
  IF NEW.source_type <> 'sale_order' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status      THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  -- Build a readable action string. Force-approved rows get a louder label so
  -- they stand out in the timeline next to normal approvals.
  IF NEW.status = 'approved' AND NEW.force_approved THEN
    v_action := format('Sales Approval Force-Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSIF NEW.status = 'approved' THEN
    v_action := format('Sales Approval Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSE
    v_action := format('Sales Approval Rejected — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  END IF;

  v_details := jsonb_build_object(
    'approval_type', NEW.approval_type,
    'step_role',     NEW.step_role,
    'iteration',     NEW.iteration,
    'comment',       NULLIF(NEW.comment, ''),
    'reason',        CASE WHEN NEW.status = 'rejected' THEN NEW.reason ELSE NULL END,
    'force',         NEW.force_approved
  )::text;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id,
    performer_name, severity, details
  ) VALUES (
    v_action,
    'sale_orders',
    'sale_order',
    NEW.source_id,
    NEW.decided_by_name,
    CASE
      WHEN NEW.status = 'rejected'        THEN 'warning'
      WHEN NEW.force_approved              THEN 'critical'
      ELSE                                       'info'
    END,
    v_details
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sales_approval_decision ON public.approval_requests;
CREATE TRIGGER       trg_log_sales_approval_decision
  AFTER UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sales_approval_decision();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill any already-decided rows that don't have a matching activity_log
-- entry yet. Match heuristic: same SO, action LIKE 'Sales Approval%', within
-- 1 minute of decided_at. New entries are seeded for anything not yet logged.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details, created_at)
SELECT
  CASE
    WHEN ar.status = 'approved' AND ar.force_approved
      THEN format('Sales Approval Force-Approved — %s (%s)',
                  INITCAP(REPLACE(ar.step_role, '_', ' ')), ar.approval_type)
    WHEN ar.status = 'approved'
      THEN format('Sales Approval Approved — %s (%s)',
                  INITCAP(REPLACE(ar.step_role, '_', ' ')), ar.approval_type)
    ELSE     format('Sales Approval Rejected — %s (%s)',
                  INITCAP(REPLACE(ar.step_role, '_', ' ')), ar.approval_type)
  END                                                            AS action,
  'sale_orders'                                                  AS module,
  'sale_order'                                                   AS entity_type,
  ar.source_id                                                   AS entity_id,
  ar.decided_by_name                                             AS performer_name,
  CASE WHEN ar.status = 'rejected' THEN 'warning'
       WHEN ar.force_approved      THEN 'critical'
       ELSE                              'info' END              AS severity,
  jsonb_build_object(
    'approval_type', ar.approval_type,
    'step_role',     ar.step_role,
    'iteration',     ar.iteration,
    'comment',       NULLIF(ar.comment, ''),
    'reason',        CASE WHEN ar.status = 'rejected' THEN ar.reason ELSE NULL END,
    'force',         ar.force_approved
  )::text                                                        AS details,
  COALESCE(ar.decided_at, ar.updated_at, now())                  AS created_at
FROM public.approval_requests ar
WHERE ar.source_type = 'sale_order'
  AND ar.status     IN ('approved', 'rejected')
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_log al
    WHERE al.entity_id   = ar.source_id
      AND al.module      = 'sale_orders'
      AND al.action      LIKE 'Sales Approval%'
      AND (al.details::jsonb ->> 'iteration')::int = ar.iteration
      AND (al.details::jsonb ->> 'step_role')      = ar.step_role
      AND (al.details::jsonb ->> 'approval_type')  = ar.approval_type::text
  );

COMMIT;
