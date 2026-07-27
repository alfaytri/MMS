-- ============================================================
-- Section 1.11 — drop inventory_categories.description
--
-- Added by 20260704180000 as "internal notes". User's call: not
-- worth the extra Textarea slot in the category dialog — category
-- name and type communicate its purpose fine on their own.
-- ============================================================

ALTER TABLE public.inventory_categories
  DROP COLUMN IF EXISTS description;

NOTIFY pgrst, 'reload schema';
