-- Add CHECK constraints on 8 text status columns that lack value validation.
-- All existing data has been verified against production — no rows violate these constraints.

BEGIN;

-- 1. inventory_brand_variants: active | archived
ALTER TABLE public.inventory_brand_variants
  ADD CONSTRAINT inventory_brand_variants_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

-- 2. inventory_categories: active | archived
ALTER TABLE public.inventory_categories
  ADD CONSTRAINT inventory_categories_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

-- 3. inventory_items: active | archived
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

-- 4. inventory_checks: draft → in_progress → pending_approval → approved | rejected
ALTER TABLE public.inventory_checks
  ADD CONSTRAINT inventory_checks_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'in_progress'::text,
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text
    ]));

-- 5. inventory_check_approvals: pending → approved | rejected
--    (already has inv_check_approvals_rejected_needs_notes_chk, adding value constraint)
ALTER TABLE public.inventory_check_approvals
  ADD CONSTRAINT inventory_check_approvals_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

-- 6. inventory_check_assignments: pending → completed
ALTER TABLE public.inventory_check_assignments
  ADD CONSTRAINT inventory_check_assignments_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text]));

-- 7. stock_adjustments: pending_approval → approved | rejected
ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_status_check
    CHECK (status = ANY (ARRAY[
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text
    ]));

-- 8. payment_sessions: open → completed | expired | cancelled
ALTER TABLE public.payment_sessions
  ADD CONSTRAINT payment_sessions_status_check
    CHECK (status = ANY (ARRAY[
      'open'::text,
      'completed'::text,
      'expired'::text,
      'cancelled'::text
    ]));

COMMIT;
