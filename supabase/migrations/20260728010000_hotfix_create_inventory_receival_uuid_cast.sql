-- Hotfix: remove the stale `::text` cast on `fifo_cost_layers.receival_id`
-- inside `create_inventory_receival`.
--
-- Symptom: UI showed "Failed to create receival" for every add-new-stock
-- and carve-from-stock attempt.
--
-- Root cause: the RPC does
--   INSERT INTO fifo_cost_layers (..., receival_id, ...) VALUES (
--     ..., v_new_receival.id::text, ...
--   )
-- fifo_cost_layers.receival_id is `uuid` (was retyped from text at some
-- point) — the explicit ::text cast turns the uuid into text, and
-- Postgres rejects the implicit text→uuid coercion on the target column
-- with 42804 "column is of type uuid but expression is of type text".
--
-- Fix: rewrite the function via pg_get_functiondef + regex_replace (same
-- pattern as 20260725110005 and 20260727090000) to strip the two stale
-- `v_new_receival.id::text` casts. No semantic change beyond dropping the
-- broken cast — the receival id is already uuid, so a plain reference is
-- what fifo_cost_layers wants.

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
  v_new := replace(v_def, 'v_new_receival.id::text', 'v_new_receival.id');

  IF v_new = v_def THEN
    RAISE NOTICE 'No change needed — cast not present';
  ELSE
    EXECUTE v_new;
    RAISE NOTICE 'Rewrote create_inventory_receival';
  END IF;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
