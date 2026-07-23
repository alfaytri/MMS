-- Task 4 (SO/Invoice Parity) — enforce 1 SO = 1 invoice at the DB
-- level. generate_invoice_from_so already refuses to create a second
-- one, but the DB should be the ultimate arbiter — a rogue INSERT via
-- any other path also has to fail.
--
-- Matches the AP-side UNIQUE(purchase_order_id) on bills.

BEGIN;

DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT sale_order_id
    FROM   public.so_invoices
    WHERE  sale_order_id IS NOT NULL
    GROUP  BY sale_order_id
    HAVING COUNT(*) > 1
  ) x;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Refusing to add UNIQUE(sale_order_id): % SO(s) have more than one invoice. Reconcile before applying.', v_dups;
  END IF;
END $$;

ALTER TABLE public.so_invoices
  ADD CONSTRAINT so_invoices_sale_order_id_unique UNIQUE (sale_order_id);

COMMIT;
