-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 2
--
-- Adds inventory_categories.default_warranty_policy_id — the category-level
-- default that the effective-policy resolver (Task 4) walks up parent_id
-- to find. Nullable: NULL means "inherit from parent category, or no
-- warranty if the whole chain is empty".
--
-- ON DELETE SET NULL: if a policy is deleted (rare — policies are ON DELETE
-- RESTRICT from warranty_records, so they can't be deleted while any
-- coverage exists), the category simply falls back to its parent chain.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.inventory_categories
  ADD COLUMN IF NOT EXISTS default_warranty_policy_id uuid
  REFERENCES public.warranty_policies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inventory_categories.default_warranty_policy_id IS
  'Category-level default warranty policy. NULL = inherit from parent category via get_effective_warranty_policy().';

CREATE INDEX IF NOT EXISTS idx_inventory_categories_default_warranty_policy
  ON public.inventory_categories(default_warranty_policy_id)
  WHERE default_warranty_policy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
