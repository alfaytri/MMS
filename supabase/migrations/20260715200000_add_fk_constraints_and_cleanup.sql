-- ============================================================
-- Add missing FK constraints, drop orphan column, add PK
-- ============================================================

BEGIN;

-- ── 1) Add FK constraints on brand_variant_id columns ───────────────────────
-- These columns store inventory_brand_variants IDs but had no FK constraint
-- because they were migrated from unstructured JSONB data.

ALTER TABLE public.return_lines
  ADD CONSTRAINT return_lines_brand_variant_id_fkey
    FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);

ALTER TABLE public.sale_delivery_lines
  ADD CONSTRAINT sale_delivery_lines_brand_variant_id_fkey
    FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);

ALTER TABLE public.landed_cost_item_allocations
  ADD CONSTRAINT landed_cost_item_alloc_brand_variant_id_fkey
    FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


-- ── 2) Drop orphan column sale_order_lines.item_id ──────────────────────────
-- Legacy text column with no FK constraint and zero app code references.
-- brand_variant_id (uuid FK) is the canonical relationship.

ALTER TABLE public.sale_order_lines
  DROP COLUMN IF EXISTS item_id;


-- ── 3) Add FK constraints to warehouse_stock_allocations ────────────────────
-- Table already has a PK; just add FK constraints if missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stock_alloc_warehouse_id_fkey'
  ) THEN
    ALTER TABLE public.warehouse_stock_allocations
      ADD CONSTRAINT warehouse_stock_alloc_warehouse_id_fkey
        FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stock_alloc_brand_variant_id_fkey'
  ) THEN
    ALTER TABLE public.warehouse_stock_allocations
      ADD CONSTRAINT warehouse_stock_alloc_brand_variant_id_fkey
        FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);
  END IF;
END $$;

COMMIT;
