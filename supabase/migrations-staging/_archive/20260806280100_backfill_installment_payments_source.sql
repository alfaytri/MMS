-- Backfill: installment payments inserted by the old rpc_settle_installment
-- are missing source_type / source_id / customer_id. Fix them by joining
-- through payment_installments → payment_plans → so_invoices.

UPDATE payments p
   SET source_type  = 'sale_order'::public.payment_source_type,
       source_id    = inv.sale_order_id,
       customer_id  = inv.customer_id
  FROM payment_installments pi
  JOIN payment_plans pp ON pp.id = pi.plan_id
  JOIN so_invoices inv ON inv.id = pp.invoice_id
 WHERE pi.payment_id = p.id
   AND p.source_type IS NULL
   AND inv.sale_order_id IS NOT NULL;

-- Also fix so_invoices.payment_status for any invoice whose plan is
-- completed but status never got flipped.
UPDATE so_invoices inv
   SET payment_status = (
     CASE
       WHEN COALESCE(paid.total, 0) >= COALESCE(inv.total_amount, 0) THEN 'paid'
       WHEN COALESCE(paid.total, 0) > 0 THEN 'partially_paid'
       ELSE 'unpaid'
     END
   )::public.invoice_payment_status
  FROM (
    SELECT invoice_id, SUM(amount) AS total
      FROM payments
     WHERE deleted_at IS NULL
       AND invoice_id IS NOT NULL
     GROUP BY invoice_id
  ) paid
 WHERE paid.invoice_id = inv.id
   AND inv.payment_status <> (
     CASE
       WHEN COALESCE(paid.total, 0) >= COALESCE(inv.total_amount, 0) THEN 'paid'
       WHEN COALESCE(paid.total, 0) > 0 THEN 'partially_paid'
       ELSE 'unpaid'
     END
   )::public.invoice_payment_status;
