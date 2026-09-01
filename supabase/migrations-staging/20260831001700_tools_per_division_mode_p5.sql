-- 20260831001700_tools_per_division_mode_p5.sql
-- Tools Per-Division Tracking Mode — Phase 5 (receival routing + guards).
-- Spec: docs/plans/2026-08-30-tools-per-division-mode.md
--
-- Three changes, all in service of the qty-XOR-units invariant per (item,division):
--
--   1. create_tool_units_on_receival_layer() — route an incoming receival layer
--      to serial UNITS vs qty/FIFO by the EFFECTIVE mode of (item, receival's
--      division), not the category mode. Units spawned for a per-division
--      *override* carry that division_id so they are scoped to it; the shipped
--      category-serialized flow is left byte-for-byte unchanged (NULL division,
--      established on first team assign).
--
--   2. guard_item_division_tracking_mode_switch() — mirror of the category
--      switch guard, one level down: block flipping a (item,division) override
--      while that division still holds the OLD mode's stock (qty or units).
--
--   3. guard_tool_unit_serialized_division() — a serial unit may only belong to
--      a division where the tool is EFFECTIVELY serialized. Blocks manual
--      Add-Unit / transfer into a bulk (item,division). Verified 0 existing
--      violations before adding (2026-08-30).
--
-- Live bodies of the two rewritten/mirrored functions were fetched with
-- pg_get_functiondef before editing; enums (tool_status/tool_condition/
-- tool_tracking_mode) confirmed via pg_enum.
BEGIN;

-- ─── 1. Receival routing (per item,division) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id       uuid;
  v_category      text;
  v_effective     text;
  v_division_id   uuid;
  v_has_override  boolean;
  v_unit_division uuid;
  v_ri_id         uuid;
  v_qty           int := COALESCE(NEW.qty, 0)::int;
  v_receival_id   uuid;
  v_unit_cost     numeric := COALESCE(NEW.total_unit_cost, NEW.unit_cost);
  i               int;
BEGIN
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ic.type::text
    INTO v_item_id, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  -- The division this layer landed in (its sub-container's division). NULL when
  -- the sub-container is division-less — tool_effective_mode() then falls back
  -- to the category mode, i.e. exactly the pre-per-division behavior.
  SELECT sc.division_id INTO v_division_id
  FROM warehouse_sub_containers sc
  WHERE sc.id = NEW.sub_container_id;

  -- Route by EFFECTIVE mode of (item, this division). Non-tools and divisions
  -- where the tool is bulk fall through to the qty/FIFO machinery (no units).
  v_effective := public.tool_effective_mode(v_item_id, v_division_id)::text;
  IF v_category IS NULL OR v_category <> 'tools' OR v_effective <> 'serialized' THEN
    RETURN NEW;
  END IF;

  -- Scope the spawned units to the receival division ONLY when the serialization
  -- comes from an explicit per-(item,division) override. For a plain serialized
  -- CATEGORY (no override) keep the shipped behavior: NULL division, established
  -- on first team assign — zero change for existing serialized tools.
  SELECT (iid.tool_tracking_mode IS NOT NULL) INTO v_has_override
  FROM inventory_item_divisions iid
  WHERE iid.item_id = v_item_id AND iid.division_id = v_division_id
  LIMIT 1;
  v_unit_division := CASE
    WHEN v_has_override IS TRUE AND v_division_id IS NOT NULL THEN v_division_id
    ELSE NULL
  END;

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
      status, condition, brand, unit_cost, division_id
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default', v_unit_cost, v_unit_division
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

-- ─── 2. Per-(item,division) mode-switch guard ─────────────────────────────
-- Blocks flipping a (item,division) override while that division still holds the
-- old mode's stock. Compares EFFECTIVE modes (override ?? category) so a
-- NULL→value or value→value change that actually changes the effective mode is
-- caught, and a redundant override (set to the same value as the category) is
-- allowed through.
CREATE OR REPLACE FUNCTION public.guard_item_division_tracking_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat_mode public.tool_tracking_mode;
  v_old_eff  public.tool_tracking_mode;
  v_new_eff  public.tool_tracking_mode;
  v_units    int;
  v_qty      numeric;
BEGIN
  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM OLD.tool_tracking_mode THEN
    RETURN NEW;
  END IF;

  SELECT ic.tool_tracking_mode INTO v_cat_mode
  FROM inventory_items ii
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ii.id = NEW.item_id;

  v_old_eff := COALESCE(OLD.tool_tracking_mode, v_cat_mode);
  v_new_eff := COALESCE(NEW.tool_tracking_mode, v_cat_mode);
  IF v_old_eff IS NOT DISTINCT FROM v_new_eff THEN
    RETURN NEW;  -- effective mode unchanged
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  WHERE tau.item_id = NEW.item_id
    AND tau.division_id = NEW.division_id
    AND tau.status <> 'retired';

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_item_brand_variants bv
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  JOIN warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
  WHERE bv.item_id = NEW.item_id AND sc.division_id = NEW.division_id;

  IF v_units > 0 OR v_qty > 0 THEN
    RAISE EXCEPTION
      'Cannot switch this tool''s tracking mode in this division while it holds stock: % unit(s), % qty on hand. Empty the division first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_item_division_tracking_mode_switch ON public.inventory_item_divisions;
CREATE TRIGGER trg_guard_item_division_tracking_mode_switch
  BEFORE UPDATE ON public.inventory_item_divisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_division_tracking_mode_switch();

-- ─── 3. Serial-unit-in-serialized-division invariant ──────────────────────
-- A serial unit may only belong to a division where the tool is effectively
-- serialized. Fires only when a division is set and (on UPDATE) actually
-- changed, so status-only updates (assign/return) are untouched.
CREATE OR REPLACE FUNCTION public.guard_tool_unit_serialized_division()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_tool boolean;
  v_eff     public.tool_tracking_mode;
BEGIN
  IF NEW.division_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.division_id IS NOT DISTINCT FROM OLD.division_id THEN
    RETURN NEW;
  END IF;

  SELECT (ic.type = 'tools') INTO v_is_tool
  FROM inventory_items ii
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ii.id = NEW.item_id;
  IF v_is_tool IS NOT TRUE THEN RETURN NEW; END IF;

  v_eff := public.tool_effective_mode(NEW.item_id, NEW.division_id);
  IF v_eff = 'bulk' THEN
    RAISE EXCEPTION
      'A serial unit cannot belong to a division where this tool is tracked in bulk. Switch that division to serialized first, or leave the unit''s division unset.'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_tool_unit_serialized_division ON public.tool_asset_units;
CREATE TRIGGER trg_guard_tool_unit_serialized_division
  BEFORE INSERT OR UPDATE ON public.tool_asset_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_tool_unit_serialized_division();

NOTIFY pgrst, 'reload schema';
COMMIT;
