-- Tool serial tracking — Phase 1: schema + auto-placeholder trigger.
--
-- When a tool-category item is received via PO, a FIFO layer is created
-- but no tool_asset_units rows are inserted — someone has to manually
-- click "Add Unit" N times in master-data. That leaves stock_level and
-- unit count out of sync.
--
-- This migration:
--   1. Adds receival_item_id + is_placeholder columns to tool_asset_units
--   2. Adds a unique partial index on (item_id, serial_number)
--   3. Adds a trigger on fifo_cost_layers INSERT that auto-creates
--      placeholder units for tool-category items
--   4. Adds a matching AFTER DELETE trigger so cancelling a receival
--      removes only the still-placeholder units from that batch
--
-- Placeholders are marked is_placeholder=true and can be renamed to real
-- serials via master-data or the new assign_tool_serials RPC (Phase 2).
--
-- See docs/specs/2026-07-24-tool-serial-tracking-plan.md for the full plan.

BEGIN;

-- ─── 1. Schema additions ────────────────────────────────────────────────

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS receival_item_id uuid
    REFERENCES public.receival_items(id) ON DELETE SET NULL;

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tool_asset_units_receival_item
  ON public.tool_asset_units(receival_item_id);

CREATE INDEX IF NOT EXISTS idx_tool_asset_units_item_placeholder
  ON public.tool_asset_units(item_id, is_placeholder)
  WHERE is_placeholder = true;

-- Prevents duplicate real serials per item. Partial (allows multiple
-- NULLs) so master-data rows without a serial yet stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_asset_units_item_serial
  ON public.tool_asset_units(item_id, serial_number)
  WHERE serial_number IS NOT NULL;

-- ─── 2. Trigger fn: create placeholder units on receival layer insert ──

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
  i             int;
  v_serial      text;
BEGIN
  -- Only act on receival-sourced layers. Adjustment / sale_return layers
  -- also insert here but must not create tool units.
  IF NEW.source_type <> 'receival' THEN
    RETURN NEW;
  END IF;

  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- Follow brand_variant → item → category.type
  SELECT ii.id, ii.sku, ic.type::text
    INTO v_item_id, v_item_sku, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  -- Non-tool items: nothing to do
  IF v_category IS NULL OR v_category <> 'tools' THEN
    RETURN NEW;
  END IF;

  -- Serialize serial numbering per item (concurrent receivals for the
  -- same tool could otherwise pick the same ordinal).
  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || v_item_id::text));

  -- Find the receival_item row that produced this layer. FIFO layer has
  -- receival_id + brand_variant_id — that pair identifies exactly one
  -- receival_items row (bv is unique per receival).
  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = NEW.receival_id
    AND ri.brand_variant_id = NEW.brand_variant_id
  LIMIT 1;

  -- Next ordinal: max ordinal already used for this item, plus 1.
  -- Serials follow "<sku>-<3-digit-ordinal>" per 20260723260000. Any
  -- serial that doesn't match this pattern is ignored (manual entries
  -- with a manufacturer serial like "AB123" won't consume ordinals).
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_item_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = v_item_id
    AND serial_number ~ ('^' || v_item_sku || '-\d+$');

  -- Insert v_qty placeholder rows
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

DROP TRIGGER IF EXISTS trg_create_tool_units_on_receival ON public.fifo_cost_layers;

CREATE TRIGGER trg_create_tool_units_on_receival
AFTER INSERT ON public.fifo_cost_layers
FOR EACH ROW
EXECUTE FUNCTION public.create_tool_units_on_receival_layer();

-- ─── 3. Symmetric trigger: on layer delete, remove still-placeholder units ─
-- If a receival is cancelled/reversed and its FIFO layer is deleted,
-- clean up the placeholder units linked to that receival_item. Real
-- serials (is_placeholder=false) are LEFT ALONE — someone typed those in
-- and they represent physical units the ops team must handle manually.

CREATE OR REPLACE FUNCTION public.remove_tool_placeholders_on_layer_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ri_id uuid;
BEGIN
  IF OLD.source_type <> 'receival' THEN
    RETURN OLD;
  END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = OLD.receival_id
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

DROP TRIGGER IF EXISTS trg_remove_tool_placeholders_on_layer_delete ON public.fifo_cost_layers;

CREATE TRIGGER trg_remove_tool_placeholders_on_layer_delete
AFTER DELETE ON public.fifo_cost_layers
FOR EACH ROW
EXECUTE FUNCTION public.remove_tool_placeholders_on_layer_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;
