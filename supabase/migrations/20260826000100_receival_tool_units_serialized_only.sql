-- 20260826000100_receival_tool_units_serialized_only.sql
-- Bulk tool categories run the qty/FIFO path (no asset units). Only SERIALIZED
-- tool categories spawn placeholder tool_asset_units on receival.
--
-- Rebased on the LIVE body of create_tool_units_on_receival_layer() (fetched
-- via pg_get_functiondef 2026-08-15), which had already drifted from the
-- 20260724250000 baseline migration: the live version inserts NULL-serial
-- placeholder rows (no SKU-based serial numbering / advisory lock) and wraps
-- the whole body in an exception handler that logs to activity_log instead
-- of failing the receival. Both of those behaviors are preserved verbatim
-- below — the ONLY change is adding v_mode and extending the skip condition.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id     uuid;
  v_category    text;
  v_mode        text;
  v_ri_id       uuid;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  v_receival_id uuid;
  i             int;
BEGIN
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ic.type::text, ic.tool_tracking_mode::text
    INTO v_item_id, v_category, v_mode
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  -- Only serialized tool categories create placeholder asset units. Non-tools
  -- and BULK tools fall through to the qty/FIFO machinery with no unit rows.
  IF v_category IS NULL OR v_category <> 'tools' OR v_mode <> 'serialized' THEN
    RETURN NEW;
  END IF;

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

  -- Insert v_qty placeholder rows with NULL serial. UI shows them as
  -- "pending serial" and disables assignment until confirmed.
  FOR i IN 1..v_qty LOOP
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default'
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let this trigger fail the receival — log and continue.
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

NOTIFY pgrst, 'reload schema';
COMMIT;
