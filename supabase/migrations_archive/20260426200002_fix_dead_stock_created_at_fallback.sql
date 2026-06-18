-- supabase/migrations/20260426200002_fix_dead_stock_created_at_fallback.sql
-- Variants inserted manually (no PO receival) have no stock movements and no
-- FIFO layers. Fall back to ibv.created_at so they read as "Active" on day 0
-- instead of hitting the 999 sentinel and showing as "Dead Stock".

BEGIN;

CREATE OR REPLACE FUNCTION get_dead_stock_report()
RETURNS TABLE (
  brand_variant_id     uuid,
  item_name            text,
  category_name        text,
  brand                text,
  sku                  text,
  stock_level          numeric,
  average_cost         numeric,
  total_value          numeric,
  last_movement_date   timestamptz,
  last_movement_source text,
  days_idle            int,
  status               text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  latest_movements AS (
    SELECT brand_variant_id, MAX(created_at) AS last_movement_at
    FROM   inventory_stock_movements
    GROUP  BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
    FROM   fifo_cost_layers
    WHERE  remaining_qty > 0
    GROUP  BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                      AS brand_variant_id,
      ii.name_en                                                  AS item_name,
      ic.name_en                                                  AS category_name,
      ibv.brand,
      ibv.code                                                    AS sku,
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                              AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)            AS total_value,
      -- Priority: last movement → oldest FIFO layer → variant created_at
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz,
               ibv.created_at)                                   AS last_movement_date,
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
    FROM       inventory_brand_variants ibv
    JOIN       inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  latest_movements         lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo              of ON of.brand_variant_id = ibv.id
    WHERE ibv.stock_level > 0
  )
  SELECT
    brand_variant_id,
    item_name,
    category_name,
    brand,
    sku,
    stock_level,
    average_cost,
    total_value,
    last_movement_date,
    last_movement_source,
    days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$$;

GRANT EXECUTE ON FUNCTION get_dead_stock_report() TO authenticated;

COMMIT;
