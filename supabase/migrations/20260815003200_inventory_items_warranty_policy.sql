-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 3
--
-- Adds inventory_items.warranty_policy_id — the per-item override that
-- beats the category chain in get_effective_warranty_policy() (Task 4).
--
-- Nullable: NULL means "no override — use the category chain (or nothing
-- if the whole chain is empty)". ON DELETE SET NULL for the same reason
-- as Task 2 (policies are ON DELETE RESTRICT from warranty_records, so
-- deletion is rare; falling back to the category chain is the safe move).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS warranty_policy_id uuid
  REFERENCES public.warranty_policies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inventory_items.warranty_policy_id IS
  'Per-item warranty policy override. NULL = inherit from category chain via get_effective_warranty_policy().';

CREATE INDEX IF NOT EXISTS idx_inventory_items_warranty_policy
  ON public.inventory_items(warranty_policy_id)
  WHERE warranty_policy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
