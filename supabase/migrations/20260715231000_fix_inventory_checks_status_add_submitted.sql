-- Add 'submitted' to inventory_checks status CHECK — missed in initial constraint.
-- Full lifecycle: draft → in_progress → submitted → pending_approval → approved | rejected

ALTER TABLE public.inventory_checks
  DROP CONSTRAINT inventory_checks_status_check;

ALTER TABLE public.inventory_checks
  ADD CONSTRAINT inventory_checks_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'in_progress'::text,
      'submitted'::text,
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text
    ]));
