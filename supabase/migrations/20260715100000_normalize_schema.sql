-- ============================================================
-- Schema Normalization Migration
-- ============================================================
-- 1. Drop redundant credit_notes.line_items JSON column
-- 2. Create po_version_lines table, migrate JSON data, drop column
-- 3. Convert text FK columns to uuid with proper foreign keys
-- ============================================================

BEGIN;

-- ============================================================
-- 1) credit_notes: normalize line_items JSON into credit_note_lines
-- ============================================================

-- Add missing columns to credit_note_lines
ALTER TABLE public.credit_note_lines
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS line_type text DEFAULT 'returned' NOT NULL,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS condition_notes text;

ALTER TABLE public.credit_note_lines
  ALTER COLUMN description DROP NOT NULL;

-- Migrate JSON returned_lines into credit_note_lines for notes
-- that have JSON data but no rows in credit_note_lines yet
INSERT INTO public.credit_note_lines (
    credit_note_id, description, sku, qty, unit_price, line_type,
    condition, condition_notes
)
SELECT
    cn.id,
    COALESCE(item->>'item_name', 'Item'),
    item->>'sku',
    COALESCE((item->>'qty')::numeric, 0),
    COALESCE((item->>'unit_price')::numeric, 0),
    'returned',
    item->>'condition',
    item->>'condition_notes'
FROM public.credit_notes cn,
     jsonb_array_elements(cn.line_items->'returned_lines') AS item
WHERE cn.line_items IS NOT NULL
  AND cn.line_items->'returned_lines' IS NOT NULL
  AND jsonb_typeof(cn.line_items->'returned_lines') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_note_lines cl
    WHERE cl.credit_note_id = cn.id AND cl.line_type = 'returned'
  );

-- Migrate JSON original_lines into credit_note_lines
INSERT INTO public.credit_note_lines (
    credit_note_id, description, sku, qty, unit_price, line_type
)
SELECT
    cn.id,
    COALESCE(item->>'item_name', 'Item'),
    item->>'sku',
    COALESCE((item->>'qty')::numeric, 0),
    COALESCE((item->>'unit_price')::numeric, 0),
    'original'
FROM public.credit_notes cn,
     jsonb_array_elements(cn.line_items->'original_lines') AS item
WHERE cn.line_items IS NOT NULL
  AND cn.line_items->'original_lines' IS NOT NULL
  AND jsonb_typeof(cn.line_items->'original_lines') = 'array';

-- Drop the JSON column
ALTER TABLE public.credit_notes
  DROP COLUMN IF EXISTS line_items;

CREATE INDEX idx_credit_note_lines_type ON public.credit_note_lines(credit_note_id, line_type);


-- ============================================================
-- 2) po_versions: create po_version_lines table to replace
--    the line_items JSON column
-- ============================================================

CREATE TABLE public.po_version_lines (
    id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    po_version_id  uuid NOT NULL REFERENCES public.po_versions(id) ON DELETE CASCADE,
    item_name      text NOT NULL,
    sku            text,
    qty            integer NOT NULL DEFAULT 0,
    received_qty   integer DEFAULT 0,
    unit           text NOT NULL DEFAULT 'pcs',
    unit_price     numeric NOT NULL DEFAULT 0,
    total_price    numeric NOT NULL DEFAULT 0,
    brand_variant_id uuid,
    tool_asset_item_id uuid,
    free_qty       integer DEFAULT 0 NOT NULL,
    brand_id       uuid,
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_po_version_lines_version ON public.po_version_lines(po_version_id);

-- Migrate existing JSON data into the new table
INSERT INTO public.po_version_lines (
    po_version_id, item_name, sku, qty, received_qty,
    unit, unit_price, total_price, brand_variant_id,
    tool_asset_item_id, free_qty, brand_id
)
SELECT
    pv.id AS po_version_id,
    COALESCE(item->>'item_name', 'Unknown')         AS item_name,
    item->>'sku'                                     AS sku,
    COALESCE((item->>'qty')::integer, 0)             AS qty,
    COALESCE((item->>'received_qty')::integer, 0)    AS received_qty,
    COALESCE(item->>'unit', 'pcs')                   AS unit,
    COALESCE((item->>'unit_price')::numeric, 0)      AS unit_price,
    COALESCE((item->>'total_price')::numeric, 0)     AS total_price,
    CASE WHEN item->>'brand_variant_id' IS NOT NULL
         AND item->>'brand_variant_id' != 'null'
         THEN (item->>'brand_variant_id')::uuid END  AS brand_variant_id,
    CASE WHEN item->>'tool_asset_item_id' IS NOT NULL
         AND item->>'tool_asset_item_id' != 'null'
         THEN (item->>'tool_asset_item_id')::uuid END AS tool_asset_item_id,
    COALESCE((item->>'free_qty')::integer, 0)        AS free_qty,
    CASE WHEN item->>'brand_id' IS NOT NULL
         AND item->>'brand_id' != 'null'
         THEN (item->>'brand_id')::uuid END           AS brand_id
FROM public.po_versions pv,
     jsonb_array_elements(pv.line_items) AS item
WHERE pv.line_items IS NOT NULL
  AND jsonb_typeof(pv.line_items) = 'array'
  AND jsonb_array_length(pv.line_items) > 0;

-- Drop the JSON column
ALTER TABLE public.po_versions
  DROP COLUMN line_items;


-- ============================================================
-- 3a) purchase_orders.supplier_id: text → uuid FK to suppliers
-- ============================================================

-- Add new uuid column
ALTER TABLE public.purchase_orders
  ADD COLUMN supplier_id_new uuid;

-- Populate from suppliers table by matching the text value as uuid
UPDATE public.purchase_orders po
SET supplier_id_new = s.id
FROM public.suppliers s
WHERE po.supplier_id::uuid = s.id;

-- For any rows where the text wasn't a valid uuid or didn't match,
-- try matching by supplier_name
UPDATE public.purchase_orders po
SET supplier_id_new = s.id
FROM public.suppliers s
WHERE po.supplier_id_new IS NULL
  AND po.supplier_name = s.name;

-- Swap columns
ALTER TABLE public.purchase_orders DROP COLUMN supplier_id;
ALTER TABLE public.purchase_orders RENAME COLUMN supplier_id_new TO supplier_id;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);


-- ============================================================
-- 3b) po_versions.supplier_id: text → uuid FK to suppliers
-- ============================================================

ALTER TABLE public.po_versions
  ADD COLUMN supplier_id_new uuid;

UPDATE public.po_versions pv
SET supplier_id_new = s.id
FROM public.suppliers s
WHERE pv.supplier_id::uuid = s.id;

UPDATE public.po_versions pv
SET supplier_id_new = s.id
FROM public.suppliers s
WHERE pv.supplier_id_new IS NULL
  AND pv.supplier_name = s.name;

ALTER TABLE public.po_versions DROP COLUMN supplier_id;
ALTER TABLE public.po_versions RENAME COLUMN supplier_id_new TO supplier_id;
ALTER TABLE public.po_versions
  ADD CONSTRAINT po_versions_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

CREATE INDEX idx_po_versions_supplier ON public.po_versions(supplier_id);


-- ============================================================
-- 3c) fifo_cost_layers.receival_id: text → uuid FK to receivals
-- ============================================================

ALTER TABLE public.fifo_cost_layers
  ADD COLUMN receival_id_new uuid;

UPDATE public.fifo_cost_layers fcl
SET receival_id_new = r.id
FROM public.receivals r
WHERE fcl.receival_id IS NOT NULL
  AND fcl.receival_id::uuid = r.id;

-- Fallback: match by receival_number
UPDATE public.fifo_cost_layers fcl
SET receival_id_new = r.id
FROM public.receivals r
WHERE fcl.receival_id_new IS NULL
  AND fcl.receival_id IS NOT NULL
  AND fcl.receival_number = r.receival_number;

ALTER TABLE public.fifo_cost_layers DROP COLUMN receival_id;
ALTER TABLE public.fifo_cost_layers RENAME COLUMN receival_id_new TO receival_id;
ALTER TABLE public.fifo_cost_layers
  ADD CONSTRAINT fifo_cost_layers_receival_id_fkey
    FOREIGN KEY (receival_id) REFERENCES public.receivals(id);

CREATE INDEX idx_fifo_cost_layers_receival ON public.fifo_cost_layers(receival_id);


-- ============================================================
-- Enable RLS on new table (match existing pattern)
-- ============================================================

ALTER TABLE public.po_version_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read po_version_lines"
  ON public.po_version_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert po_version_lines"
  ON public.po_version_lines FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete po_version_lines"
  ON public.po_version_lines FOR DELETE
  TO authenticated
  USING (true);

COMMIT;
