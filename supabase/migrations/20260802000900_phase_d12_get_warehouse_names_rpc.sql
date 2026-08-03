-- Phase D.12 Task 5 follow-up — warehouse name lookup for cross-division stock
--
-- When Kitchen consumes shared Maintenance stock, the delivery-related UIs
-- surface stock rows keyed by warehouse_id. But the `warehouses` table has
-- division-scoped RLS (from the Division Switcher backfill), so a direct
-- .from('warehouses').in('id', ids) returns empty for cross-division rows,
-- rendering "?" as the fallback label.
--
-- Warehouse names are not sensitive; if the caller can already see the stock
-- (via warehouse_stock_view) it's reasonable to also let them read the
-- warehouse name. This RPC returns just {id, name} for a given list of IDs
-- with SECURITY DEFINER so RLS doesn't strip cross-division rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_warehouse_names(p_ids uuid[])
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT w.id, w.name
  FROM   public.warehouses w
  WHERE  w.id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_warehouse_names(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_warehouse_names(uuid[]) IS
'Phase D.12 Task 5 — returns {id, name} pairs for a list of warehouse ids, bypassing division RLS.
Safe because warehouse names are not sensitive; used to resolve labels on stock rows the caller
can already see through warehouse_stock_view.';

NOTIFY pgrst, 'reload schema';

COMMIT;
