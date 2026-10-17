-- 20261090000000_po_band_role_match.sql
--
-- Per-band "Any one / All" approval mode for PO approval bands.
--
-- Adds po_approval_chain_tiers.role_match ('all' | 'any', default 'all'):
--   'all' - every required role in the band must approve (today's behaviour)
--   'any' - the first required role to approve satisfies the band; the band's
--           other roles' steps are marked superseded and drop off their queues.
--
-- The mode is snapshotted onto each PO's steps at submit (po_approvals.tier_match)
-- so later config edits do not change in-flight POs. po_approvals.superseded flags
-- the auto-resolved sibling steps.
--
-- Runtime: rpc_build_po_approval_steps snapshots tier_match; po_approval_action
-- (and the currently-unused advance_po_approval_tier) resolve 'any' bands on the
-- first approval and ignore superseded steps when deciding if the PO is fully
-- approved. Existing bands/steps default to 'all' + superseded=false -> no change.
--
-- The two large functions are patched in place over their live bodies
-- (drift-proof; prod == staging verified 2026-09-17), with assertions that abort
-- if an anchor fails to match. advance_po_approval_tier (dead today) is replaced
-- wholesale to keep it consistent.

BEGIN;

-- == Schema ===================================================================
ALTER TABLE public.po_approval_chain_tiers
  ADD COLUMN IF NOT EXISTS role_match text NOT NULL DEFAULT 'all';
ALTER TABLE public.po_approval_chain_tiers
  DROP CONSTRAINT IF EXISTS po_approval_chain_tiers_role_match_chk;
ALTER TABLE public.po_approval_chain_tiers
  ADD CONSTRAINT po_approval_chain_tiers_role_match_chk CHECK (role_match IN ('all','any'));

ALTER TABLE public.po_approvals
  ADD COLUMN IF NOT EXISTS tier_match text NOT NULL DEFAULT 'all';
ALTER TABLE public.po_approvals
  DROP CONSTRAINT IF EXISTS po_approvals_tier_match_chk;
ALTER TABLE public.po_approvals
  ADD CONSTRAINT po_approvals_tier_match_chk CHECK (tier_match IN ('all','any'));
ALTER TABLE public.po_approvals
  ADD COLUMN IF NOT EXISTS superseded boolean NOT NULL DEFAULT false;

-- == Patch rpc_build_po_approval_steps + po_approval_action in place ===========
DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  -- rpc_build_po_approval_steps: snapshot the band's role_match onto each step.
  v_def := pg_get_functiondef('public.rpc_build_po_approval_steps(uuid)'::regprocedure);
  v_new := replace(v_def,
    $q$INSERT INTO po_approvals (po_id, role, tier_rank, status, is_active, iteration)$q$,
    $q$INSERT INTO po_approvals (po_id, role, tier_rank, status, is_active, iteration, tier_match)$q$);
  v_new := replace(v_new,
    $q$SELECT p_po_id, r.role, t.rank, 'pending', true, v_iteration$q$,
    $q$SELECT p_po_id, r.role, t.rank, 'pending', true, v_iteration, t.role_match$q$);
  IF position($q$iteration, tier_match)$q$ in v_new) = 0
     OR position($q$v_iteration, t.role_match$q$ in v_new) = 0 THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: tier_match snapshot patch did not apply';
  END IF;
  EXECUTE v_new;

  -- po_approval_action:
  --   (1) read + guard `superseded` on the approved step,
  --   (2) resolve 'any' bands once one role approves,
  --   (3) ignore superseded steps when deciding completion.
  v_def := pg_get_functiondef('public.po_approval_action(uuid,uuid,text,text,uuid,text,text)'::regprocedure);

  v_new := replace(v_def,
    $q$SELECT tier_rank, iteration, role, status, is_active
      INTO v_step$q$,
    $q$SELECT tier_rank, iteration, role, status, is_active, superseded
      INTO v_step$q$);

  v_new := replace(v_new,
    $q$IF v_step.status != 'pending' OR v_step.is_active != true THEN$q$,
    $q$IF v_step.status != 'pending' OR v_step.is_active != true OR v_step.superseded THEN$q$);

  v_new := replace(v_new,
    $q$INTO v_adv_iteration
      FROM po_approvals WHERE po_id = p_po_id;$q$,
    $q$INTO v_adv_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    UPDATE po_approvals sib SET superseded = true
     WHERE sib.po_id = p_po_id AND sib.iteration = v_adv_iteration
       AND sib.tier_match = 'any' AND sib.status = 'pending'
       AND sib.is_active = true AND sib.superseded = false
       AND EXISTS (SELECT 1 FROM po_approvals a
                    WHERE a.po_id = sib.po_id AND a.iteration = sib.iteration
                      AND a.tier_rank = sib.tier_rank AND a.status = 'approved');$q$);

  v_new := replace(v_new,
    $q$AND is_active = true AND status != 'approved'
    ) INTO v_all_done;$q$,
    $q$AND is_active = true AND status != 'approved' AND superseded = false
    ) INTO v_all_done;$q$);

  IF position($q$is_active, superseded$q$ in v_new) = 0
     OR position($q$OR v_step.superseded THEN$q$ in v_new) = 0
     OR position($q$sib.tier_match = 'any'$q$ in v_new) = 0
     OR position($q$status != 'approved' AND superseded = false$q$ in v_new) = 0 THEN
    RAISE EXCEPTION 'po_approval_action: one or more any-band patches did not apply';
  END IF;
  EXECUTE v_new;
END
$do$;

-- == advance_po_approval_tier (dead today; kept consistent) ====================
CREATE OR REPLACE FUNCTION public.advance_po_approval_tier(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iteration  INT;
  v_next_rank  INT;
  v_all_done   BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  IF NOT EXISTS (SELECT 1 FROM po_approvals WHERE po_id = p_po_id AND iteration = (
    SELECT COALESCE(MAX(iteration), 1) FROM po_approvals WHERE po_id = p_po_id
  )) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders WHERE id = p_po_id AND status = 'pending_approval'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM po_approvals WHERE po_id = p_po_id;

  -- Resolve 'any' bands: once one role in an any-match band approves, its other
  -- pending roles are no longer required.
  UPDATE po_approvals sib SET superseded = true
   WHERE sib.po_id = p_po_id AND sib.iteration = v_iteration
     AND sib.tier_match = 'any' AND sib.status = 'pending'
     AND sib.is_active = true AND sib.superseded = false
     AND EXISTS (SELECT 1 FROM po_approvals a
                  WHERE a.po_id = sib.po_id AND a.iteration = sib.iteration
                    AND a.tier_rank = sib.tier_rank AND a.status = 'approved');

  SELECT NOT EXISTS (
    SELECT 1 FROM po_approvals
    WHERE po_id = p_po_id AND iteration = v_iteration
      AND is_active = true AND status NOT IN ('approved') AND superseded = false
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT MIN(tier_rank) INTO v_next_rank
  FROM po_approvals
  WHERE po_id = p_po_id AND iteration = v_iteration
    AND is_active = false AND status = 'pending';

  IF v_next_rank IS NOT NULL THEN
    UPDATE po_approvals SET is_active = true
    WHERE po_id = p_po_id AND iteration = v_iteration AND tier_rank = v_next_rank;
  ELSE
    UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
  END IF;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
