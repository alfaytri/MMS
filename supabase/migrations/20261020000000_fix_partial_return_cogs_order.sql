-- 20261020000000_fix_partial_return_cogs_order.sql
--
-- MONEY BUG FIX (MEDIUM, M2). When a sale (or consumption) is partially returned,
-- the restock + COGS-reversal walk the source cogs_entries with:
--     ORDER BY date ASC, unit_cost ASC, id ASC
-- Every cogs_entry of one delivery carries the SAME date (the delivery date — see
-- complete_delivery_inventory, which stamps v_date on all layers), so `date ASC`
-- ties and the EFFECTIVE primary sort is `unit_cost ASC` = cheapest-cost-first.
-- On a PARTIAL return that reverses/restocks the cheapest layers first, which
-- mis-states reversed COGS (and thus margin) and the restocked inventory value:
-- sell 6@10 + 4@14, return 4 → it reverses 4@10 (=40) instead of matching the
-- units actually returned.
--
-- Fix: drop the `unit_cost ASC` tie-break, leaving `date ASC, id ASC`. `id ASC`
-- is the cogs_entries' insertion order, i.e. the FIFO order in which the sale
-- consumed its layers — so a return now reverses in the same order the sale was
-- booked, removing the cheapest-first bias. (Which physical units came back is
-- not tracked; FIFO-consumption order is the non-arbitrary convention.)
--
-- Applied to the three return functions that carry this ordering, on their LIVE
-- bodies (via pg_get_functiondef + EXECUTE — the same in-place transform the repo
-- already uses in 20260723160000). This is drift-safe: it edits whatever is
-- actually deployed, and preserves each function's security/search_path/grants.

DO $do$
DECLARE
  r        record;
  new_def  text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname IN (
             'rpc_process_return_restock',
             '_reverse_sale_cogs_for_return',
             'rpc_process_consumption_return_restock'
           )
  LOOP
    new_def := regexp_replace(
      r.def,
      'date\s+ASC\s*,\s*unit_cost\s+ASC\s*,\s*id\s+ASC',
      'date ASC, id ASC',
      'g'
    );
    IF new_def IS DISTINCT FROM r.def THEN
      EXECUTE new_def;
      RAISE NOTICE 'M2: removed cheapest-first return tie-break from %(oid %)', r.proname, r.oid;
    ELSE
      RAISE NOTICE 'M2: no matching ORDER BY in % — left unchanged', r.proname;
    END IF;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
