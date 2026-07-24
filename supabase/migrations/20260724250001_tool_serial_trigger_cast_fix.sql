-- Hotfix for 20260724250000_tool_serial_tracking_schema_and_trigger.sql
--
-- fifo_cost_layers.receival_id is TEXT (stores the UUID as text for
-- legacy reasons), while receival_items.receival_id is UUID. The trigger
-- joined them directly and blew up with:
--   column "receival_id" is of type uuid but expression is of type text
--
-- Fix: cast NEW.receival_id::uuid in both trigger bodies. Also guard
-- against a NULL or non-uuid value so the trigger can never crash a
-- receival approval.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id     uuid;
  v_item_sku    text;
  v_category    text;
  v_ri_id       uuid;
  v_next_ord    int;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  v_receival_id uuid;
  i             int;
  v_serial      text;
BEGIN
  IF NEW.source_type <> 'receival' THEN
    RETURN NEW;
  END IF;

  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT ii.id, ii.sku, ic.type::text
    INTO v_item_id, v_item_sku, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  IF v_category IS NULL OR v_category <> 'tools' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || v_item_id::text));

  -- Cast text→uuid safely. If the receival_id column somehow holds an
  -- invalid uuid, skip unit creation instead of crashing the receival.
  BEGIN
    v_receival_id := NEW.receival_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_receival_id := NULL;
  END;

  IF v_receival_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = v_receival_id
    AND ri.brand_variant_id = NEW.brand_variant_id
  LIMIT 1;

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_item_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = v_item_id
    AND serial_number ~ ('^' || v_item_sku || '-\d+$');

  FOR i IN 1..v_qty LOOP
    v_serial := v_item_sku || '-' || LPAD((v_next_ord + i)::text, 3, '0');
    INSERT INTO tool_asset_units (
      item_id,
      receival_item_id,
      serial_number,
      is_placeholder,
      status,
      condition,
      brand
    ) VALUES (
      v_item_id,
      v_ri_id,
      v_serial,
      true,
      'available',
      'Good',
      'Default'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_tool_placeholders_on_layer_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ri_id       uuid;
  v_receival_id uuid;
BEGIN
  IF OLD.source_type <> 'receival' THEN
    RETURN OLD;
  END IF;

  BEGIN
    v_receival_id := OLD.receival_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN OLD;
  END;

  IF v_receival_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = v_receival_id
    AND ri.brand_variant_id = OLD.brand_variant_id
  LIMIT 1;

  IF v_ri_id IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM tool_asset_units
  WHERE receival_item_id = v_ri_id
    AND is_placeholder    = true;

  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
