-- Link inventory brand variants to the existing `public.brands` lookup table.
--
-- `public.brands` already exists in the baseline schema (used by
-- service_brands, brand_group_members, contract_services). Inventory kept its
-- own free-text `brand` column on `inventory_brand_variants` which drifted —
-- values like "FLARE NUT" ended up echoing the item family. This migration
-- reuses the existing brands table, adds a proper FK, backfills, and updates
-- the dead-stock RPC to read via the join.
--
-- The legacy `brand` text column stays for read-side backward compat (other
-- app code selects `inventory_brand_variants.brand` directly). A trigger keeps
-- it in sync with `brand_id` so writes only need to touch the FK.

-- ─── 1. Merge existing inventory brand text values into public.brands ─────────
-- Skip any that already exist in the brands table (case-insensitive match)

INSERT INTO public.brands (name)
SELECT DISTINCT TRIM(ibv.brand)
  FROM public.inventory_brand_variants ibv
 WHERE ibv.brand IS NOT NULL
   AND TRIM(ibv.brand) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.brands b
      WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(ibv.brand))
   );

-- ─── 2. Add brand_id FK on inventory_brand_variants ───────────────────────────

ALTER TABLE public.inventory_brand_variants
  ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX idx_inventory_brand_variants_brand_id
  ON public.inventory_brand_variants (brand_id);

-- Backfill brand_id via case-insensitive text match
UPDATE public.inventory_brand_variants ibv
   SET brand_id = b.id
  FROM public.brands b
 WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(ibv.brand))
   AND ibv.brand IS NOT NULL
   AND TRIM(ibv.brand) <> '';

-- ─── 3. Sync trigger — writes to brand_id keep brand text current ─────────────
-- Existing app reads select `inventory_brand_variants.brand` directly in many
-- places (WhAdjustmentsTab, ReceivalFormDialog, BillFormDialog, etc.). Rather
-- than refactor every read site, we keep the text column in sync so any legacy
-- read still returns the right value.

CREATE OR REPLACE FUNCTION public.sync_brand_variant_brand_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT name INTO NEW.brand FROM public.brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_brand_variants_brand_text
BEFORE INSERT OR UPDATE OF brand_id ON public.inventory_brand_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_brand_variant_brand_text();

-- ─── 4. Update get_dead_stock_report to prefer brand_id → brands.name ─────────

CREATE OR REPLACE FUNCTION public.get_dead_stock_report()
RETURNS TABLE(
  brand_variant_id     uuid,
  item_name            text,
  category_name        text,
  brand                text,
  sku                  text,
  stock_level          numeric,
  average_cost         numeric,
  total_value          numeric,
  last_movement_date   timestamp with time zone,
  last_movement_source text,
  days_idle            integer,
  status               text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
  latest_movements AS (
    SELECT brand_variant_id, MAX(created_at) AS last_movement_at
      FROM inventory_stock_movements
     GROUP BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
      FROM fifo_cost_layers
     WHERE remaining_qty > 0
     GROUP BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                      AS brand_variant_id,
      ii.name_en                                                  AS item_name,
      ic.name_en                                                  AS category_name,
      COALESCE(b.name, NULLIF(TRIM(ibv.brand), ''))               AS brand,
      ibv.code                                                    AS sku,
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                               AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)             AS total_value,
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz,
               ibv.created_at)                                    AS last_movement_date,
      CASE
        WHEN lm.last_movement_at  IS NOT NULL THEN 'movement'
        WHEN of.oldest_layer_date IS NOT NULL THEN 'fifo'
        WHEN ibv.created_at       IS NOT NULL THEN 'created'
        ELSE NULL
      END                                                         AS last_movement_source,
      EXTRACT(DAY FROM
        CURRENT_TIMESTAMP -
        COALESCE(lm.last_movement_at,
                 of.oldest_layer_date::timestamptz,
                 ibv.created_at)
      )::int                                                      AS days_idle
    FROM       public.inventory_brand_variants ibv
    JOIN       public.inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  public.inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  public.brands                   b  ON b.id  = ibv.brand_id
    LEFT JOIN  latest_movements                lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo                     of ON of.brand_variant_id = ibv.id
    WHERE ibv.stock_level > 0
  )
  SELECT
    brand_variant_id, item_name, category_name, brand, sku,
    stock_level, average_cost, total_value, last_movement_date,
    last_movement_source, days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$$;

-- ─── 5. Report migration outcome ──────────────────────────────────────────────

DO $$
DECLARE
  v_brands_count    INT;
  v_variants_total  INT;
  v_variants_linked INT;
BEGIN
  SELECT COUNT(*) INTO v_brands_count  FROM public.brands;
  SELECT COUNT(*) INTO v_variants_total FROM public.inventory_brand_variants;
  SELECT COUNT(*) INTO v_variants_linked
    FROM public.inventory_brand_variants WHERE brand_id IS NOT NULL;

  RAISE NOTICE 'Total brands (existing + merged): %', v_brands_count;
  RAISE NOTICE 'Variants total: %', v_variants_total;
  RAISE NOTICE 'Variants linked to a brand: %', v_variants_linked;
  RAISE NOTICE 'Variants without a brand: %', v_variants_total - v_variants_linked;
END $$;
