-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 4
--
-- get_effective_warranty_policy(p_item_id uuid) — resolves the warranty
-- policy that applies to an item, using confirmed precedence:
--
--   1. inventory_items.warranty_policy_id   ← per-item override wins
--   2. Nearest ancestor category with a policy (walk parent_id from the
--      item's own category up toward the root; first hit stops)
--   3. NULL                                 ← no warranty anywhere in
--                                             the chain
--
-- Implementation: a recursive CTE ordered by depth ASC, LIMIT 1 on the
-- first non-null default_warranty_policy_id. SECURITY INVOKER so the RLS
-- of the caller applies to the underlying reads (categories/items are
-- readable by all authenticated users, so this is effectively free —
-- but keeping invoker means no privilege escalation surprises later).
--
-- STABLE: same input → same output within a statement; safe to call
-- multiple times from a trigger or view.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.get_effective_warranty_policy(p_item_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE item AS (
    SELECT warranty_policy_id, category_id
    FROM public.inventory_items
    WHERE id = p_item_id
  ),
  -- Walk the category chain from the item's own category up toward the
  -- root. depth 0 = leaf. First row with a non-null default_warranty_policy_id
  -- (ordered by depth ASC) is the answer.
  category_chain AS (
    SELECT
      ic.id,
      ic.parent_id,
      ic.default_warranty_policy_id,
      0 AS depth
    FROM public.inventory_categories ic
    WHERE ic.id = (SELECT category_id FROM item)

    UNION ALL

    SELECT
      parent.id,
      parent.parent_id,
      parent.default_warranty_policy_id,
      child.depth + 1
    FROM public.inventory_categories parent
    JOIN category_chain child ON child.parent_id = parent.id
  ),
  category_hit AS (
    SELECT default_warranty_policy_id
    FROM category_chain
    WHERE default_warranty_policy_id IS NOT NULL
    ORDER BY depth ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT warranty_policy_id FROM item),
    (SELECT default_warranty_policy_id FROM category_hit)
  );
$$;

COMMENT ON FUNCTION public.get_effective_warranty_policy(uuid) IS
  'Resolves the warranty policy for an item. Precedence: item override > nearest ancestor category > NULL. Recursive CTE walks inventory_categories.parent_id, first non-null default wins.';

GRANT EXECUTE ON FUNCTION public.get_effective_warranty_policy(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
