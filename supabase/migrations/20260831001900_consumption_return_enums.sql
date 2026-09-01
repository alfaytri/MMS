-- 20260831001900_consumption_return_enums.sql
-- Consumption returns (Phase 3b) — enum values, added ahead of the code that
-- uses them. PostgreSQL forbids using a new enum value in the same transaction
-- that adds it, so these live in their own migration (no BEGIN/COMMIT wrapper —
-- each ALTER TYPE ADD VALUE commits on its own) and 20260831002000 (the schema
-- + functions) references them afterward.
--   * return_source_type += 'consumption'  — so_po_returns can be sourced from a
--     consumption_entries row (alongside sale_order / purchase_order).
--   * stock_movement_type += 'consumption_return' — the re-layer stock movement
--     when good stock comes back from a consumption (mirrors 'sale_return').
ALTER TYPE public.return_source_type ADD VALUE IF NOT EXISTS 'consumption';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'consumption_return';
