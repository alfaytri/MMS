-- ============================================================
-- Fix duplicate FK constraints + add missing FK constraints
--
-- Issue 1: warehouse_stock_allocations has duplicate FK constraints
--   Baseline created *_brand_variant_id_fkey and *_warehouse_id_fkey (ON DELETE CASCADE)
--   Migration 20260715200000 added short-name duplicates without CASCADE
--   → Drop the short-name duplicates
--
-- Issue 3: customer_blocks.customer_id has no FK
--   Baseline FK pointed to service_customers(id) which was removed
--   → Add FK to customers(id) ON DELETE CASCADE
--
-- Issue 4: warehouse_manager_log.manager_id has no FK
--   Baseline FK pointed to employees(id) which was removed
--   → Add FK to profiles(id)
-- ============================================================

BEGIN;

-- ── Issue 1: Drop duplicate FK constraints on warehouse_stock_allocations ──

ALTER TABLE public.warehouse_stock_allocations
  DROP CONSTRAINT IF EXISTS warehouse_stock_alloc_brand_variant_id_fkey;

ALTER TABLE public.warehouse_stock_allocations
  DROP CONSTRAINT IF EXISTS warehouse_stock_alloc_warehouse_id_fkey;

-- ── Issue 3: Add FK customer_blocks.customer_id → customers.id ──

DO $$
BEGIN
  -- Drop any stale FK pointing to the old service_customers table
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_blocks_customer_id_fkey'
  ) THEN
    ALTER TABLE public.customer_blocks
      DROP CONSTRAINT customer_blocks_customer_id_fkey;
  END IF;

  ALTER TABLE public.customer_blocks
    ADD CONSTRAINT customer_blocks_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
END $$;

-- ── Issue 4: Add FK warehouse_manager_log.manager_id → profiles.id ──

DO $$
BEGIN
  -- Drop any stale FK pointing to the old employees table
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_manager_log_manager_id_fkey'
  ) THEN
    ALTER TABLE public.warehouse_manager_log
      DROP CONSTRAINT warehouse_manager_log_manager_id_fkey;
  END IF;

  ALTER TABLE public.warehouse_manager_log
    ADD CONSTRAINT warehouse_manager_log_manager_id_fkey
      FOREIGN KEY (manager_id) REFERENCES public.profiles(id);
END $$;

COMMIT;
