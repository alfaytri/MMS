-- Inventory Brands & Origin — Task 4: RLS lockdown + catalog/pricing permissions,
-- pricing column guard, transactional archive/sort RPCs, photos-bucket lockdown,
-- and seed grants.
--
-- Live-DB facts verified before authoring (supabase db query --linked, 2026-08-08):
--   * Existing OPEN policies replaced (exact live names):
--       inventory_categories:            "Internal users can manage inventory_categories" (ALL, true/true)
--       inventory_items:                 "Internal users can manage inventory_items" (ALL, true/true)
--       inventory_item_brand_variants:   "Internal users can manage inventory_brand_variants" (ALL, true/true)
--       brands:                          "Internal users can read/insert/update/delete brands" (4 granular)
--     RLS already ENABLED on all four (relrowsecurity = true).
--   * Photos bucket 'inventory-item-photos' write policies (live names):
--       inventory_item_photos_insert / _update / _delete (authenticated, bucket-only, no perm gate).
--       No SELECT policy exists (public read) — left untouched per spec §4.4.
--   * Pricing columns on inventory_item_brand_variants: cost_price, selling_price ONLY.
--       margin_percent DOES NOT EXIST (removed by 20260708214900_remove_markup_and_margin.sql);
--       gating it would make the trigger fail at runtime on every variant UPDATE. NOT gated.
--       average_cost / stock_level are system-computed by receival/FIFO RPCs — intentionally NOT gated.
--   * Helpers _user_has_permission(uuid,text) + _current_user_data_id() exist, SECURITY DEFINER,
--       executable by authenticated.
--   * custom_roles.permissions is text[]; seed-grant targets is_system_admin roles + owner/admin/administrator.

BEGIN;

-- ============================================================
-- 1. Catalog RLS: SELECT-open + INSERT/UPDATE/DELETE gated on inventory.catalog.manage
-- ============================================================

-- inventory_categories
DROP POLICY IF EXISTS "Internal users can manage inventory_categories" ON public.inventory_categories;
CREATE POLICY inv_cat_select ON public.inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_cat_ins ON public.inventory_categories FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_cat_upd ON public.inventory_categories FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_cat_del ON public.inventory_categories FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- inventory_items
DROP POLICY IF EXISTS "Internal users can manage inventory_items" ON public.inventory_items;
CREATE POLICY inv_item_select ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_item_ins ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_item_upd ON public.inventory_items FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_item_del ON public.inventory_items FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- inventory_item_brand_variants
DROP POLICY IF EXISTS "Internal users can manage inventory_brand_variants" ON public.inventory_item_brand_variants;
CREATE POLICY inv_var_select ON public.inventory_item_brand_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_var_ins ON public.inventory_item_brand_variants FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_var_upd ON public.inventory_item_brand_variants FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_var_del ON public.inventory_item_brand_variants FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- brands (shared master; spec §4.1 gates it under inventory.catalog.manage)
DROP POLICY IF EXISTS "Internal users can read brands" ON public.brands;
DROP POLICY IF EXISTS "Internal users can insert brands" ON public.brands;
DROP POLICY IF EXISTS "Internal users can update brands" ON public.brands;
DROP POLICY IF EXISTS "Internal users can delete brands" ON public.brands;
CREATE POLICY inv_brand_select ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_brand_ins ON public.brands FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_brand_upd ON public.brands FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_brand_del ON public.brands FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- ============================================================
-- 2. Pricing column guard (cost_price / selling_price only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.inventory_pricing_guard_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.cost_price    IS DISTINCT FROM OLD.cost_price
   OR NEW.selling_price IS DISTINCT FROM OLD.selling_price)
   AND NOT public._user_has_permission(public._current_user_data_id(),'inventory.pricing.manage')
  THEN
    RAISE EXCEPTION 'Permission denied: inventory.pricing.manage required to change prices'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS inventory_pricing_guard_trg ON public.inventory_item_brand_variants;
CREATE TRIGGER inventory_pricing_guard_trg BEFORE UPDATE ON public.inventory_item_brand_variants
  FOR EACH ROW EXECUTE FUNCTION public.inventory_pricing_guard_fn();

-- ============================================================
-- 3. Transactional archive cascade RPC (replaces 3 client round-trips)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_category(p_category_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  UPDATE public.inventory_item_brand_variants v SET status='archived'
    WHERE v.item_id IN (SELECT id FROM public.inventory_items WHERE category_id = p_category_id);
  UPDATE public.inventory_items SET status='archived' WHERE category_id = p_category_id;
  UPDATE public.inventory_categories SET status='archived' WHERE id = p_category_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.rpc_archive_inventory_category(uuid) TO authenticated;

-- ============================================================
-- 4. Single-call sort-order update RPC (replaces N parallel PATCHes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_update_inventory_sort_orders(p_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_updates) AS x(table_name text, id uuid, sort_order int) LOOP
    IF r.table_name = 'inventory_categories' THEN
      UPDATE public.inventory_categories SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_items' THEN
      UPDATE public.inventory_items SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_item_brand_variants' THEN
      UPDATE public.inventory_item_brand_variants SET sort_order = r.sort_order WHERE id = r.id;
    END IF;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.rpc_update_inventory_sort_orders(jsonb) TO authenticated;

-- ============================================================
-- 5. Photos bucket lockdown: gate write ops on inventory.catalog.manage (SELECT stays open)
-- ============================================================
DROP POLICY IF EXISTS inventory_item_photos_insert ON storage.objects;
DROP POLICY IF EXISTS inventory_item_photos_update ON storage.objects;
DROP POLICY IF EXISTS inventory_item_photos_delete ON storage.objects;
CREATE POLICY inventory_item_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-item-photos'
    AND public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inventory_item_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory-item-photos'
    AND public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (bucket_id = 'inventory-item-photos'
    AND public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inventory_item_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-item-photos'
    AND public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- ============================================================
-- 6. Seed grants: give system-admin / owner roles the new perms (avoid lockout)
-- ============================================================
UPDATE public.custom_roles
  SET permissions = (SELECT array(SELECT DISTINCT unnest(
        COALESCE(permissions, ARRAY[]::text[]) ||
        ARRAY['inventory.catalog.view','inventory.catalog.manage','inventory.pricing.manage'])))
  WHERE is_system_admin = true OR lower(name) IN ('owner','admin','administrator');

COMMIT;
NOTIFY pgrst, 'reload schema';
