-- Division-scope customers + suppliers.
--
-- Follow-up to migration 20260731000000 which added division_scope_*
-- restrictive policies to every table with a division_id column. At the
-- time customers and suppliers had no division_id — they were treated as
-- shared / global. Operators asked to gate them per-division, matching
-- the pattern already in effect for invoices/bills/payments/POs/SOs.
--
-- Strategy:
--   1. Add nullable division_id to both tables. NULL = global entity
--      (visible to every division). is_division_visible() already
--      returns true when row_division_id IS NULL, so global entities
--      keep working without any policy exception.
--   2. Backfill from history: if every SO for a customer is in one
--      division, stamp that division. Same for POs → supplier. Mixed-
--      history entities stay NULL (global). Entities with no history
--      also stay NULL.
--   3. Add RESTRICTIVE RLS policies mirroring the 20260731000000
--      pattern. RESTRICTIVE policies AND with existing permissive
--      rules (customer/supplier create/read/update policies already
--      exist and stay), so no drops needed.

BEGIN;

-- ── 1. Add nullable division_id ───────────────────────────────────────

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);

CREATE INDEX IF NOT EXISTS customers_division_id_idx
  ON public.customers(division_id)
  WHERE division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_division_id_idx
  ON public.suppliers(division_id)
  WHERE division_id IS NOT NULL;

COMMENT ON COLUMN public.customers.division_id IS
'FK to company_divisions. NULL = global (visible to every division).
Backfilled from sale_orders history when the customer''s SOs all live
in one division; mixed-division customers stay NULL.';

COMMENT ON COLUMN public.suppliers.division_id IS
'FK to company_divisions. NULL = global (visible to every division).
Backfilled from purchase_orders history when the supplier''s POs all
live in one division; mixed-division suppliers stay NULL.';

-- ── 2. Backfill from history ─────────────────────────────────────────

-- Customers: stamp division_id if every non-cancelled SO of the
-- customer lives in one division; leave NULL otherwise. Postgres has
-- no MIN(uuid) aggregate — use array_agg(DISTINCT ...) and pick the
-- single element.
WITH customer_divisions AS (
  SELECT customer_id,
         array_agg(DISTINCT division_id) AS divs
  FROM public.sale_orders
  WHERE deleted_at IS NULL
    AND division_id IS NOT NULL
    AND customer_id IS NOT NULL
  GROUP BY customer_id
)
UPDATE public.customers c
   SET division_id = cd.divs[1]
  FROM customer_divisions cd
 WHERE cd.customer_id = c.id
   AND array_length(cd.divs, 1) = 1
   AND c.division_id IS NULL;

-- Suppliers: same logic on purchase_orders. supplier_id is uuid.
WITH supplier_divisions AS (
  SELECT supplier_id,
         array_agg(DISTINCT division_id) AS divs
  FROM public.purchase_orders
  WHERE deleted_at IS NULL
    AND division_id IS NOT NULL
    AND supplier_id IS NOT NULL
  GROUP BY supplier_id
)
UPDATE public.suppliers s
   SET division_id = sd.divs[1]
  FROM supplier_divisions sd
 WHERE sd.supplier_id = s.id
   AND array_length(sd.divs, 1) = 1
   AND s.division_id IS NULL;

-- ── 3. Restrictive RLS policies ──────────────────────────────────────

DROP POLICY IF EXISTS division_scope_select_r ON public.customers;
DROP POLICY IF EXISTS division_scope_insert_r ON public.customers;
DROP POLICY IF EXISTS division_scope_update_r ON public.customers;
DROP POLICY IF EXISTS division_scope_delete_r ON public.customers;

CREATE POLICY division_scope_select_r ON public.customers
  AS RESTRICTIVE FOR SELECT
  USING (public.is_division_visible(division_id));

CREATE POLICY division_scope_insert_r ON public.customers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY division_scope_update_r ON public.customers
  AS RESTRICTIVE FOR UPDATE
  USING      (public.is_division_visible(division_id))
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY division_scope_delete_r ON public.customers
  AS RESTRICTIVE FOR DELETE
  USING (public.is_division_visible(division_id));

DROP POLICY IF EXISTS division_scope_select_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_insert_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_update_r ON public.suppliers;
DROP POLICY IF EXISTS division_scope_delete_r ON public.suppliers;

CREATE POLICY division_scope_select_r ON public.suppliers
  AS RESTRICTIVE FOR SELECT
  USING (public.is_division_visible(division_id));

CREATE POLICY division_scope_insert_r ON public.suppliers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY division_scope_update_r ON public.suppliers
  AS RESTRICTIVE FOR UPDATE
  USING      (public.is_division_visible(division_id))
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY division_scope_delete_r ON public.suppliers
  AS RESTRICTIVE FOR DELETE
  USING (public.is_division_visible(division_id));

COMMIT;
