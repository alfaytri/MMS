-- ============================================================
-- Staging-only: Drop tables not used in Inventory Staging
-- These belong to Orders/TL module and Contracts module
-- which are not part of this deployment.
-- ============================================================

BEGIN;

-- ── 1. Drop tl_* tables (Orders / Team Leader invoicing module) ─────────────
-- Drop in FK-dependency order: children first, parents last

-- 1a. tl_invoice_lines (created by normalize migration, FK → tl_invoices)
DROP TABLE IF EXISTS public.tl_invoice_lines CASCADE;

-- 1b. tl_payment_batch_items (FK → tl_payment_batches + tl_invoices)
DROP TABLE IF EXISTS public.tl_payment_batch_items CASCADE;

-- 1c. tl_payment_batches (no inbound FKs after batch_items dropped)
DROP TABLE IF EXISTS public.tl_payment_batches CASCADE;

-- 1d. tl_invoices (no inbound FKs after lines + batch_items dropped)
DROP TABLE IF EXISTS public.tl_invoices CASCADE;

-- 1e. Drop related functions and sequence
DROP FUNCTION IF EXISTS public.generate_tl_invoice_number() CASCADE;
DROP FUNCTION IF EXISTS public.update_tl_payment_batches_updated_at() CASCADE;
DROP SEQUENCE IF EXISTS public.tl_invoice_seq;


-- ── 2. Drop pricing_factors / contract_pricing_factors (Contracts module) ────
-- The rename migration (20260721100002) already ran on staging,
-- so the table is now contract_pricing_factors with a pricing_factors view.

DROP VIEW IF EXISTS public.pricing_factors;
DROP TABLE IF EXISTS public.contract_pricing_factors CASCADE;


-- ── 3. Drop brand_groups (standalone admin feature, no P/S/W/I dependency) ──
-- brand_group_members FK → brand_groups, so drop child first

DROP TABLE IF EXISTS public.brand_group_members CASCADE;
DROP TABLE IF EXISTS public.brand_groups CASCADE;

COMMIT;
