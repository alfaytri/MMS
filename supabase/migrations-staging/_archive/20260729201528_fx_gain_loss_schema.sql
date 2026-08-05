-- Foreign-currency exchange gain/loss — schema foundation
-- Adds snapshot rate + gain/loss columns to purchase_orders, sale_orders, payments,
-- FIFO audit columns, and the exchange_rate_change_log audit table.
-- See docs/superpowers/specs/2026-07-29-foreign-currency-exchange-gain-loss-design.md

BEGIN;

-- ── purchase_orders ────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS initial_exchange_rate      numeric,
  ADD COLUMN IF NOT EXISTS initial_rate_captured_at   timestamptz,
  ADD COLUMN IF NOT EXISTS initial_rate_captured_by   uuid REFERENCES public.user_data(id),
  ADD COLUMN IF NOT EXISTS exchange_gain              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_loss              numeric NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS exchange_net numeric GENERATED ALWAYS AS
    (COALESCE(exchange_gain,0) - COALESCE(exchange_loss,0)) STORED;

-- Backfill: seed initial_exchange_rate from the (mutable) exchange_rate on every existing row
UPDATE public.purchase_orders
   SET initial_exchange_rate    = COALESCE(exchange_rate, 1),
       initial_rate_captured_at = COALESCE(created_at, now())
 WHERE initial_exchange_rate IS NULL;

ALTER TABLE public.purchase_orders
  ALTER COLUMN initial_exchange_rate SET DEFAULT 1,
  ALTER COLUMN initial_exchange_rate SET NOT NULL;

-- ── sale_orders ────────────────────────────────────────────────
ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS initial_exchange_rate      numeric,
  ADD COLUMN IF NOT EXISTS initial_rate_captured_at   timestamptz,
  ADD COLUMN IF NOT EXISTS initial_rate_captured_by   uuid REFERENCES public.user_data(id),
  ADD COLUMN IF NOT EXISTS total_qar                  numeric,
  ADD COLUMN IF NOT EXISTS exchange_gain              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_loss              numeric NOT NULL DEFAULT 0;

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS exchange_net numeric GENERATED ALWAYS AS
    (COALESCE(exchange_gain,0) - COALESCE(exchange_loss,0)) STORED;

UPDATE public.sale_orders
   SET initial_exchange_rate    = COALESCE(exchange_rate, 1),
       initial_rate_captured_at = COALESCE(created_at, now())
 WHERE initial_exchange_rate IS NULL;

ALTER TABLE public.sale_orders
  ALTER COLUMN initial_exchange_rate SET DEFAULT 1,
  ALTER COLUMN initial_exchange_rate SET NOT NULL;

-- Backfill total_qar on existing rows: sum of sale_order_lines total * initial_exchange_rate
UPDATE public.sale_orders so
   SET total_qar = (
     SELECT COALESCE(SUM(sol.total), 0) * COALESCE(so.initial_exchange_rate, 1)
       FROM public.sale_order_lines sol
      WHERE sol.sale_order_id = so.id
   )
 WHERE so.total_qar IS NULL;

-- ── payments ───────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS exchange_gain numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_loss numeric NOT NULL DEFAULT 0;

-- ── fifo_cost_layers audit-only columns ────────────────────────
ALTER TABLE public.fifo_cost_layers
  ADD COLUMN IF NOT EXISTS source_currency      text    NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS source_exchange_rate numeric NOT NULL DEFAULT 1;

-- ── exchange_rate_change_log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_rate_change_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type  text NOT NULL CHECK (document_type IN ('po','so')),
  document_id    uuid NOT NULL,
  old_rate       numeric NOT NULL,
  new_rate       numeric NOT NULL,
  reason         text    NOT NULL,
  changed_by     uuid REFERENCES public.user_data(id),
  changed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rate_change_log_reason_len CHECK (char_length(trim(reason)) >= 5),
  CONSTRAINT exchange_rate_change_log_new_rate_positive CHECK (new_rate > 0)
);

CREATE INDEX IF NOT EXISTS exchange_rate_change_log_document_idx
  ON public.exchange_rate_change_log (document_type, document_id, changed_at DESC);

ALTER TABLE public.exchange_rate_change_log ENABLE ROW LEVEL SECURITY;

-- Read policy: any authenticated user (same visibility as PO/SO — RPC layer refines further)
DROP POLICY IF EXISTS "exchange_rate_change_log_read" ON public.exchange_rate_change_log;
CREATE POLICY "exchange_rate_change_log_read"
  ON public.exchange_rate_change_log FOR SELECT
  TO authenticated USING (true);

-- No client-side inserts — only via SECURITY DEFINER RPC (Task 2)
DROP POLICY IF EXISTS "exchange_rate_change_log_no_client_write" ON public.exchange_rate_change_log;
CREATE POLICY "exchange_rate_change_log_no_client_write"
  ON public.exchange_rate_change_log FOR ALL
  TO authenticated USING (false) WITH CHECK (false);

GRANT SELECT ON public.exchange_rate_change_log TO authenticated;

COMMIT;
