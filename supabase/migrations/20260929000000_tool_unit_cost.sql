-- ─── Serialized tool unit cost ─────────────────────────────────────────────
-- Serialized tools are tracked one row per physical unit in tool_asset_units,
-- but the unit carried no cost. Add a nullable per-unit acquisition cost, and
-- auto-populate it from the receival FIFO layer's landed per-unit cost when a
-- unit is created on receival, so PO-received tools carry their real cost.
-- Existing units are backfilled (best-effort) from their receival line's cost.

alter table public.tool_asset_units
  add column if not exists unit_cost numeric;

comment on column public.tool_asset_units.unit_cost is
  'Per-unit acquisition cost of this serialized tool. Auto-set from the receival FIFO layer landed cost on receival; editable in the tool unit dialog.';

-- Recreate the receival auto-create trigger fn to stamp unit_cost from the FIFO
-- layer (landed total per unit, falling back to base unit_cost). Body is
-- byte-identical to the live definition except for the v_unit_cost declaration
-- and its use in the INSERT.
create or replace function public.create_tool_units_on_receival_layer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_item_id     uuid;
  v_category    text;
  v_mode        text;
  v_ri_id       uuid;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  v_receival_id uuid;
  v_unit_cost   numeric := COALESCE(NEW.total_unit_cost, NEW.unit_cost);
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
  -- "pending serial" and disables assignment until confirmed. unit_cost carries
  -- the layer's landed per-unit cost so each unit knows what it cost.
  FOR i IN 1..v_qty LOOP
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand, unit_cost
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default', v_unit_cost
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
$function$;

-- Best-effort backfill: units created from a receival inherit the receival
-- line's unit cost (only where not already set).
update public.tool_asset_units u
set unit_cost = ri.unit_cost
from public.receival_items ri
where u.receival_item_id = ri.id
  and u.unit_cost is null
  and ri.unit_cost is not null;
