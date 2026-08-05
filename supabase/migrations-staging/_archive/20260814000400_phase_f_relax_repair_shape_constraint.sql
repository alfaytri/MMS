-- Warehouse Model v2 — Phase F, migration 4/4
--
-- Symptom: `rpc_send_damaged_stock_for_repair` fails with
--   new row for relation "warehouse_transfers" violates check constraint
--   "warehouse_transfers_repair_shape"
--
-- The original constraint (migration 20260802000300) required every
-- `damaged_repair_out` transfer to link to a disposition:
--   damaged_repair_out → source_return_line_disposition_id IS NOT NULL
--
-- Phase F introduces ad-hoc send-for-repair from the Damaged Stock On-hand
-- tab, where there is no disposition context (the operator picks a
-- warehouse+variant+qty directly from the pile). The vendor + kind
-- discriminator are still required — that's the real invariant. The
-- disposition link is now optional.
--
-- Fix: drop and re-create the constraint without the disposition
-- requirement on damaged_repair_out. Vendor, still required. The rest of
-- the shape unchanged.

ALTER TABLE public.warehouse_transfers
  DROP CONSTRAINT IF EXISTS warehouse_transfers_repair_shape;

ALTER TABLE public.warehouse_transfers
  ADD CONSTRAINT warehouse_transfers_repair_shape CHECK (
    CASE transfer_kind
      WHEN 'good_stock' THEN repair_vendor_id IS NULL
                         AND source_return_line_disposition_id IS NULL
      WHEN 'damaged_repair_out'            THEN repair_vendor_id IS NOT NULL
      WHEN 'damaged_repair_return_good'    THEN repair_vendor_id IS NOT NULL
      WHEN 'damaged_repair_return_writeoff' THEN repair_vendor_id IS NOT NULL
    END
  );

COMMENT ON CONSTRAINT warehouse_transfers_repair_shape ON public.warehouse_transfers IS
'Phase F relaxation: damaged_repair_out no longer requires a disposition link.
Ad-hoc sends from the Damaged Stock On-hand tab (no return context) leave
source_return_line_disposition_id NULL; disposition-driven sends still stamp it.
Vendor is still required to distinguish repair transfers from good-stock ones.';
