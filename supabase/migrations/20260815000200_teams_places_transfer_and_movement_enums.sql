-- Teams + Places + Consumption — Task 2 of 4 DB migrations
--
-- Extends the two discriminators that a consumption / custody flow needs:
--
--   1. `warehouse_transfers.transfer_kind` (text CHECK constraint) —
--      adds 'custody_assign' + 'custody_return' so operators can send stock
--      to a Teams / Places sub-container and pull it back. The existing
--      `damaged_repair_*` kinds are preserved verbatim.
--
--   2. `stock_movement_type` (enum) — adds 'consumption' for the movement
--      row that `rpc_post_consumption` inserts alongside the FIFO deduct.
--      No new movement types for custody transfers — the existing
--      `transfer_in`/`transfer_out` pair already covers those; the
--      transfer_kind on `warehouse_transfers` supplies the "this was a
--      custody move, not a normal transfer" context.
--
-- Also relaxes `warehouse_transfers_repair_shape` so the two new kinds
-- pass the check. Neither custody kind needs a repair_vendor, so both are
-- unconstrained here (repair_vendor_id null-or-not, source_return_line
-- null-or-not).
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md
-- Prior migration: 20260815000100_teams_places_warehouse_kind_and_seed.sql

-- 1. transfer_kind CHECK — add custody_assign, custody_return ────────
ALTER TABLE public.warehouse_transfers
  DROP CONSTRAINT IF EXISTS warehouse_transfers_kind_check;

ALTER TABLE public.warehouse_transfers
  ADD CONSTRAINT warehouse_transfers_kind_check
  CHECK (transfer_kind IN (
    'good_stock',
    'damaged_repair_out',
    'damaged_repair_return_good',
    'damaged_repair_return_writeoff',
    'custody_assign',
    'custody_return'
  ));

-- 2. Repair-shape check — leave existing rules; the two new custody
--    kinds are unconstrained (no vendor required). The original CHECK
--    used a CASE that returned NULL for unmatched kinds; NULL satisfies
--    a CHECK constraint, so we just need to add the two new kinds to
--    make our intent explicit and future-proof against a stricter
--    default. Full re-declaration for clarity.
ALTER TABLE public.warehouse_transfers
  DROP CONSTRAINT IF EXISTS warehouse_transfers_repair_shape;

ALTER TABLE public.warehouse_transfers
  ADD CONSTRAINT warehouse_transfers_repair_shape CHECK (
    CASE transfer_kind
      WHEN 'good_stock'                     THEN repair_vendor_id IS NULL
                                             AND source_return_line_disposition_id IS NULL
      WHEN 'damaged_repair_out'             THEN repair_vendor_id IS NOT NULL
      WHEN 'damaged_repair_return_good'     THEN repair_vendor_id IS NOT NULL
      WHEN 'damaged_repair_return_writeoff' THEN repair_vendor_id IS NOT NULL
      WHEN 'custody_assign'                 THEN repair_vendor_id IS NULL
                                             AND source_return_line_disposition_id IS NULL
      WHEN 'custody_return'                 THEN repair_vendor_id IS NULL
                                             AND source_return_line_disposition_id IS NULL
    END
  );

COMMENT ON CONSTRAINT warehouse_transfers_repair_shape ON public.warehouse_transfers IS
'Preserves Phase F relaxation (damaged_repair_out no longer requires a disposition
link) and adds two new custody kinds. Custody transfers move stock between real
warehouses and the Teams/Places virtual warehouses — no repair_vendor, no
disposition. All damaged_repair_* rules unchanged.';

-- 3. stock_movement_type — add 'consumption' ─────────────────────────
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'consumption';

-- 4. Verification — fail the migration loudly if any value is missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_enum e ON e.enumtypid = t.oid
    WHERE  t.typname = 'stock_movement_type'
      AND  e.enumlabel = 'consumption'
  ) THEN
    RAISE EXCEPTION 'stock_movement_type enum is missing the "consumption" value';
  END IF;
END $$;
