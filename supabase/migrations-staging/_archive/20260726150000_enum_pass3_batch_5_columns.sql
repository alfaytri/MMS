-- Enum Conversion Pass 3 batch: 5 easy-win text-CHECK columns retyped to
-- native Postgres enums.
--
-- All five columns already have canonical CHECK-constrained vocabularies
-- that match code writers verbatim — no vocabulary drift, no app change
-- needed. Doing them together because they share the same pattern:
--   pre-flight guard → drop CHECK/default/index → CREATE TYPE
--   → ALTER COLUMN TYPE USING …::enum → restore default/index typed.
--
-- Columns:
--   1. payments.direction               → payment_direction
--        (default 'incoming'; partial index idx_payments_incoming
--         with text-literal predicate to rebuild)
--   2. sale_deliveries.type             → sale_delivery_type
--        (default 'standard')
--   3. credit_notes.resolution_type     → credit_note_resolution_type
--        (nullable, no default, no index)
--   4. receivals.source_type            → receival_source_type
--        (default 'purchase')
--   5. inventory_stock_movements.movement_type → stock_movement_type
--        (15 values incl. inventory_receival_carve / _new added later)
--
-- customers.entity_type already done in 20260724240000.
-- Existing writer values verified against the CHECK sets — no data
-- migration needed.

BEGIN;

-- ─── Dependent views ───────────────────────────────────────────────────
-- customer_credit_balances (from 20260725170000_store_credit_as_payment)
-- reads both payments.direction AND credit_notes.resolution_type — drop
-- it first, recreate at the end with identical body.

DROP VIEW IF EXISTS public.customer_credit_balances;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. payments.direction → payment_direction
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT direction, ', ') INTO bad
  FROM public.payments
  WHERE direction NOT IN ('incoming', 'outgoing');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'payments.direction has unexpected values: %', bad;
  END IF;
END $$;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_direction_check;

ALTER TABLE public.payments
  ALTER COLUMN direction DROP DEFAULT;

DROP INDEX IF EXISTS public.idx_payments_incoming;

DO $$ BEGIN
  CREATE TYPE public.payment_direction AS ENUM ('incoming', 'outgoing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ALTER COLUMN direction TYPE public.payment_direction
  USING direction::public.payment_direction;

ALTER TABLE public.payments
  ALTER COLUMN direction SET DEFAULT 'incoming'::public.payment_direction;

CREATE INDEX idx_payments_incoming
  ON public.payments(direction, deleted_at)
  WHERE direction = 'incoming'::public.payment_direction;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. sale_deliveries.type → sale_delivery_type
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT type, ', ') INTO bad
  FROM public.sale_deliveries
  WHERE type NOT IN ('standard', 'replacement');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'sale_deliveries.type has unexpected values: %', bad;
  END IF;
END $$;

ALTER TABLE public.sale_deliveries
  DROP CONSTRAINT IF EXISTS sale_deliveries_type_check;

ALTER TABLE public.sale_deliveries
  ALTER COLUMN type DROP DEFAULT;

DO $$ BEGIN
  CREATE TYPE public.sale_delivery_type AS ENUM ('standard', 'replacement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.sale_deliveries
  ALTER COLUMN type TYPE public.sale_delivery_type
  USING type::public.sale_delivery_type;

ALTER TABLE public.sale_deliveries
  ALTER COLUMN type SET DEFAULT 'standard'::public.sale_delivery_type;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. credit_notes.resolution_type → credit_note_resolution_type (nullable)
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT resolution_type, ', ') INTO bad
  FROM public.credit_notes
  WHERE resolution_type IS NOT NULL
    AND resolution_type NOT IN ('refund', 'replacement', 'store_credit');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'credit_notes.resolution_type has unexpected values: %', bad;
  END IF;
END $$;

ALTER TABLE public.credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_resolution_type_check;

DO $$ BEGIN
  CREATE TYPE public.credit_note_resolution_type AS ENUM ('refund', 'replacement', 'store_credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.credit_notes
  ALTER COLUMN resolution_type TYPE public.credit_note_resolution_type
  USING resolution_type::public.credit_note_resolution_type;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. receivals.source_type → receival_source_type
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT source_type, ', ') INTO bad
  FROM public.receivals
  WHERE source_type NOT IN ('purchase', 'inventory');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'receivals.source_type has unexpected values: %', bad;
  END IF;
END $$;

ALTER TABLE public.receivals
  DROP CONSTRAINT IF EXISTS receivals_source_type_check;

ALTER TABLE public.receivals
  ALTER COLUMN source_type DROP DEFAULT;

DO $$ BEGIN
  CREATE TYPE public.receival_source_type AS ENUM ('purchase', 'inventory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.receivals
  ALTER COLUMN source_type TYPE public.receival_source_type
  USING source_type::public.receival_source_type;

ALTER TABLE public.receivals
  ALTER COLUMN source_type SET DEFAULT 'purchase'::public.receival_source_type;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. inventory_stock_movements.movement_type → stock_movement_type
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT movement_type, ', ') INTO bad
  FROM public.inventory_stock_movements
  WHERE movement_type NOT IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment',
    'receival_edit', 'free_receival',
    'sale_return', 'sale_return_damaged',
    'purchase_return', 'purchase_return_cancelled',
    'inventory_check',
    'inventory_receival_carve', 'inventory_receival_new'
  );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_stock_movements.movement_type has unexpected values: %', bad;
  END IF;
END $$;

ALTER TABLE public.inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment',
    'receival_edit', 'free_receival',
    'sale_return', 'sale_return_damaged',
    'purchase_return', 'purchase_return_cancelled',
    'inventory_check',
    'inventory_receival_carve', 'inventory_receival_new'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inventory_stock_movements
  ALTER COLUMN movement_type TYPE public.stock_movement_type
  USING movement_type::public.stock_movement_type;

-- ═══════════════════════════════════════════════════════════════════════
-- Recreate customer_credit_balances (identical body from 20260725170000).
-- Uses the now-enum columns implicitly via ::text comparison friendly
-- literals — Postgres coerces the string literal to the enum on compare.

CREATE VIEW public.customer_credit_balances
WITH (security_invoker = on)
AS
WITH resolved AS (
  SELECT
    cn.id,
    cn.total_amount,
    COALESCE(inv_so.customer_id, ret_so.customer_id) AS customer_id,
    COALESCE(inv_so.currency,    ret_so.currency, 'QAR') AS currency
  FROM   public.credit_notes cn
  LEFT JOIN public.so_invoices    inv    ON inv.id = cn.invoice_id
  LEFT JOIN public.sale_orders    inv_so ON inv_so.id = inv.sale_order_id
  LEFT JOIN public.so_po_returns  spr    ON spr.id = cn.source_return_id
                                          AND spr.source_type = 'sale_order'
  LEFT JOIN public.sale_orders    ret_so ON ret_so.id = spr.source_id
  WHERE  cn.resolution_type = 'store_credit'
    AND  cn.status IN ('issued'::public.credit_note_status,
                       'approved'::public.credit_note_status)
),
redemptions AS (
  SELECT credit_note_id, COALESCE(SUM(amount), 0) AS applied
  FROM   public.payments
  WHERE  credit_note_id IS NOT NULL
    AND  direction     = 'incoming'
    AND  deleted_at    IS NULL
  GROUP  BY credit_note_id
)
SELECT
  r.customer_id,
  r.currency,
  COUNT(*)                                                       AS open_count,
  SUM(r.total_amount - COALESCE(red.applied, 0))                 AS open_amount
FROM   resolved r
LEFT JOIN redemptions red ON red.credit_note_id = r.id
WHERE  r.customer_id IS NOT NULL
  AND  (r.total_amount - COALESCE(red.applied, 0)) > 0
GROUP  BY r.customer_id, r.currency;

GRANT SELECT ON public.customer_credit_balances TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
