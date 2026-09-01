-- 20261034000000_batchG_l2_restore_reserved_qty.sql  (audit L2)
--
-- L2: complete_delivery_inventory consumes the reservation
-- (inventory_item_brand_variants.reserved_qty -= qty_delivered), but
-- cancel_delivery_inventory restores stock_level and reverses the SO's
-- delivered_qty WITHOUT restoring reserved_qty. So after voiding a delivery the
-- order's stock reads as un-reserved/available even though the order still needs
-- it. No money impact — reservation/availability only. Restore reserved_qty in the
-- same per-line loop that already reverses delivered_qty.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.cancel_delivery_inventory'::regproc) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'cancel_delivery_inventory not found'; END IF;
  IF v_def ~ 'reserved_qty = reserved_qty \+ v_line\.qty_delivered' THEN
    RAISE NOTICE 'L2 already restores reserved_qty — skip';
    RETURN;
  END IF;

  v_new := regexp_replace(v_def,
    '(AND  item_name = v_line\.item_name\s+ORDER  BY id\s+LIMIT  1\s*\);\s*END IF;)(\s*END LOOP;)',
    '\1' || E'\n\n      IF v_line.brand_variant_id IS NOT NULL THEN\n        UPDATE inventory_item_brand_variants\n           SET reserved_qty = reserved_qty + v_line.qty_delivered, updated_at = now()\n         WHERE id = v_line.brand_variant_id;\n      END IF;' || '\2',
    'g');

  IF v_new !~ 'reserved_qty = reserved_qty \+ v_line\.qty_delivered' THEN
    RAISE EXCEPTION 'L2: edit did not land — aborting';
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'L2: cancel_delivery_inventory now restores reserved_qty';
END
$do$;

NOTIFY pgrst, 'reload schema';
