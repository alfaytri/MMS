-- Second-round fix: the previous rewrite selected `id` from
-- get_effective_attributes(), but that function's RETURNS TABLE names the
-- column `definition_id` (not `id`). The SELECT INTO worked fine when it
-- was skipped (leaf categories with ≤ 1 candidate), but for a parent
-- category with multiple candidates it ran and errored with "column id
-- does not exist" — surfaced as HTTP 400 from PostgREST.
--
-- Fix: use the correct column name. No other behavior change.
CREATE OR REPLACE FUNCTION public.rpc_attribute_picker_step(
  p_category_id  uuid,
  p_picks        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE
  v_result           jsonb;
  v_candidate_ids    uuid[];
  v_next_def_id      uuid;
  v_next_def_key     text;
  v_next_def_label_en text;
  v_next_def_label_ar text;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id FROM inventory_categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM inventory_categories c JOIN subtree s ON c.parent_id = s.id
  ),
  ancestors AS (
    SELECT c.parent_id AS ancestor_id, 1 AS depth
    FROM inventory_categories c WHERE c.id = p_category_id
    UNION ALL
    SELECT c.parent_id, a.depth + 1
    FROM inventory_categories c JOIN ancestors a ON c.id = a.ancestor_id
    WHERE a.depth < 10 AND c.parent_id IS NOT NULL
  ),
  relevant_categories AS (
    SELECT id FROM subtree
    UNION
    SELECT ancestor_id FROM ancestors WHERE ancestor_id IS NOT NULL
  ),
  base_items AS (
    SELECT i.id FROM inventory_items i WHERE i.category_id IN (SELECT id FROM subtree)
  ),
  matching_items AS (
    SELECT bi.id
    FROM base_items bi
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p_picks) pick(k, v)
      JOIN inventory_attribute_definitions def
        ON def.attribute_key = pick.k
       AND def.category_id IN (SELECT id FROM relevant_categories)
      JOIN inventory_item_attributes ia
        ON ia.item_id = bi.id
       AND ia.definition_id = def.id
      WHERE ia.option_id::text <> pick.v
    )
  )
  SELECT array_agg(id) INTO v_candidate_ids FROM matching_items;

  IF v_candidate_ids IS NULL THEN v_candidate_ids := ARRAY[]::uuid[]; END IF;

  IF COALESCE(array_length(v_candidate_ids, 1), 0) > 1 THEN
    -- get_effective_attributes returns the column as `definition_id`, not `id`.
    SELECT definition_id, attribute_key, label_en, label_ar
    INTO v_next_def_id, v_next_def_key, v_next_def_label_en, v_next_def_label_ar
    FROM get_effective_attributes(p_category_id)
    WHERE NOT (p_picks ? attribute_key)
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name_en', i.name_en,
        'name_ar', i.name_ar,
        'sku', i.sku,
        'image_url', i.image_url,
        'brand_variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', bv.id,
            'brand', bv.brand,
            'code', bv.code,
            'stock_level', bv.stock_level
          ) ORDER BY bv.brand)
          FROM inventory_item_brand_variants bv
          WHERE bv.item_id = i.id AND bv.status = 'active'
        ), '[]'::jsonb)
      ) ORDER BY i.name_en)
      FROM inventory_items i
      WHERE i.id = ANY(v_candidate_ids)
    ), '[]'::jsonb),
    'next_attribute', CASE WHEN v_next_def_id IS NOT NULL THEN jsonb_build_object(
      'id', v_next_def_id,
      'key', v_next_def_key,
      'label_en', v_next_def_label_en,
      'label_ar', v_next_def_label_ar
    ) ELSE null END,
    'next_options', CASE WHEN v_next_def_id IS NULL THEN '[]'::jsonb ELSE (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'value_en', o.value_en,
        'value_ar', o.value_ar,
        'item_count', (
          SELECT count(*) FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
      ) ORDER BY o.sort_order), '[]'::jsonb)
      FROM inventory_attribute_options o
      WHERE o.definition_id = v_next_def_id
        AND NOT o.is_archived
        AND EXISTS (
          SELECT 1 FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
    ) END
  );

  RETURN v_result;
END;
$$;
