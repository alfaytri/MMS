-- Phase 2 "Cancel & Return everything": the finalize tail for a SHIPPED SO.
-- Called after a cancels_sale_order return has restocked all delivered stock.
-- Mirrors the Phase-1 cancel money path (void invoice + refund CN for amount
-- paid) and cancels the SO — the return already handled stock + COGS reversal.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_finalize_shipped_so_cancel(p_so_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_so         sale_orders%ROWTYPE;
  v_ret_id     uuid;
  v_ret_number text;
  v_shortfall  int;
  v_money      jsonb;
BEGIN
  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_finalize_shipped_so_cancel: SO % not found', p_so_id USING ERRCODE = 'P0002';
  END IF;
  IF v_so.status = 'cancelled' THEN
    RETURN jsonb_build_object('action','noop','reason','already_cancelled');
  END IF;

  -- 1) Require a restocked cancel-return as the vehicle (implies shipped +
  --    inspection completed, since rpc_process_return_restock sets restocked_at
  --    only after good/damaged is settled).
  SELECT id, return_number INTO v_ret_id, v_ret_number
    FROM so_po_returns
   WHERE source_type = 'sale_order'
     AND source_id   = p_so_id
     AND cancels_sale_order = true
     AND restocked_at IS NOT NULL
     AND deleted_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_ret_id IS NULL THEN
    RAISE EXCEPTION 'rpc_finalize_shipped_so_cancel: SO % has no restocked cancel-return yet', v_so.so_number
      USING ERRCODE = '42501';
  END IF;

  -- 2) Everything-returned guard: every DELIVERED unit must be covered by returns
  --    (good + damaged, across all non-cancelled returns). Uses all-condition
  --    return_lines — NOT net_delivered_qty, which excludes damaged returns.
  SELECT count(*) INTO v_shortfall
  FROM (
    SELECT sdl.id, sdl.qty_delivered,
           COALESCE((
             SELECT SUM(rl.qty)
               FROM return_lines rl
               JOIN so_po_returns r ON r.id = rl.return_id
              WHERE rl.sale_delivery_line_id = sdl.id
                AND r.status <> 'cancelled'
                AND r.deleted_at IS NULL
           ), 0) AS returned_qty
      FROM sale_delivery_lines sdl
      JOIN sale_deliveries sd ON sd.id = sdl.sale_delivery_id
     WHERE sd.sale_order_id = p_so_id
       AND sd.status = 'delivered'
  ) t
  WHERE t.qty_delivered > t.returned_qty;

  IF v_shortfall > 0 THEN
    RAISE EXCEPTION 'rpc_finalize_shipped_so_cancel: SO % not fully returned — % delivery line(s) still have outstanding qty', v_so.so_number, v_shortfall
      USING ERRCODE = '42501';
  END IF;

  -- 3) Money: same path as Phase-1 cancel — void invoice(s), refund CN for paid.
  v_money := public._void_invoice_and_open_refund_cn(p_so_id);

  -- 4) Cancel the SO (releases reserved stock via trg_so_reserved_qty).
  PERFORM set_config('app.allow_so_cancel','on',true);
  UPDATE sale_orders SET status = 'cancelled' WHERE id = p_so_id;

  RETURN jsonb_build_object(
    'action',        'cancelled',
    'return_number', v_ret_number
  ) || v_money;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_finalize_shipped_so_cancel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_shipped_so_cancel(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
