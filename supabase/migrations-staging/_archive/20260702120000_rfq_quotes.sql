-- RFQ-in-PO: add multi-supplier quote tracking tables
-- Allows sending an RFQ to multiple suppliers within a PO and recording
-- their quoted prices per line item.

-- ── 1. Column on purchase_orders ──────────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS rfq_supplier_ids uuid[] DEFAULT '{}';

COMMENT ON COLUMN public.purchase_orders.rfq_supplier_ids IS
  'Supplier IDs that received the RFQ for this PO. Empty = single-supplier PO.';

-- ── 2. po_rfq_quotes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_rfq_quotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id),
  currency      text NOT NULL DEFAULT 'QAR',
  total_amount  numeric DEFAULT 0,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'received', 'awarded', 'rejected')),
  received_date date,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS po_rfq_quotes_po_idx
  ON public.po_rfq_quotes(po_id);

-- ── 3. po_rfq_quote_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_rfq_quote_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        uuid NOT NULL REFERENCES public.po_rfq_quotes(id) ON DELETE CASCADE,
  po_line_item_id uuid NOT NULL REFERENCES public.po_line_items(id) ON DELETE CASCADE,
  quoted_price    numeric NOT NULL DEFAULT 0,
  quoted_qty      integer,
  notes           text
);

CREATE INDEX IF NOT EXISTS po_rfq_quote_items_quote_idx
  ON public.po_rfq_quote_items(quote_id);

-- ── 4. RLS — po_rfq_quotes ───────────────────────────────────────────────────

ALTER TABLE public.po_rfq_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_rfq_quotes_select
  ON public.po_rfq_quotes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY po_rfq_quotes_insert
  ON public.po_rfq_quotes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY po_rfq_quotes_update
  ON public.po_rfq_quotes FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY po_rfq_quotes_delete
  ON public.po_rfq_quotes FOR DELETE TO authenticated
  USING (true);

-- ── 5. RLS — po_rfq_quote_items ──────────────────────────────────────────────

ALTER TABLE public.po_rfq_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_rfq_quote_items_select
  ON public.po_rfq_quote_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY po_rfq_quote_items_insert
  ON public.po_rfq_quote_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY po_rfq_quote_items_update
  ON public.po_rfq_quote_items FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY po_rfq_quote_items_delete
  ON public.po_rfq_quote_items FOR DELETE TO authenticated
  USING (true);
