-- 20261143000000_cancel_voids_invoice_and_bill.sql  (full-build port of warehouse 20261134)
-- Requires 20261136 ('void' enum) + 20261137-142 (SO money-path) applied first.
-- Helper re-patched to set payment_status='void'; PO-cancel RPC; AR/AP report
-- patches exclude 'void' (also fixes mark_overdue_bills bills.status bug); heal.
-- rpc_sync_invoice_from_so patched on full-build's OWN body (it diverged: lacks the
-- warehouse invoice-discount fix, which is out of scope here).
BEGIN;

-- SO money helper: void every non-void invoice for the SO and, for any amount
-- already paid, open a settle-able standalone refund credit note. PATCH: also set
-- payment_status='void' so the voided invoice reads "Void" on every surface (not
-- just the invoices list) instead of lingering as "unpaid".
CREATE OR REPLACE FUNCTION public._void_invoice_and_open_refund_cn(p_so_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_so_number      text;
  v_inv            RECORD;
  v_paid           numeric := 0;
  v_cn_id          uuid    := NULL;
  v_cn_display     text    := NULL;
  v_invoice_voided boolean := false;
  v_invoice_no     text    := NULL;
  v_last_cn        int;
BEGIN
  SELECT so_number INTO v_so_number FROM sale_orders WHERE id = p_so_id;

  FOR v_inv IN
    SELECT id, invoice_id, total_amount, COALESCE(paid_amount,0) AS paid_amount, customer_id
      FROM so_invoices WHERE sale_order_id = p_so_id AND status <> 'void'
      FOR UPDATE
  LOOP
    UPDATE so_invoices
       SET status         = 'void',
           payment_status = 'void',
           notes  = TRIM(BOTH ' -' FROM COALESCE(notes,'') || ' - SO ' || v_so_number || ' cancelled')
     WHERE id = v_inv.id;
    v_invoice_voided := true;
    v_invoice_no     := v_inv.invoice_id;

    IF v_inv.paid_amount > 0 THEN
      v_paid := v_paid + v_inv.paid_amount;
      PERFORM pg_advisory_xact_lock(hashtext('cn_serial'));
      SELECT COALESCE(MAX((substring(credit_note_id from 4))::int),0) INTO v_last_cn
        FROM credit_notes WHERE credit_note_id ILIKE 'CN-%';
      v_cn_display := 'CN-' || LPAD((v_last_cn + 1)::text, 5, '0');

      INSERT INTO credit_notes (
        credit_note_id, invoice_id, customer_id, customer_name,
        total_amount, original_total, reason, status, source_return_id
      ) VALUES (
        v_cn_display, v_inv.id, v_inv.customer_id,
        (SELECT name FROM customers WHERE id = v_inv.customer_id),
        v_inv.paid_amount, v_inv.total_amount,
        'SO ' || v_so_number || ' cancelled - refund due', 'open', NULL
      ) RETURNING id INTO v_cn_id;

      INSERT INTO credit_note_lines (credit_note_id, description, qty, unit_price)
      VALUES (v_cn_id, 'Refund for cancelled SO ' || v_so_number, 1, v_inv.paid_amount);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_voided',        v_invoice_voided,
    'invoice_number',        v_invoice_no,
    'refund_credit_note_id', v_cn_id,
    'refund_credit_note',    v_cn_display,
    'refund_amount',         v_paid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._void_invoice_and_open_refund_cn(uuid) FROM public, anon, authenticated;

-- ---- rpc_sales_aging_report (void-aware, matches warehouse) ----
CREATE OR REPLACE FUNCTION public.rpc_sales_aging_report()
 RETURNS TABLE(customer_id uuid, customer_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, invoice_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    i.customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS invoice_count
  FROM so_invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.payment_status != 'paid'
    AND COALESCE(i.status::text, 'draft') NOT IN ('void', 'cancelled')
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$function$
;

-- ---- rpc_purchase_aging_report (void-aware, matches warehouse) ----
CREATE OR REPLACE FUNCTION public.rpc_purchase_aging_report()
 RETURNS TABLE(supplier_id uuid, supplier_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    b.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN b.due_date >= CURRENT_DATE THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE - 90 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_over_90,
    COALESCE(SUM((b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM bills b
  JOIN suppliers s ON s.id = b.supplier_id
  WHERE b.payment_status NOT IN ('paid', 'void')
    AND b.total_amount - b.paid_amount > 0
  GROUP BY b.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$function$
;

-- ---- rpc_financial_dashboard (void-aware, matches warehouse) ----
CREATE OR REPLACE FUNCTION public.rpc_financial_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;

  receivables_total          numeric;
  receivables_overdue        numeric;
  receivables_overdue_count  bigint;

  payables_total             numeric;
  payables_overdue           numeric;
  payables_overdue_count     bigint;

  cash_in_this_month         numeric;
  cash_out_this_month        numeric;
  cash_in_last_month         numeric;
  cash_out_last_month        numeric;

  invoiced_this_month        numeric;
  billed_this_month          numeric;

  monthly_trend              jsonb;
  top_overdue_customers      jsonb;
  top_overdue_suppliers      jsonb;

  v_month_start              date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_last_month_start         date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date;
BEGIN
  -- AR receivables from so_invoices
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM so_invoices
  WHERE payment_status != 'paid'
    AND COALESCE(status::text, 'draft') NOT IN ('void', 'cancelled')
    AND total_amount - paid_amount > 0;

  -- AP payables from bills
  SELECT
    COALESCE(SUM((total_amount - paid_amount) * public._bill_qar_factor(id)), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN (total_amount - paid_amount) * public._bill_qar_factor(id) END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM bills
  WHERE payment_status NOT IN ('paid', 'void')
    AND total_amount - paid_amount > 0;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_this_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_this_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_last_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_last_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  -- Invoiced this month from so_invoices (AR)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO invoiced_this_month
  FROM so_invoices
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  -- Billed this month from bills (AP)
  SELECT COALESCE(SUM(total_amount * public._bill_qar_factor(id)), 0)
  INTO billed_this_month
  FROM bills
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM so_invoices
        WHERE DATE_TRUNC('month', issued_date) = m.month
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount * public._bill_qar_factor(id)) FROM bills
        WHERE DATE_TRUNC('month', issued_date) = m.month
      ), 0) AS billed,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'incoming'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS collected,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'outgoing'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS paid_out
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_customers
  FROM (
    SELECT
      c.id,
      c.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      COUNT(*) AS invoice_count,
      MIN(i.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(i.due_date))::int AS days_overdue
    FROM so_invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND COALESCE(i.status::text, 'draft') NOT IN ('void', 'cancelled')
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.id,
      s.name,
      SUM((b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)) AS amount,
      COUNT(*) AS bill_count,
      MIN(b.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(b.due_date))::int AS days_overdue
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.due_date < CURRENT_DATE
      AND b.payment_status NOT IN ('paid', 'void')
      AND b.total_amount - b.paid_amount > 0
    GROUP BY s.id, s.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'receivables', jsonb_build_object(
      'total', receivables_total,
      'overdue', receivables_overdue,
      'overdue_count', receivables_overdue_count
    ),
    'payables', jsonb_build_object(
      'total', payables_total,
      'overdue', payables_overdue,
      'overdue_count', payables_overdue_count
    ),
    'cash_this_month', jsonb_build_object(
      'in',  cash_in_this_month,
      'out', cash_out_this_month,
      'net', cash_in_this_month - cash_out_this_month,
      'in_prev',  cash_in_last_month,
      'out_prev', cash_out_last_month,
      'invoiced', invoiced_this_month,
      'billed',   billed_this_month
    ),
    'monthly_trend', monthly_trend,
    'top_overdue_customers', top_overdue_customers,
    'top_overdue_suppliers', top_overdue_suppliers
  );

  RETURN result;
END;
$function$
;

-- ---- mark_overdue_bills (void-aware, matches warehouse) ----
CREATE OR REPLACE FUNCTION public.mark_overdue_bills()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE bills
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid', 'void')
    AND  due_date < NOW();
END;
$function$
;

-- ---- rpc_sync_invoice_from_so (full-build's own body + void-exclusion) ----
CREATE OR REPLACE FUNCTION public.rpc_sync_invoice_from_so(p_so_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     AND payment_status NOT IN ('paid', 'void')
     AND COALESCE(status::text, 'draft') NOT IN ('void', 'cancelled')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_needs_refresh := v_invoice.payment_status IN ('partially_paid', 'overdue');

    -- Rebuild lines atomically (delete + insert both under this tx).
    DELETE FROM invoice_line_items WHERE invoice_id = v_invoice.id;

    INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
    SELECT v_invoice.id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
      FROM sale_order_lines sol
     WHERE sol.sale_order_id = p_so_id;

    UPDATE so_invoices
       SET total_amount   = v_total,
           subtotal       = v_total,
           needs_refresh  = v_needs_refresh
     WHERE id = v_invoice.id;

    -- Seed payment plan from SO milestones (idempotent no-op if a plan exists).
    PERFORM public.rpc_seed_payment_plan_from_so(v_invoice.id, p_so_id);

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

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
    FROM sale_order_lines sol
   WHERE sol.sale_order_id = p_so_id;

  -- Auto-seed payment plan from SO milestones (idempotent).
  PERFORM public.rpc_seed_payment_plan_from_so(v_new_inv_id, p_so_id);

  RETURN jsonb_build_object(
    'action',           'created',
    'invoice_id',       v_new_inv_id,
    'invoice_display',  v_new_inv_display
  );
END;
$function$
;

-- rpc_cancel_purchase_order — PO-cancel money path, the mirror of
-- rpc_cancel_sale_order. Voids every live bill on the PO, and for any amount
-- already paid opens a standalone "supplier refund due" debit note (DN-xxxx,
-- open, remaining = paid). Guard mirrors the SO one: block if goods were
-- received (reverse the receival first). SECURITY DEFINER so it may set the
-- privileged 'cancelled' status (the client guard bypasses DEFINER roles).
CREATE OR REPLACE FUNCTION public.rpc_cancel_purchase_order(p_po_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_po           purchase_orders%ROWTYPE;
  v_bill         RECORD;
  v_receivals    int;
  v_bills_voided int     := 0;
  v_paid_total   numeric := 0;
  v_dn_id        uuid    := NULL;
  v_dn_display   text    := NULL;
  v_last_dn      int;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cancel_purchase_order: PO % not found', p_po_id USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RETURN jsonb_build_object('action','noop','reason','already_cancelled');
  END IF;

  -- Guard (mirror SO's shipped-stock block): cannot cancel once goods are in.
  SELECT count(*) INTO v_receivals
    FROM receivals WHERE po_id = p_po_id AND COALESCE(status::text,'') <> 'cancelled';
  IF v_receivals > 0 THEN
    RAISE EXCEPTION 'rpc_cancel_purchase_order: PO % has % receival(s) - reverse the receival first before cancelling.',
      v_po.po_number, v_receivals USING ERRCODE = '42501';
  END IF;

  -- Void every live bill; open a debit note for anything already paid.
  FOR v_bill IN
    SELECT id, bill_number, total_amount, COALESCE(paid_amount,0) AS paid_amount
      FROM bills
     WHERE purchase_order_id = p_po_id AND payment_status <> 'void'
     FOR UPDATE
  LOOP
    UPDATE bills
       SET payment_status = 'void',
           notes = TRIM(BOTH ' -' FROM COALESCE(notes,'') || ' - PO ' || v_po.po_number || ' cancelled')
     WHERE id = v_bill.id;
    v_bills_voided := v_bills_voided + 1;

    IF v_bill.paid_amount > 0 THEN
      v_paid_total := v_paid_total + v_bill.paid_amount;
      PERFORM pg_advisory_xact_lock(hashtext('dn_serial'));
      SELECT COALESCE(MAX((substring(debit_note_id from 4))::int),0) INTO v_last_dn
        FROM debit_notes WHERE debit_note_id ILIKE 'DN-%';
      v_dn_display := 'DN-' || LPAD((v_last_dn + 1)::text, 5, '0');

      INSERT INTO debit_notes (
        debit_note_id, bill_id, purchase_order_id, supplier_id, supplier_name,
        reason, status, total_amount, original_total, remaining_amount, source_return_id
      ) VALUES (
        v_dn_display, v_bill.id, p_po_id, v_po.supplier_id, v_po.supplier_name,
        'PO ' || v_po.po_number || ' cancelled - supplier refund due', 'open',
        v_bill.paid_amount, v_bill.total_amount, v_bill.paid_amount, NULL
      ) RETURNING id INTO v_dn_id;
    END IF;
  END LOOP;

  UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'action',               'cancelled',
    'bills_voided',         v_bills_voided,
    'refund_debit_note_id', v_dn_id,
    'refund_debit_note',    v_dn_display,
    'refund_amount',        v_paid_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cancel_purchase_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_purchase_order(uuid) TO authenticated;

-- ---- heal ----
-- Heal: existing void/cancelled invoices still carry payment_status='unpaid'
-- (or 'paid'); set them to 'void' so they stop reading as "unpaid"/open on every
-- surface. Fixes e.g. SO-2026-09-034.
UPDATE public.so_invoices
   SET payment_status = 'void'
 WHERE COALESCE(status::text,'draft') IN ('void','cancelled')
   AND payment_status <> 'void';

COMMIT;
NOTIFY pgrst, 'reload schema';
