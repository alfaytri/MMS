-- Background fix batch (2026-08-05):
--   Six-domains H2  — create_sale_order intent check accepts 'quotation'
--                     (18-arg + 17-arg overloads) so the frontend value
--                     doesn't silently auto-confirm the SO.
--   Money-path  H7  — BEFORE UPDATE trigger on landed_costs blocks the void
--                     path when applied_at IS NOT NULL and revert has not
--                     run — the client-side hook was RLS-bypassable via the
--                     anon key + direct HTTP.

-- ── H2 six-domains: create_sale_order intent check ─────────────────────────
--
-- Both overloads previously checked p_intent = 'save_quote'. The frontend
-- type union uses 'quotation' — passing that value fell through the credit
-- and quotation branches and silently INSERTed status='confirmed'.
--
-- Uses pg_get_functiondef + regexp_replace so we don't have to reproduce
-- the ~150-line function bodies verbatim in this migration.

DO $rewrite$
DECLARE
  v_oid  oid;
  v_def  text;
  v_new  text;
BEGIN
  FOR v_oid IN
    SELECT p.oid
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'create_sale_order'
  LOOP
    v_def := pg_get_functiondef(v_oid);

    -- Match either the exact save_quote comparison or the CASE arm used by
    -- the 17-arg overload. Replace with an IN-list that accepts both
    -- 'save_quote' (legacy) and 'quotation' (frontend).
    v_new := regexp_replace(
      v_def,
      'p_intent\s*=\s*''save_quote''',
      'p_intent IN (''save_quote'', ''quotation'')',
      'g'
    );

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
      RAISE NOTICE 'H2: rewrote create_sale_order overload %', v_oid;
    ELSE
      RAISE NOTICE 'H2: no change needed for create_sale_order overload % (already patched or different shape)', v_oid;
    END IF;
  END LOOP;
END $rewrite$;

-- ── H7 money: void LC trigger ───────────────────────────────────────────────
--
-- useVoidLandedCost was a plain client-side UPDATE with RLS USING(true)
-- WITH CHECK(true) — any authenticated user could POST-void an already
-- applied LC. That leaves FIFO layers boosted (landed_cost_per_unit stays
-- added), COGS retroactively booked, and revert_snapshot never consumed.
--
-- Trigger: refuse the UPDATE when trying to set voided_at while applied_at
-- is not null AND revert_snapshot has not been cleared/consumed. To void
-- an applied LC, go through revert_landed_cost first (which then clears
-- applied_at and applies the reversing entries).

CREATE OR REPLACE FUNCTION public.trg_fn_landed_cost_block_void_after_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only care about transitions that turn voided_at ON from OFF.
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    IF OLD.applied_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot void landed cost % — it is already applied. Run revert_landed_cost first, then void.',
        OLD.lc_number
        USING ERRCODE = 'restrict_violation',
              HINT    = 'revert_landed_cost undoes the FIFO/COGS impact; after it succeeds applied_at is cleared and voiding is permitted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_landed_cost_block_void_after_apply ON public.landed_costs;
CREATE TRIGGER trg_landed_cost_block_void_after_apply
  BEFORE UPDATE ON public.landed_costs
  FOR EACH ROW
  WHEN (NEW.voided_at IS DISTINCT FROM OLD.voided_at)
  EXECUTE FUNCTION public.trg_fn_landed_cost_block_void_after_apply();

NOTIFY pgrst, 'reload schema';
