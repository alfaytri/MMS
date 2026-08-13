-- H11 (six-domains checklist): receive_transfer does not decrement
-- stock_level for shrinkage.
--
-- Design: dispatch calls deduct_fifo_layers with is_transfer=TRUE, which
-- explicitly SKIPS the stock_level decrement (items in transit remain
-- counted on the source variant). On receive, destination FIFO layers
-- are created for received_qty. But when qty_received < qty_dispatched
-- (shrinkage), the missing units are absent from FIFO but stock_level
-- was never touched — so each transfer with shrinkage inflates the
-- variant-level stock_level counter forever.
--
-- Effect: ATP badges on CascadeInventorySelector, ItemRow,
-- BrandVariantRow, and dead-stock reports all read stock_level, so
-- every transfer with shrinkage silently overstates on-hand.
--
-- Fix: inside the per-item receive block, after all movements are
-- processed, decrement stock_level by v_total_shrinkage when it's > 0.
-- Splice via POSITION+SUBSTRING against the double-END-LOOP anchor
-- (avoids re-pasting 5KB of function verbatim).

DO $migrate$
DECLARE
  v_body   text;
  v_marker text := chr(10) || '    END LOOP;' || chr(10) || '  END LOOP;';
  v_inject text := chr(10) || '    END LOOP;' || chr(10)
                   || chr(10)
                   || '    -- H11 fix: shrinkage never reached stock_level.' || chr(10)
                   || '    -- Dispatch skipped the decrement (in-transit); received' || chr(10)
                   || '    -- portion doesn''t bring it back automatically.' || chr(10)
                   || '    IF v_total_shrinkage > 0 THEN' || chr(10)
                   || '      UPDATE public.inventory_item_brand_variants' || chr(10)
                   || '         SET stock_level = GREATEST(stock_level - v_total_shrinkage, 0),' || chr(10)
                   || '             updated_at  = now()' || chr(10)
                   || '       WHERE id = v_item.brand_variant_id;' || chr(10)
                   || '    END IF;' || chr(10)
                   || '  END LOOP;';
  v_pos    int;
  v_oid    oid;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'receive_transfer';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'receive_transfer not found';
  END IF;

  v_body := pg_get_functiondef(v_oid);

  IF position('H11 fix' in v_body) > 0 THEN
    RAISE NOTICE 'receive_transfer already carries H11 fix — skipping';
    RETURN;
  END IF;

  v_pos := position(v_marker in v_body);
  IF v_pos = 0 THEN
    RAISE EXCEPTION 'receive_transfer: END-LOOP anchor not found (body may have changed shape)';
  END IF;

  v_body := substring(v_body from 1 for v_pos - 1)
         || v_inject
         || substring(v_body from v_pos + length(v_marker));

  EXECUTE v_body;
END $migrate$;

-- Verify H11 marker is present in the live body.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'receive_transfer'
       AND pg_get_functiondef(p.oid) LIKE '%H11 fix%'
  ) THEN
    RAISE EXCEPTION 'H11: receive_transfer patch did not land';
  END IF;
END $verify$;
