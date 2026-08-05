-- Warehouse Model v2 — Phase D.9 Task 1 follow-up
-- Bypass RLS on the sub-container totals view.
--
-- Discovered during smoke test: `fifo_cost_layers` has an RLS policy
-- (`sub_container_scope_select_r → is_sub_container_visible(...)`) that
-- filters sub-containers by the user's active division. A user scoped to
-- Maintenance division sees only Maintenance sub-container rows; Kitchen (a
-- different division) is hidden. That collapses the WhWarehousesTab
-- breakdown to a single row and the `>1` render guard skips it, so the
-- operator never sees the split they asked for.
--
-- For the landing card, showing every sub-container that physically holds
-- stock in a warehouse is more informative than restricting to the user's
-- division scope — the card answers "what does this warehouse contain",
-- not "what may this user act on". Set `security_invoker = false` so the
-- view runs as its owner (postgres, superuser) and bypasses RLS on the
-- underlying `fifo_cost_layers`.

BEGIN;

ALTER VIEW public.warehouse_sub_container_totals SET (security_invoker = false);

COMMIT;
