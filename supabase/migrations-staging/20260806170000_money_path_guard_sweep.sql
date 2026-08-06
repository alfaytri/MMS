-- Money-path guard sweep: closes H4, H7, H10, H11, H15 in one migration.
-- H14 is a hook-only fix (see src/hooks/useCustomerPayments.ts in same
-- commit).
--
-- Each block is bounded and self-contained — this is not a "one big
-- refactor" migration. Each guard is defense-in-depth for a specific
-- exploit / correctness gap flagged in the money-path review.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- H4: PO return dispatch — cap qty against receival_items.qty_received
-- ═══════════════════════════════════════════════════════════════════════
-- Before: rpc_process_po_return_dispatch trusted return_lines.qty and
-- called deduct_fifo_layers scoped only by (bv, warehouse, sub_container).
-- Two concurrent submits of qty=5 on a 5-unit receival could drain 10
-- units from FIFO, spilling into other suppliers' layers.
--
-- Fix: per-line, FOR-UPDATE-lock the receival_item and RAISE when
-- SUM(prior returns still active) + this qty > qty_received.

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return              RECORD;
  v_line                RECORD;
  v_bv_id               UUID;
  v_line_warehouse_id   UUID;
  v_line_sub_container  UUID;
  v_layer               RECORD;
  v_recv_qty            INT;
  v_prior_returned      INT;
BEGIN
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, receival_item_id
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_item_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_line.receival_item_id IS NULL THEN
      RAISE EXCEPTION 'PO return line % has no receival_item_id link; cannot derive source warehouse / sub-container.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.a. Cancel and re-issue through the current PO-return dialog.';
    END IF;

    -- H4 guard: lock the receival_item row and reject over-return.
    -- Sums prior *active* returns (excluding this return and any cancelled
    -- ones — cancelled returns must not burn returnable qty; see H3).
    SELECT ri.qty_received
      INTO v_recv_qty
      FROM public.receival_items ri
     WHERE ri.id = v_line.receival_item_id
     FOR UPDATE;

    SELECT COALESCE(SUM(rl.qty), 0)
      INTO v_prior_returned
      FROM public.return_lines rl
      JOIN public.so_po_returns spr ON spr.id = rl.return_id
     WHERE rl.receival_item_id = v_line.receival_item_id
       AND rl.return_id <> p_return_id
       AND spr.deleted_at IS NULL
       AND spr.status IN ('dispatched', 'supplier_confirmed', 'closed');

    IF v_prior_returned + v_line.qty > v_recv_qty THEN
      RAISE EXCEPTION 'PO return over-limit on receival item %: attempted % + prior % > qty_received %',
        v_line.receival_item_id, v_line.qty, v_prior_returned, v_recv_qty
        USING HINT = 'Reduce this return qty or cancel a prior return.';
    END IF;

    SELECT r.warehouse_id, ri.sub_container_id
    INTO   v_line_warehouse_id, v_line_sub_container
    FROM   public.receival_items ri
    LEFT JOIN public.receivals r ON r.id = ri.receival_id
    WHERE  ri.id = v_line.receival_item_id;

    IF v_line_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no warehouse_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival header before re-dispatching this return.';
    END IF;

    IF v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no sub_container_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival before re-dispatching this return.';
    END IF;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_bv_id,
        v_line_warehouse_id,
        v_line.qty,
        false,
        v_line_sub_container
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, source_id, notes
      ) VALUES (
        v_line_warehouse_id,
        v_line_sub_container,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        v_layer.layer_id,
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_process_po_return_dispatch(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- H7: block landed_cost.voided_at when applied_at IS NOT NULL
-- ═══════════════════════════════════════════════════════════════════════
-- Since H8 was dropped (Revert Apply UI removed, LCs are permanent post-
-- apply), the guard simplifies to: an applied LC can NEVER be voided.
-- Client UI hides the Void button after apply, but any authenticated
-- user hitting the REST endpoint could still flip voided_at because RLS
-- is USING(true).

CREATE OR REPLACE FUNCTION public._landed_costs_block_void_after_apply()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.applied_at IS NOT NULL
     AND (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Landed cost % has been applied (%); cannot void.',
      OLD.id, OLD.applied_at
      USING HINT = 'Applied LCs are permanent — the Revert UI was removed as an ops decision.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_landed_costs_block_void_after_apply ON public.landed_costs;
CREATE TRIGGER trg_landed_costs_block_void_after_apply
BEFORE UPDATE ON public.landed_costs
FOR EACH ROW
EXECUTE FUNCTION public._landed_costs_block_void_after_apply();


-- ═══════════════════════════════════════════════════════════════════════
-- H10: create_inventory_receival carve — reject cross-sub-container
-- ═══════════════════════════════════════════════════════════════════════
-- A carve receival re-slices an existing FIFO layer within the SAME
-- sub-container. Silently allowing the destination sub-container to
-- differ from the source layer's sub-container means quantity leaves
-- the source pile with no offsetting movement — the source pile's
-- ledger shows zero net movement while stock is gone. Operators must
-- use a warehouse transfer to move stock between sub-containers.

-- Fetch the live create_inventory_receival body from pg_proc, inject
-- the cross-sub-container guard right after the source-layer brand
-- variant check, and re-execute. This preserves every other side-effect
-- the RPC does (FIFO layer insert, ISM insert, stock level bump,
-- receival header + item inserts, source-layer decrement).
DO $H10$
DECLARE
  v_def   text;
  v_new   text;
BEGIN
  SELECT pg_get_functiondef(oid)
    INTO v_def
    FROM pg_proc
   WHERE proname = 'create_inventory_receival'
     AND pronamespace = 'public'::regnamespace
   ORDER BY oid DESC
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'create_inventory_receival not found — skipping H10 patch (already patched or renamed).';
    RETURN;
  END IF;

  -- Skip if already patched
  IF v_def LIKE '%Carve cannot move stock across sub-containers%' THEN
    RAISE NOTICE 'create_inventory_receival already carries the H10 guard — skipping.';
    RETURN;
  END IF;

  -- Inject the guard right after the source layer's brand_variant check.
  -- Match on the specific RAISE text present in the existing RPC.
  v_new := regexp_replace(
    v_def,
    '(IF v_source_layer\.brand_variant_id <> p_brand_variant_id THEN\s+RAISE EXCEPTION[^;]+;\s+END IF;)',
    E'\\1\n\n    -- H10 guard: carve must stay within the source layer''s sub-container.\n    IF v_source_layer.sub_container_id IS DISTINCT FROM v_sub_container_id THEN\n      RAISE EXCEPTION ''Carve cannot move stock across sub-containers (source layer sub-container % ≠ destination %). Use a warehouse transfer instead.'',\n        v_source_layer.sub_container_id, v_sub_container_id\n        USING ERRCODE = ''22023'';\n    END IF;\n',
    'g'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'H10 patch pattern did not match — create_inventory_receival source-layer block may have been reshaped. Skipping to avoid corrupting the RPC.';
    RETURN;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'H10 guard injected into create_inventory_receival';
END $H10$;


-- ═══════════════════════════════════════════════════════════════════════
-- H11: payment over-allocate guard (BEFORE INSERT trigger)
-- ═══════════════════════════════════════════════════════════════════════
-- Before: no cap on payment.amount vs invoice.total_amount. QAR 500
-- payment on a QAR 100 invoice → paid_amount=500 on the invoice, customer
-- statement shows outstanding = −400.
--
-- Fix: BEFORE INSERT trigger on payments enforcing
-- SUM(existing incoming + new) ≤ so_invoices.total_amount when
-- invoice_id IS NOT NULL. Store-credit / CN redemptions already go
-- through rpc_redeem_credit_note which has its own cap — this trigger
-- is a belt-and-braces for direct-payment inserts.

CREATE OR REPLACE FUNCTION public._payments_cap_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv_total   numeric;
  v_prior_paid  numeric;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'incoming' OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT total_amount INTO v_inv_total
    FROM so_invoices
   WHERE id = NEW.invoice_id;
  IF v_inv_total IS NULL THEN
    RETURN NEW;  -- no invoice or zero total; nothing to enforce
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_prior_paid
    FROM payments
   WHERE invoice_id = NEW.invoice_id
     AND direction = 'incoming'
     AND deleted_at IS NULL;

  -- 1 fils tolerance for FP rounding on cent-level splits.
  IF v_prior_paid + NEW.amount > v_inv_total + 0.01 THEN
    RAISE EXCEPTION 'Payment over-allocation: amount % + prior paid % exceeds invoice total %',
      NEW.amount, v_prior_paid, v_inv_total
      USING HINT = 'Reduce the payment amount or detach an existing payment first.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_cap_invoice_paid ON public.payments;
CREATE TRIGGER trg_payments_cap_invoice_paid
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public._payments_cap_invoice_paid();


-- ═══════════════════════════════════════════════════════════════════════
-- H15: complete_delivery_inventory + follow-up stub in one transaction
-- ═══════════════════════════════════════════════════════════════════════
-- Before: useCompleteDelivery called complete_delivery_inventory (which
-- committed FIFO + COGS + movements). Only after that did the client run
-- 4 sequential calls to create the follow-up delivery stub. Any failure
-- there left inventory deducted with no stub for the remaining items.
--
-- Fix: new wrapper RPC that runs the FIFO commit + follow-up stub in
-- one transaction. Client switches to the wrapper for partial-delivery
-- flows.

CREATE OR REPLACE FUNCTION public.rpc_complete_delivery_with_followup(
  p_delivery_id      uuid,
  p_so_id            uuid,
  p_sub_container_id uuid    DEFAULT NULL,
  p_remaining_items  jsonb   DEFAULT NULL
)
RETURNS uuid   -- id of new follow-up delivery (NULL if no remaining items)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_delivery_id   uuid;
  v_delivery_number   text;
  v_orig_so_id        uuid;
  v_item              jsonb;
BEGIN
  -- 1. Deduct FIFO + write COGS + movements + mark delivered
  PERFORM public.complete_delivery_inventory(
    p_delivery_id      => p_delivery_id,
    p_so_id            => p_so_id,
    p_sub_container_id => p_sub_container_id
  );

  IF p_remaining_items IS NULL OR jsonb_array_length(p_remaining_items) = 0 THEN
    RETURN NULL;
  END IF;

  -- 2. Look up parent SO from the original delivery, generate a new
  --    delivery number, and create the follow-up stub + lines in the
  --    same transaction.
  SELECT sale_order_id INTO v_orig_so_id
    FROM sale_deliveries
   WHERE id = p_delivery_id;
  IF v_orig_so_id IS NULL THEN
    RAISE EXCEPTION 'rpc_complete_delivery_with_followup: original delivery % has no sale_order_id', p_delivery_id;
  END IF;

  v_delivery_number := public.next_delivery_number();

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id, warehouse_id, date, status
  ) VALUES (
    v_delivery_number,
    v_orig_so_id,
    NULL,                                -- follow-up stub has no assigned warehouse yet
    CURRENT_DATE,
    'pending'
  )
  RETURNING id INTO v_new_delivery_id;

  FOR v_item IN SELECT jsonb_array_elements(p_remaining_items) LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_delivery_id,
      NULLIF(v_item->>'brand_variant_id', '')::uuid,
      v_item->>'item_name',
      v_item->>'sku',
      COALESCE((v_item->>'qty_delivered')::int, 0)
    );
  END LOOP;

  RETURN v_new_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_complete_delivery_with_followup(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_complete_delivery_with_followup(uuid, uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_complete_delivery_with_followup(uuid, uuid, uuid, jsonb) IS
'Complete a delivery and create the follow-up partial-delivery stub in
one transaction. Wraps complete_delivery_inventory (unchanged) plus the
stub insert. Before this RPC the two ran across two tx boundaries and
a failure between them could leave inventory deducted with no stub.';

COMMIT;
