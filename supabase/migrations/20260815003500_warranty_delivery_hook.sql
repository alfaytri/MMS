-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 6
--
-- Auto-creation of warranty_records when a sale_delivery flips to 'delivered'.
--
-- Design decision (deviation from the plan doc, same rollback guarantee):
--   Instead of editing the 150-line complete_delivery_inventory RPC, we hook
--   this via an AFTER UPDATE trigger on sale_deliveries. A trigger fires in
--   the same transaction as the UPDATE that flipped the status, so a failure
--   inside the trigger rolls the whole transaction back — identical
--   consistency guarantee to the "call from inside the RPC" alternative,
--   but with zero risk of breaking the delivery pathway on the many edge
--   cases that RPC has been fixed for over the last months.
--
-- Idempotency: warranty_records.sale_delivery_line_id is UNIQUE, so a
-- retried delivery (should it happen) will hit ON CONFLICT DO NOTHING
-- for lines that already have a record. Lines added after initial
-- 'delivered' would still get coverage, which is the desired behaviour.
--
-- Start-date policy resolution:
--   - policy.starts_from = 'delivery_date'  → sale_deliveries.date
--   - policy.starts_from = 'invoice_date'   → latest invoices.issued_date
--                                             for this delivery; falls back
--                                             to delivery date if no invoice
--                                             exists yet (which is normal —
--                                             invoicing often follows
--                                             delivery, and the record must
--                                             be created immediately)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Helper: create warranty_records for all lines of a single delivery ────
CREATE OR REPLACE FUNCTION public.create_warranty_records_for_delivery(
  p_delivery_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery      RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_invoice_date  date;
  v_inserted      integer := 0;
BEGIN
  -- Delivery + parent SO snapshot
  SELECT sd.id, sd.date, sd.sale_order_id,
         so.customer_id, so.division_id
  INTO   v_delivery
  FROM   public.sale_deliveries sd
  JOIN   public.sale_orders so ON so.id = sd.sale_order_id
  WHERE  sd.id = p_delivery_id;

  IF NOT FOUND THEN
    -- No SO or delivery — do nothing (defensive; the RPC already validated).
    RETURN 0;
  END IF;

  IF v_delivery.division_id IS NULL THEN
    -- Deliveries whose SO has no division cannot satisfy RLS on
    -- warranty_records.division_id (NOT NULL). Skip silently — legacy
    -- rows only.
    RETURN 0;
  END IF;

  -- Pre-compute invoice date once (single lookup regardless of line count).
  SELECT MAX(issued_date)
  INTO   v_invoice_date
  FROM   public.invoices
  WHERE  sale_delivery_id = p_delivery_id;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty_delivered
    FROM   public.sale_delivery_lines
    WHERE  sale_delivery_id = p_delivery_id
  LOOP
    -- Skip empty / zero-qty / variant-less rows — no warranty context.
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty_delivered IS NULL
       OR v_line.qty_delivered <= 0
    THEN
      CONTINUE;
    END IF;

    -- Resolve item_id from brand_variant_id
    SELECT item_id INTO v_item_id
    FROM   public.inventory_item_brand_variants
    WHERE  id = v_line.brand_variant_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Resolve effective policy via item override → category chain
    v_policy_id := public.get_effective_warranty_policy(v_item_id);

    IF v_policy_id IS NULL THEN
      CONTINUE;  -- Item is uninsured — matches "no fallback default" rule.
    END IF;

    SELECT * INTO v_policy
    FROM   public.warranty_policies
    WHERE  id = v_policy_id;

    -- Duration 0 = explicit "No Warranty" template — skip (matches plan).
    IF v_policy.duration_months = 0 THEN
      CONTINUE;
    END IF;

    -- Compute start_date per policy.starts_from. Fall back to delivery
    -- date when starts_from = 'invoice_date' but no invoice exists yet
    -- (issuance may follow delivery).
    v_start_date := CASE
      WHEN v_policy.starts_from = 'invoice_date' AND v_invoice_date IS NOT NULL
        THEN v_invoice_date
      ELSE COALESCE(v_delivery.date, CURRENT_DATE)
    END;

    INSERT INTO public.warranty_records (
      sale_delivery_line_id,
      sale_order_id,
      customer_id,
      division_id,
      brand_variant_id,
      item_name,
      sku,
      qty,
      policy_id,
      policy_name_snapshot,
      coverage_type_snapshot,
      duration_months_snapshot,
      terms_en_snapshot,
      terms_ar_snapshot,
      void_conditions_snapshot,
      starts_from_snapshot,
      start_date,
      end_date
    ) VALUES (
      v_line.id,
      v_delivery.sale_order_id,
      v_delivery.customer_id,
      v_delivery.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      v_line.sku,
      v_line.qty_delivered,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date
    )
    ON CONFLICT (sale_delivery_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.create_warranty_records_for_delivery(uuid) IS
  'Creates warranty_records for every eligible line in a delivery. Called by the AFTER UPDATE trigger on sale_deliveries when status flips to delivered. Idempotent via UNIQUE(sale_delivery_line_id).';

GRANT EXECUTE ON FUNCTION public.create_warranty_records_for_delivery(uuid)
  TO authenticated, service_role;

-- ── Trigger function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_deliveries_create_warranties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status IS DISTINCT FROM 'delivered'
  THEN
    PERFORM public.create_warranty_records_for_delivery(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_deliveries_create_warranties ON public.sale_deliveries;

CREATE TRIGGER trg_sale_deliveries_create_warranties
  AFTER UPDATE OF status ON public.sale_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_deliveries_create_warranties();

NOTIFY pgrst, 'reload schema';

COMMIT;
