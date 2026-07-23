-- ============================================================
-- Normalize remaining JSONB columns into proper line-item tables
-- 1. returns.items → return_lines
-- 2. sale_deliveries.items → sale_delivery_lines
-- 3. tl_invoices.items → tl_invoice_lines
-- 4. landed_costs.lines → landed_cost_lines
-- 5. landed_costs.item_allocations → landed_cost_item_allocations
-- ============================================================

BEGIN;

-- ============================================================
-- 1) returns.items → return_lines
-- ============================================================

CREATE TABLE public.return_lines (
    id               uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    return_id        uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    brand_variant_id uuid,
    item_name        text NOT NULL DEFAULT 'Item',
    sku              text,
    qty              integer NOT NULL DEFAULT 0,
    condition        text,
    condition_notes  text,
    created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_return_lines_return ON public.return_lines(return_id);

INSERT INTO public.return_lines (
    return_id, brand_variant_id, item_name, sku, qty, condition, condition_notes
)
SELECT
    r.id,
    CASE WHEN item->>'brand_variant_id' IS NOT NULL
         AND item->>'brand_variant_id' != 'null'
         THEN (item->>'brand_variant_id')::uuid END,
    COALESCE(item->>'item_name', 'Item'),
    NULLIF(item->>'sku', ''),
    COALESCE((item->>'qty')::integer, 0),
    item->>'condition',
    item->>'condition_notes'
FROM public.returns r,
     jsonb_array_elements(r.items) AS item
WHERE r.items IS NOT NULL
  AND jsonb_typeof(r.items) = 'array'
  AND jsonb_array_length(r.items) > 0;

ALTER TABLE public.returns DROP COLUMN items;

ALTER TABLE public.return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return_lines_read" ON public.return_lines FOR SELECT USING (true);
CREATE POLICY "return_lines_write" ON public.return_lines FOR ALL USING (true);


-- ============================================================
-- 2) sale_deliveries.items → sale_delivery_lines
-- ============================================================

CREATE TABLE public.sale_delivery_lines (
    id               uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sale_delivery_id uuid NOT NULL REFERENCES public.sale_deliveries(id) ON DELETE CASCADE,
    brand_variant_id uuid,
    item_name        text NOT NULL DEFAULT 'Item',
    sku              text,
    qty_delivered    integer NOT NULL DEFAULT 0,
    created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_sale_delivery_lines_delivery ON public.sale_delivery_lines(sale_delivery_id);

INSERT INTO public.sale_delivery_lines (
    sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
)
SELECT
    sd.id,
    CASE WHEN item->>'brand_variant_id' IS NOT NULL
         AND item->>'brand_variant_id' != 'null'
         THEN (item->>'brand_variant_id')::uuid END,
    COALESCE(item->>'item_name', 'Item'),
    NULLIF(item->>'sku', ''),
    COALESCE((item->>'qty_delivered')::integer, 0)
FROM public.sale_deliveries sd,
     jsonb_array_elements(sd.items) AS item
WHERE sd.items IS NOT NULL
  AND jsonb_typeof(sd.items) = 'array'
  AND jsonb_array_length(sd.items) > 0;

ALTER TABLE public.sale_deliveries DROP COLUMN items;

ALTER TABLE public.sale_delivery_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_delivery_lines_read" ON public.sale_delivery_lines FOR SELECT USING (true);
CREATE POLICY "sale_delivery_lines_write" ON public.sale_delivery_lines FOR ALL USING (true);


-- ============================================================
-- 3) tl_invoices.items → tl_invoice_lines
-- ============================================================

CREATE TABLE public.tl_invoice_lines (
    id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tl_invoice_id  uuid NOT NULL REFERENCES public.tl_invoices(id) ON DELETE CASCADE,
    name           text NOT NULL DEFAULT 'Item',
    qty            numeric NOT NULL DEFAULT 1,
    unit_price     numeric NOT NULL DEFAULT 0,
    total          numeric NOT NULL DEFAULT 0,
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_tl_invoice_lines_invoice ON public.tl_invoice_lines(tl_invoice_id);

INSERT INTO public.tl_invoice_lines (
    tl_invoice_id, name, qty, unit_price, total
)
SELECT
    ti.id,
    COALESCE(item->>'name', 'Item'),
    COALESCE((item->>'qty')::numeric, 1),
    COALESCE((item->>'unit_price')::numeric, 0),
    COALESCE((item->>'total')::numeric, 0)
FROM public.tl_invoices ti,
     jsonb_array_elements(ti.items) AS item
WHERE ti.items IS NOT NULL
  AND jsonb_typeof(ti.items) = 'array'
  AND jsonb_array_length(ti.items) > 0;

ALTER TABLE public.tl_invoices DROP COLUMN items;

ALTER TABLE public.tl_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tl_invoice_lines_read" ON public.tl_invoice_lines FOR SELECT USING (true);
CREATE POLICY "tl_invoice_lines_write" ON public.tl_invoice_lines FOR ALL USING (true);


-- ============================================================
-- 4) landed_costs.lines → landed_cost_lines
-- ============================================================

CREATE TABLE public.landed_cost_lines (
    id              uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    landed_cost_id  uuid NOT NULL REFERENCES public.landed_costs(id) ON DELETE CASCADE,
    description     text NOT NULL DEFAULT '',
    amount          numeric NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'QAR',
    exchange_rate   numeric NOT NULL DEFAULT 1,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_landed_cost_lines_lc ON public.landed_cost_lines(landed_cost_id);

INSERT INTO public.landed_cost_lines (
    landed_cost_id, description, amount, currency, exchange_rate
)
SELECT
    lc.id,
    COALESCE(TRIM(item->>'description'), ''),
    COALESCE((item->>'amount')::numeric, 0),
    COALESCE(item->>'currency', 'QAR'),
    COALESCE((item->>'exchange_rate')::numeric, 1)
FROM public.landed_costs lc,
     jsonb_array_elements(lc.lines) AS item
WHERE lc.lines IS NOT NULL
  AND jsonb_typeof(lc.lines) = 'array'
  AND jsonb_array_length(lc.lines) > 0;

ALTER TABLE public.landed_costs DROP COLUMN lines;

ALTER TABLE public.landed_cost_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landed_cost_lines_read" ON public.landed_cost_lines FOR SELECT USING (true);
CREATE POLICY "landed_cost_lines_write" ON public.landed_cost_lines FOR ALL USING (true);


-- ============================================================
-- 5) landed_costs.item_allocations → landed_cost_item_allocations
-- ============================================================

CREATE TABLE public.landed_cost_item_allocations (
    id                   uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    landed_cost_id       uuid NOT NULL REFERENCES public.landed_costs(id) ON DELETE CASCADE,
    brand_variant_id     uuid,
    item_name            text NOT NULL DEFAULT 'Item',
    sku                  text,
    qty_received         integer NOT NULL DEFAULT 0,
    qty_remaining_at_lc  integer NOT NULL DEFAULT 0,
    sold_qty             integer NOT NULL DEFAULT 0,
    original_unit_cost   numeric NOT NULL DEFAULT 0,
    lc_per_unit          numeric NOT NULL DEFAULT 0,
    updated_unit_cost    numeric NOT NULL DEFAULT 0,
    allocated_lc_total   numeric NOT NULL DEFAULT 0,
    inventory_portion    numeric NOT NULL DEFAULT 0,
    cogs_portion         numeric NOT NULL DEFAULT 0,
    created_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_landed_cost_item_alloc_lc ON public.landed_cost_item_allocations(landed_cost_id);

INSERT INTO public.landed_cost_item_allocations (
    landed_cost_id, brand_variant_id, item_name, sku,
    qty_received, qty_remaining_at_lc, sold_qty,
    original_unit_cost, lc_per_unit, updated_unit_cost,
    allocated_lc_total, inventory_portion, cogs_portion
)
SELECT
    lc.id,
    CASE WHEN item->>'brand_variant_id' IS NOT NULL
         AND item->>'brand_variant_id' != 'null'
         THEN (item->>'brand_variant_id')::uuid END,
    COALESCE(item->>'item_name', 'Item'),
    NULLIF(item->>'sku', ''),
    COALESCE((item->>'qty_received')::integer, 0),
    COALESCE((item->>'qty_remaining_at_lc')::integer, 0),
    COALESCE((item->>'sold_qty')::integer, 0),
    COALESCE((item->>'original_unit_cost')::numeric, 0),
    COALESCE((item->>'lc_per_unit')::numeric, 0),
    COALESCE((item->>'updated_unit_cost')::numeric, 0),
    COALESCE((item->>'allocated_lc_total')::numeric, 0),
    COALESCE((item->>'inventory_portion')::numeric, 0),
    COALESCE((item->>'cogs_portion')::numeric, 0)
FROM public.landed_costs lc,
     jsonb_array_elements(lc.item_allocations) AS item
WHERE lc.item_allocations IS NOT NULL
  AND jsonb_typeof(lc.item_allocations) = 'array'
  AND jsonb_array_length(lc.item_allocations) > 0;

ALTER TABLE public.landed_costs DROP COLUMN item_allocations;

ALTER TABLE public.landed_cost_item_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landed_cost_item_alloc_read" ON public.landed_cost_item_allocations FOR SELECT USING (true);
CREATE POLICY "landed_cost_item_alloc_write" ON public.landed_cost_item_allocations FOR ALL USING (true);

COMMIT;
