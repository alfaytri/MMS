-- Rename inventory_brand_variants → inventory_item_brand_variants. The
-- longer name matches the hierarchy: inventory_categories → inventory_items
-- → inventory_item_brand_variants. Old name looked like it belonged to a
-- separate "brand_variants" module.
--
-- Same pattern as profiles → user_data: ALTER TABLE RENAME carries FKs,
-- indexes, and RLS. A backward-compat updatable view called
-- inventory_brand_variants keeps existing plpgsql functions working
-- without a body rewrite. All frontend refs migrate to the new name in
-- the same PR.

BEGIN;

ALTER TABLE public.inventory_brand_variants RENAME TO inventory_item_brand_variants;

CREATE OR REPLACE VIEW public.inventory_brand_variants AS
SELECT * FROM public.inventory_item_brand_variants;

COMMENT ON VIEW public.inventory_brand_variants IS
  'DEPRECATED — compatibility view for legacy RPCs and older frontend code. Use public.inventory_item_brand_variants directly for new code.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_brand_variants TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
