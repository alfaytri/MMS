-- Division-scope the dead-stock report. Previously get_dead_stock_report() took
-- no args and reported every variant's denormalized stock_level (all divisions),
-- ignoring the top-bar division filter. Add an optional p_division_ids: when set,
-- on-hand qty + value are computed from fifo_cost_layers via sub_container →
-- division (so only variants with stock in the selected division(s) appear, at
-- the division's real quantity/value); when NULL, behaviour is unchanged.
--
-- Signature changes (no-arg → one optional arg), so drop the old function first
-- to avoid an overload ambiguity. Body otherwise sourced from the live definition.

DROP FUNCTION IF EXISTS public.get_dead_stock_report();

CREATE OR REPLACE FUNCTION public.get_dead_stock_report(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(brand_variant_id uuid, item_name text, category_name text, brand text, sku text, stock_level numeric, average_cost numeric, total_value numeric, last_movement_date timestamp with time zone, last_movement_source text, days_idle integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  div_stock AS (
    -- On-hand for the selected division(s), from FIFO layers by sub-container.
    SELECT fcl.brand_variant_id,
           SUM(fcl.remaining_qty)::numeric                       AS qty,
           SUM(fcl.remaining_qty::numeric * fcl.total_unit_cost) AS value
      FROM fifo_cost_layers fcl
      JOIN warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
     WHERE p_division_ids IS NOT NULL
       AND fcl.remaining_qty > 0
       AND sc.division_id = ANY(p_division_ids)
     GROUP BY fcl.brand_variant_id
  ),
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
      CASE WHEN p_division_ids IS NULL THEN ibv.stock_level
           ELSE ds.qty END                                        AS stock_level,
      CASE WHEN p_division_ids IS NULL THEN COALESCE(ibv.average_cost, 0)
           ELSE COALESCE(ds.value / NULLIF(ds.qty, 0), 0) END     AS average_cost,
      CASE WHEN p_division_ids IS NULL THEN ibv.stock_level * COALESCE(ibv.average_cost, 0)
           ELSE COALESCE(ds.value, 0) END                         AS total_value,
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
    FROM       public.inventory_item_brand_variants ibv
    JOIN       public.inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  public.inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  public.brands                   b  ON b.id  = ibv.brand_id
    LEFT JOIN  latest_movements                lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo                     of ON of.brand_variant_id = ibv.id
    LEFT JOIN  div_stock                       ds ON ds.brand_variant_id = ibv.id
    WHERE (p_division_ids IS NULL     AND ibv.stock_level > 0)
       OR (p_division_ids IS NOT NULL AND ds.qty > 0)
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
$function$;

-- Recreating the function reset its grants to the default (EXECUTE to PUBLIC).
-- Restore the authenticated-only posture from the 2026-09-26 SECDEF audit.
REVOKE EXECUTE ON FUNCTION public.get_dead_stock_report(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dead_stock_report(uuid[]) TO authenticated, service_role;
