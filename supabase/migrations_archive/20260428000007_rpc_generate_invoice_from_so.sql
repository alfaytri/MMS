-- supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql
-- Atomically generates an AR invoice from a delivered Sale Order.
-- Guards:
--   - SO must be partial_delivery or delivered (not confirmed/quotation)
--   - No AR invoice may already exist for this SO
-- Numbering is serialised with pg_advisory_xact_lock to prevent duplicates.

BEGIN;

CREATE OR REPLACE FUNCTION generate_invoice_from_so(p_so_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_so              RECORD;
  v_inv_count       INTEGER;
  v_invoice_id_str  TEXT;
  v_invoice_type    TEXT;
  v_issued_date     DATE;
  v_due_date        DATE;
  v_new_inv_id      UUID;
  v_new_inv_str     TEXT;
BEGIN
  -- Serialize invoice numbering across all sessions.
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  -- Guard: no AR invoice already linked to this SO.
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE  sale_order_id = p_so_id AND direction = 'ar'
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  -- Fetch SO + customer_type. Must be at a delivery stage.
  SELECT
    so.id,
    so.so_number,
    so.status,
    so.customer_id,
    so.subtotal,
    COALESCE(so.tax, 0)              AS tax,
    so.total                         AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_deliverable';
  END IF;

  -- Compute next invoice number (serialised by advisory lock above).
  SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
  v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');

  -- Derive invoice type and due date from customer type.
  v_invoice_type := v_so.customer_type;          -- 'cash' or 'credit'
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE          -- pay immediately
    ELSE             CURRENT_DATE + 30     -- net-30 for credit
  END;

  -- Insert invoice row.
  INSERT INTO invoices (
    invoice_id,
    customer_id,
    direction,
    sale_order_id,
    invoice_type,
    doc_status,
    status,
    payment_status,
    needs_refresh,
    total_amount,
    subtotal,
    tax,
    issued_date,
    due_date,
    source,
    source_id,
    source_label
  ) VALUES (
    v_invoice_id_str,
    v_so.customer_id,
    'ar',
    p_so_id,
    v_invoice_type,
    'draft',
    'draft',
    'unpaid',
    false,
    v_so.total_amount,
    v_so.subtotal,
    v_so.tax,
    v_issued_date,
    v_due_date,
    'order',
    p_so_id::text,
    'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  -- Insert one line item per sale_order_line.
  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT
    v_new_inv_id,
    sol.item_name,
    sol.qty,
    sol.unit_price,
    sol.total
  FROM sale_order_lines sol
  WHERE sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invoice_from_so(UUID) TO authenticated;

COMMIT;
