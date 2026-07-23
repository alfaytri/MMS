-- Fix inventory_checks and inventory_check_assignments CHECK constraints
-- with all values found in application code.

-- inventory_checks: draft → in_progress → submitted → reviewed → pending_approval → approved | rejected | completed
ALTER TABLE public.inventory_checks
  DROP CONSTRAINT inventory_checks_status_check;

ALTER TABLE public.inventory_checks
  ADD CONSTRAINT inventory_checks_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'in_progress'::text,
      'submitted'::text,
      'reviewed'::text,
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text,
      'completed'::text
    ]));

-- inventory_check_assignments: pending → in_progress → completed
ALTER TABLE public.inventory_check_assignments
  DROP CONSTRAINT inventory_check_assignments_status_check;

ALTER TABLE public.inventory_check_assignments
  ADD CONSTRAINT inventory_check_assignments_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text]));
