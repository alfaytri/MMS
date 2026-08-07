-- Wide audit HIGH #2 — close the invoiceSync.ts client bypass.
--
-- The old client-side flow (src/lib/invoiceSync.ts) did:
--   1. .from('invoice_line_items').delete().eq('invoice_id', ...)
--   2. .from('invoice_line_items').insert(...)
--   3. .from('so_invoices').update({ totals, needs_refresh })
-- as three separate auto-committed calls. A failure between #1 and #2
-- left the invoice with zero lines. It also numbered new invoices via
-- COUNT(*)+1, which races under concurrent confirms and produces
-- duplicate INV-XXXXX. And every write ran with the caller's RLS,
-- with no server-side check that SO status was actually 'confirmed'.
--
-- This RPC replaces the client logic. FOR UPDATE lock on the existing
-- invoice (or advisory lock during numbering), all writes in one tx.
-- Returns the invoice id + display id + a 'created'/'updated'/'noop'
-- verb so the hook layer can decide what caches to invalidate.
--
-- Preserved from the client shim:
--   • INV-XXXXX numbering scheme (distinct from generate_invoice_from_so's
--     SO-XXXXX-I scheme which is used for the explicit "Issue Invoice"
--     action; INV-XXXXX is the auto-created draft that lives until then).
--   • needs_refresh flip when an existing invoice was already
--     partially_paid or overdue.
--   • No-op on existing paid invoice.
--   • No-op when SO status is not 'confirmed' AND no existing invoice.

CREATE OR REPLACE FUNCTION public.rpc_sync_invoice_from_so(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so                RECORD;
  v_invoice           RECORD;
  v_total             numeric;
  v_needs_refresh     boolean;
  v_new_inv_id        uuid;
  v_new_inv_display   text;
  v_last_num          int;
  v_invoice_type      text;
BEGIN
  SELECT so.id, so.so_number, so.status, so.customer_id, so.division_id,
         CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type
    INTO v_so
    FROM sale_orders so
    JOIN customers c ON c.id = so.customer_id
   WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_sync_invoice_from_so: SO % not found', p_so_id;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_total
    FROM sale_order_lines
   WHERE sale_order_id = p_so_id;

  -- Look for an existing non-paid invoice (auto-draft flow only handles
  -- the pre-issue draft; a paid invoice is off-limits for this path).
  SELECT id, payment_status
    INTO v_invoice
    FROM so_invoices
   WHERE sale_order_id = p_so_id
     AND payment_status <> 'paid'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_needs_refresh := v_invoice.payment_status IN ('partially_paid', 'overdue');

    -- Rebuild lines atomically (delete + insert both under this tx).
    DELETE FROM invoice_line_items WHERE invoice_id = v_invoice.id;

    INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
    SELECT v_invoice.id, sol.item_name, sol.qty, sol.unit_price, sol.total
      FROM sale_order_lines sol
     WHERE sol.sale_order_id = p_so_id;

    UPDATE so_invoices
       SET total_amount   = v_total,
           subtotal       = v_total,
           needs_refresh  = v_needs_refresh
     WHERE id = v_invoice.id;

    RETURN jsonb_build_object(
      'action',      'updated',
      'invoice_id',  v_invoice.id
    );
  END IF;

  -- No existing invoice — only auto-create on confirmed SOs.
  IF v_so.status <> 'confirmed' THEN
    RETURN jsonb_build_object('action', 'noop', 'reason', 'so_not_confirmed');
  END IF;

  -- Advisory lock serialises the max-based INV numbering.
  PERFORM pg_advisory_xact_lock(hashtext('inv_serial'));

  SELECT COALESCE(MAX((substring(invoice_id from 5))::int), 0)
    INTO v_last_num
    FROM so_invoices
   WHERE invoice_id ILIKE 'INV-%';
  v_new_inv_display := 'INV-' || LPAD((v_last_num + 1)::text, 5, '0');

  v_invoice_type := v_so.customer_type;  -- 'cash' | 'credit'

  INSERT INTO so_invoices (
    invoice_id, customer_id, division_id, sale_order_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_new_inv_display,
    v_so.customer_id,
    v_so.division_id,
    p_so_id,
    v_invoice_type::public.invoice_type,
    'draft',
    'unpaid'::public.invoice_payment_status,
    false,
    v_total, v_total,
    CURRENT_DATE,
    CASE v_invoice_type WHEN 'cash' THEN CURRENT_DATE ELSE CURRENT_DATE + 30 END,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id INTO v_new_inv_id;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
    FROM sale_order_lines sol
   WHERE sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'action',           'created',
    'invoice_id',       v_new_inv_id,
    'invoice_display',  v_new_inv_display
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_sync_invoice_from_so(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_sync_invoice_from_so(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_sync_invoice_from_so(uuid) IS
'Atomic replacement for src/lib/invoiceSync.ts. Rebuilds invoice_line_items
under a FOR UPDATE lock on the existing invoice (if any) or auto-creates
a fresh INV-XXXXX draft when the SO is confirmed. Numbering uses
advisory-lock + MAX pattern — collision-safe. No-ops on paid invoices
and on unconfirmed SOs with no existing invoice.';
