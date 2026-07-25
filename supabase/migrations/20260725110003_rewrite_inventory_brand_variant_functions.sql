-- Phase 3 of drop-compat-views: rewrite 8 inventory functions to reference
-- `inventory_item_brand_variants` directly instead of the compat view
-- `inventory_brand_variants`.
--
-- Method: fetch each function's live definition via pg_get_functiondef,
-- regexp_replace the identifier (word-boundary so we don't clobber unrelated
-- names), then re-execute. This preserves LANGUAGE, SECURITY DEFINER,
-- search_path, argument list, return type, and every trigger binding.
BEGIN;

DO $rewrite$
DECLARE
  v_target text;
  v_oid    oid;
  v_def    text;
  v_new    text;
  v_targets text[] := ARRAY[
    'batch_update_reserved_qty',
    'batch_update_variant_prices',
    'fn_refresh_incoming_qty',
    'fn_refresh_reserved_qty',
    'fn_update_linked_services_count',
    'recalc_average_cost',
    'update_reserved_qty',
    'create_tool_item_with_default_variant'
  ];
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    FOR v_oid IN
      SELECT p.oid
      FROM   pg_proc p
      JOIN   pg_namespace n ON n.oid = p.pronamespace
      WHERE  n.nspname = 'public'
        AND  p.proname = v_target
    LOOP
      v_def := pg_get_functiondef(v_oid);
      -- Word-boundary swap: only replace the standalone identifier.
      v_new := regexp_replace(
        v_def,
        '\minventory_brand_variants\M',
        'inventory_item_brand_variants',
        'g'
      );
      IF v_new IS DISTINCT FROM v_def THEN
        EXECUTE v_new;
        RAISE NOTICE 'Rewrote %', v_target;
      ELSE
        RAISE NOTICE 'No change needed for % (no old ref)', v_target;
      END IF;
    END LOOP;
  END LOOP;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
