-- Retire per-division scoping on customers + suppliers.
--
-- Master-data parties are shared across the organisation. Every operator,
-- regardless of their division scope, needs to see and manage them.
--
-- Reverses:
--   • 20260815010200_customers_division_ids_array.sql    (customers.division_ids uuid[])
--   • 20260806270000_division_scope_customers_suppliers.sql (suppliers.division_id + RLS on both)
--
-- Keeps the underlying `is_division_visible(uuid)` helper — many other
-- tables still depend on it (SOs, invoices, POs, warehouses, etc.).
-- Drops the array-aware `is_any_division_visible(uuid[])` since customers
-- was the only caller.

BEGIN;

-- ── Customers ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS division_scope_select_r ON public.customers;
DROP POLICY IF EXISTS division_scope_insert_r ON public.customers;
DROP POLICY IF EXISTS division_scope_update_r ON public.customers;
DROP POLICY IF EXISTS division_scope_delete_r ON public.customers;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_division_ids_non_empty;

DROP INDEX IF EXISTS public.customers_division_ids_gin;
DROP INDEX IF EXISTS public.customers_division_id_idx;

ALTER TABLE public.customers DROP COLUMN IF EXISTS division_ids;
ALTER TABLE public.customers DROP COLUMN IF EXISTS division_id;

-- ── Suppliers ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS division_scope_select_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_insert_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_update_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_delete_r ON public.suppliers;

DROP INDEX IF EXISTS public.suppliers_division_id_idx;

ALTER TABLE public.suppliers DROP COLUMN IF EXISTS division_id;

-- ── Retire the array visibility helper — customers was the only caller. ─
DROP FUNCTION IF EXISTS public.is_any_division_visible(uuid[]);

COMMIT;

NOTIFY pgrst, 'reload schema';
