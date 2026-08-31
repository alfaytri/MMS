-- 20261021000000_m3a_lc_match_by_receival_tag.sql  (M3, part a/c)
--
-- Landed cost must follow stock even after it's moved. allocate_landed_cost
-- decided "how many of a receival are still in stock" and "which layers get the
-- per-unit uplift" by matching fifo layers on source_type='receival'. Moved
-- stock (custody assign / transfer) lands in a NON-receival layer, so it was
-- wrongly counted as SOLD (over-expensing LC to COGS) and never got the uplift.
--
-- Every fifo layer already has a receival_id tag (set only by receivals). The
-- companion migrations make custody/transfer destination layers INHERIT that
-- tag. Here we make allocate match by the tag: at the two spots that (1) count
-- remaining in-stock qty and (2) apply the uplift, drop the source_type filter
-- and rely on receival_id. The third spot (division of the sold-units COGS) is
-- deliberately LEFT on source_type='receival' so the loss stays attributed to
-- the receiving division — that query is not preceded by `remaining_qty > 0`,
-- so the anchored transform below does not touch it.
--
-- Done as an in-place transform on the live body (pg_get_functiondef + EXECUTE,
-- the repo's own idiom) — drift-safe, preserves security/search_path/grants.
-- Aborts loudly if the expected pattern isn't present (no silent no-op).

DO $do$
DECLARE
  v_def text;
  v_new text;
  v_cnt int;
  v_pat text := '(fcl\.remaining_qty\s*>\s*0)\s+AND\s+fcl\.source_type\s*=\s*''receival''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'allocate_landed_cost';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'M3a: allocate_landed_cost not found';
  END IF;

  -- Expect EXACTLY 2 matches: the in-stock count + the uplift query. The
  -- division-rep query has no `remaining_qty > 0` predicate, so it never
  -- matches. Fail loudly on anything else (formatting drift / already applied).
  SELECT count(*) INTO v_cnt FROM regexp_matches(v_def, v_pat, 'g');
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'M3a: expected 2 in-stock/uplift matches in allocate_landed_cost, found % — aborting with no change', v_cnt;
  END IF;

  -- Remove `AND fcl.source_type = 'receival'` ONLY where it immediately follows
  -- `fcl.remaining_qty > 0`, so moved stock (tagged by receival_id) is counted
  -- in-stock and gets the uplift. The division-rep query is untouched.
  v_new := regexp_replace(v_def, v_pat, '\1', 'g');

  EXECUTE v_new;
  RAISE NOTICE 'M3a: allocate_landed_cost now counts/uplifts in-stock layers by receival_id (tag), including moved stock';
END
$do$;

NOTIFY pgrst, 'reload schema';
