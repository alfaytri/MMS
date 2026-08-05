-- Hotfix 2 for create_inventory_receival: cast v_movement_type to
-- stock_movement_type at the stock-movement insert.
--
-- Previous hotfix (20260728010000) fixed step 3 (fifo layer insert)
-- which was masking a second column-type drift at step 8:
--   INSERT INTO inventory_stock_movements (..., movement_type, ...)
--   VALUES (..., v_movement_type, ...)
-- v_movement_type is DECLAREd as text, but the target column is the
-- native enum `stock_movement_type`. Postgres refuses the implicit
-- text→enum coercion with 42804.
--
-- Fix: add explicit ::stock_movement_type cast at the insert site. The
-- DECLARE stays as text (fewer touch points, safer regex).

BEGIN;

DO $rewrite$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid
    INTO v_oid
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'create_inventory_receival';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'create_inventory_receival not found';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Anchor on the surrounding context so this only matches at the
  -- INSERT VALUES site, not the DECLARE or the assignments.
  v_new := replace(
    v_def,
    'v_movement_type, v_movement_qty, p_unit_cost,',
    'v_movement_type::stock_movement_type, v_movement_qty, p_unit_cost,'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'No change needed — expression not present';
  ELSE
    EXECUTE v_new;
    RAISE NOTICE 'Rewrote create_inventory_receival (movement_type enum cast)';
  END IF;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
