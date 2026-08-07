-- H1 (six-domains checklist): useCancelSO cancels delivered/invoiced
-- SOs without reversing deliveries or COGS.
--
-- The client hook already checks status + non-pending deliveries
-- (useSaleOrders.ts:1022, "Six-domains H1" comment). This trigger
-- is the server-side backstop — direct SQL / RLS-visible UPDATEs from
-- browser console would otherwise bypass the check.
--
-- Rules enforced:
--   1. Terminal statuses (partial_delivery, delivered, invoiced,
--      cancelled) cannot flip to 'cancelled' from any status other than
--      themselves (i.e. cancelling an already-delivered SO is blocked).
--   2. Any transition INTO 'cancelled' is blocked if there is at least
--      one sale_deliveries row for this SO with status != 'pending'.

CREATE OR REPLACE FUNCTION public._sale_orders_block_cancel_with_deliveries()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bad_deliveries int;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.status IN ('partial_delivery','delivered','invoiced') THEN
      RAISE EXCEPTION
        'sale_orders: cannot cancel an SO in "%" status. Reverse the deliveries and invoices first.',
        OLD.status
        USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_bad_deliveries
      FROM public.sale_deliveries
     WHERE sale_order_id = NEW.id
       AND status <> 'pending';

    IF v_bad_deliveries > 0 THEN
      RAISE EXCEPTION
        'sale_orders: cannot cancel — % non-pending delivery record(s) exist. Reverse them first.',
        v_bad_deliveries
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sale_orders_block_cancel_with_deliveries ON public.sale_orders;

CREATE TRIGGER trg_sale_orders_block_cancel_with_deliveries
  BEFORE UPDATE OF status ON public.sale_orders
  FOR EACH ROW
  EXECUTE FUNCTION public._sale_orders_block_cancel_with_deliveries();
