-- Diagnostic hardening for the tool-serial triggers.
--
-- User reported the same "receival_id uuid vs text" error persisting after
-- the 20260724250001 cast fix. Wrap the entire trigger body in an
-- outer EXCEPTION handler so no matter what fails inside, the receival
-- flow itself is never blocked. Errors during unit creation are logged
-- to activity_log so we can see them without crashing user actions.
--
-- If the receival now succeeds cleanly, the error was coming from inside
-- this trigger. If it still fails, the error is elsewhere.

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
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ii.sku, ic.type::text
    INTO v_item_id, v_item_sku, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  IF v_category IS NULL OR v_category <> 'tools' THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || v_item_id::text));

  BEGIN
    v_receival_id := NEW.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_receival_id := NULL;
  END;

  IF v_receival_id IS NOT NULL THEN
    SELECT ri.id INTO v_ri_id
    FROM receival_items ri
    WHERE ri.receival_id = v_receival_id
      AND ri.brand_variant_id = NEW.brand_variant_id
    LIMIT 1;
  END IF;

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
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand
    ) VALUES (
      v_item_id, v_ri_id, v_serial, true, 'available', 'Good', 'Default'
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let this trigger fail the receival. Log the error so we can
  -- diagnose without blocking business flow.
  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Tool Unit Auto-Create Failed',
    'inventory',
    'brand_variant',
    NEW.brand_variant_id,
    'system',
    'warning',
    jsonb_build_object(
      'sqlstate',      SQLSTATE,
      'sqlerrm',       SQLERRM,
      'receival_id',   NEW.receival_id,
      'brand_variant', NEW.brand_variant_id,
      'qty',           NEW.qty
    )::text
  );
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
  IF OLD.source_type <> 'receival' THEN RETURN OLD; END IF;

  BEGIN
    v_receival_id := OLD.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN OLD;
  END;

  IF v_receival_id IS NULL THEN RETURN OLD; END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = v_receival_id
    AND ri.brand_variant_id = OLD.brand_variant_id
  LIMIT 1;

  IF v_ri_id IS NULL THEN RETURN OLD; END IF;

  DELETE FROM tool_asset_units
  WHERE receival_item_id = v_ri_id
    AND is_placeholder    = true;

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
