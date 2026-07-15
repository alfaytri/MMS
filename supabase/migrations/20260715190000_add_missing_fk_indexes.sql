-- ============================================================
-- Add missing indexes on FK columns
-- High-traffic tables first, then new normalized tables
-- ============================================================

-- ── High-priority: core line-item tables ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sale_order_lines_sale_order
  ON public.sale_order_lines(sale_order_id);

CREATE INDEX IF NOT EXISTS idx_sale_order_lines_brand_variant
  ON public.sale_order_lines(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_po_line_items_po
  ON public.po_line_items(po_id);

CREATE INDEX IF NOT EXISTS idx_po_line_items_brand_variant
  ON public.po_line_items(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
  ON public.invoice_line_items(invoice_id);


-- ── Medium-priority: existing child tables ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_transfer
  ON public.warehouse_transfer_items(transfer_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_brand_variant
  ON public.warehouse_transfer_items(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_receival_items_brand_variant
  ON public.receival_items(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_receival_items_po_line_item
  ON public.receival_items(po_line_item_id);


-- ── Low-priority: new normalized tables (secondary FK columns) ──────────────

CREATE INDEX IF NOT EXISTS idx_po_version_lines_brand_variant
  ON public.po_version_lines(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_return_lines_brand_variant
  ON public.return_lines(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_sale_delivery_lines_brand_variant
  ON public.sale_delivery_lines(brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_landed_cost_item_alloc_brand_variant
  ON public.landed_cost_item_allocations(brand_variant_id);
