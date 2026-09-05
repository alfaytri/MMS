-- Inventory catalog: guarded hard-DELETE for category/item/variant, and add a
-- "zero quantity" guard to ARCHIVE at all three levels.
--
-- Rules (per operator):
--   * Archive OR Delete require the branch to hold NO stock (on-hand + reserved
--     + damaged + incoming = 0 across the whole subtree).
--   * Delete additionally requires the branch to have NEVER transacted — enforced
--     by the DB's own FK constraints (fifo_cost_layers / cogs_entries / movements
--     / order lines are RESTRICT/NO-ACTION). We attempt the delete and translate
--     a foreign_key_violation into "Archive it instead".
-- All gated on inventory.catalog.edit (via _user_can_edit_catalog), matching the
-- existing archive RPC + RLS delete policies.
BEGIN;

-- ── Shared: total stock "presence" units for a set of variants ────────────────
-- Any non-zero across stock_level/reserved/damaged/incoming counts as "has stock".
CREATE OR REPLACE FUNCTION public._inv_variant_stock_units(p_variant_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(ABS(stock_level),0) + COALESCE(ABS(reserved_qty),0)
       + COALESCE(ABS(damaged_qty),0) + COALESCE(ABS(incoming),0)
  FROM public.inventory_item_brand_variants WHERE id = p_variant_id
$$;

CREATE OR REPLACE FUNCTION public._inv_item_stock_units(p_item_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(COALESCE(ABS(stock_level),0) + COALESCE(ABS(reserved_qty),0)
       + COALESCE(ABS(damaged_qty),0) + COALESCE(ABS(incoming),0)),0)
  FROM public.inventory_item_brand_variants WHERE item_id = p_item_id
$$;

CREATE OR REPLACE FUNCTION public._inv_category_stock_units(p_category_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE subcats AS (
    SELECT id FROM public.inventory_categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM public.inventory_categories c JOIN subcats s ON c.parent_id = s.id
  )
  SELECT COALESCE(SUM(COALESCE(ABS(v.stock_level),0) + COALESCE(ABS(v.reserved_qty),0)
       + COALESCE(ABS(v.damaged_qty),0) + COALESCE(ABS(v.incoming),0)),0)
  FROM public.inventory_item_brand_variants v
  JOIN public.inventory_items i ON i.id = v.item_id
  WHERE i.category_id IN (SELECT id FROM subcats)
$$;

REVOKE ALL ON FUNCTION public._inv_variant_stock_units(uuid), public._inv_item_stock_units(uuid), public._inv_category_stock_units(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._inv_variant_stock_units(uuid), public._inv_item_stock_units(uuid), public._inv_category_stock_units(uuid) TO authenticated;

-- ── ARCHIVE: add the zero-qty guard ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_category(p_category_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_units numeric; v_name text;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT name_en INTO v_name FROM public.inventory_categories WHERE id = p_category_id;
  v_units := public._inv_category_stock_units(p_category_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot archive "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', COALESCE(v_name,'category'), v_units USING ERRCODE='P0001';
  END IF;
  UPDATE public.inventory_item_brand_variants v SET status='archived'
    WHERE v.item_id IN (SELECT id FROM public.inventory_items WHERE category_id = p_category_id);
  UPDATE public.inventory_items SET status='archived' WHERE category_id = p_category_id;
  UPDATE public.inventory_categories SET status='archived' WHERE id = p_category_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_item(p_item_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_units numeric; v_name text;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT name_en INTO v_name FROM public.inventory_items WHERE id = p_item_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Item % not found', p_item_id USING ERRCODE='P0002'; END IF;
  v_units := public._inv_item_stock_units(p_item_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot archive "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', v_name, v_units USING ERRCODE='P0001';
  END IF;
  UPDATE public.inventory_items SET status='archived' WHERE id = p_item_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_variant(p_variant_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_units numeric; v_name text;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT brand INTO v_name FROM public.inventory_item_brand_variants WHERE id = p_variant_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Variant % not found', p_variant_id USING ERRCODE='P0002'; END IF;
  v_units := public._inv_variant_stock_units(p_variant_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot archive "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', v_name, v_units USING ERRCODE='P0001';
  END IF;
  UPDATE public.inventory_item_brand_variants SET status='archived' WHERE id = p_variant_id;
END; $function$;

-- ── DELETE: zero-qty + never-transacted (FK-enforced) ────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_inventory_variant(p_variant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_units numeric; v_name text;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT brand INTO v_name FROM public.inventory_item_brand_variants WHERE id = p_variant_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Variant % not found', p_variant_id USING ERRCODE='P0002'; END IF;
  v_units := public._inv_variant_stock_units(p_variant_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', v_name, v_units USING ERRCODE='P0001';
  END IF;
  BEGIN
    DELETE FROM public.inventory_item_brand_variants WHERE id = p_variant_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete "%": it has transaction history (stock movements, orders, or cost layers). Archive it instead.', v_name USING ERRCODE='P0001';
  END;
  RETURN jsonb_build_object('deleted', true, 'name', v_name);
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_inventory_item(p_item_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_units numeric; v_name text;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT name_en INTO v_name FROM public.inventory_items WHERE id = p_item_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Item % not found', p_item_id USING ERRCODE='P0002'; END IF;
  v_units := public._inv_item_stock_units(p_item_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', v_name, v_units USING ERRCODE='P0001';
  END IF;
  BEGIN
    -- inventory_item_brand_variants.item_id is ON DELETE CASCADE, so empty
    -- variants go with the item; a variant with cost/movement history RESTRICTs.
    DELETE FROM public.inventory_items WHERE id = p_item_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete "%": it (or a variant) has transaction history. Archive it instead.', v_name USING ERRCODE='P0001';
  END;
  RETURN jsonb_build_object('deleted', true, 'name', v_name);
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_inventory_category(p_category_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_name text; v_child_cats int; v_child_items int; v_units numeric;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.edit required' USING ERRCODE='42501';
  END IF;
  SELECT name_en INTO v_name FROM public.inventory_categories WHERE id = p_category_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Category % not found', p_category_id USING ERRCODE='P0002'; END IF;

  v_units := public._inv_category_stock_units(p_category_id);
  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it still holds % unit(s) of stock. Bring the quantity to zero first.', v_name, v_units USING ERRCODE='P0001';
  END IF;

  SELECT count(*) INTO v_child_cats  FROM public.inventory_categories WHERE parent_id  = p_category_id;
  SELECT count(*) INTO v_child_items FROM public.inventory_items      WHERE category_id = p_category_id;
  IF v_child_cats > 0 OR v_child_items > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": it still contains % sub-categor(y/ies) and % item(s). Remove or delete those first.', v_name, v_child_cats, v_child_items USING ERRCODE='P0001';
  END IF;

  BEGIN
    DELETE FROM public.inventory_categories WHERE id = p_category_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete "%": it is still referenced by other records. Archive it instead.', v_name USING ERRCODE='P0001';
  END;
  RETURN jsonb_build_object('deleted', true, 'name', v_name);
END; $function$;

-- Grants (edit-gated inside; expose to authenticated only).
REVOKE ALL ON FUNCTION
  public.rpc_archive_inventory_item(uuid), public.rpc_archive_inventory_variant(uuid),
  public.rpc_delete_inventory_category(uuid), public.rpc_delete_inventory_item(uuid),
  public.rpc_delete_inventory_variant(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_archive_inventory_item(uuid), public.rpc_archive_inventory_variant(uuid),
  public.rpc_delete_inventory_category(uuid), public.rpc_delete_inventory_item(uuid),
  public.rpc_delete_inventory_variant(uuid)
TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
