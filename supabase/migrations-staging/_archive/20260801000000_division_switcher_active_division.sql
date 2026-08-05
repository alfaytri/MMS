-- PR #2 — Division switcher: server side
--
-- Adds the "active division" concept as a JWT claim + user_data column,
-- extends is_division_visible() to honour it, adds set_active_division() RPC,
-- and adds a safety trigger that nulls the active choice if the user loses
-- access to that division.
--
-- Spec: docs/division-switcher-design.md
-- Prereq: PR #1 migration 20260731000000_rls_division_scope_backfill.sql

-- =============================================================================
-- 1. Column: user_data.active_division_id
--    NULL = "All divisions" (super-viewer default) or "not yet chosen" (new user).
--    Non-NULL = the single division the user is currently narrowed to.
--    ON DELETE SET NULL — if the division itself is deactivated/removed,
--    users' active choice silently falls back to "All".
-- =============================================================================
ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS active_division_id uuid
    REFERENCES public.company_divisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_data.active_division_id IS
  'Currently-selected division for the user. NULL = "All" (super-viewer) or unset. Written by rpc set_active_division and read by custom_access_token_hook into the JWT claim active_division_id.';


-- =============================================================================
-- 2. is_division_visible(uuid) — extend to honour active_division_id claim
--
-- Behaviour matrix (row_division_id vs caller):
--   Row NULL                               → visible to everyone with access
--   Super-viewer, no active claim          → sees every division
--   Super-viewer, active claim set         → sees only that division
--   Regular user, no active claim          → sees all their access set
--   Regular user, active claim set         → sees only that division (still gated
--                                            by access set — set_active_division
--                                            enforces access at write time too)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT
      auth.jwt() ->> 'user_type'                             AS user_type,
      NULLIF(auth.jwt() ->> 'active_division_id', '')::uuid  AS active_div
  )
  SELECT
    row_division_id IS NULL
    OR (
      (SELECT user_type FROM c) IN ('owner', 'accountant')
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    )
    OR (
      row_division_id = ANY(
        ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::UUID[]
      )
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    );
$$;


-- =============================================================================
-- 3. custom_access_token_hook — inject active_division_id claim
--    Body is otherwise identical to the live 2026-06-27-era version.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_type          TEXT;
  v_division_ids       UUID[];
  v_active_division_id UUID;
  claims               JSONB;
BEGIN
  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL),
    MAX(p.active_division_id)   -- one row per profile after GROUP BY p.id; MAX is a safe passthrough
  INTO   v_user_type, v_division_ids, v_active_division_id
  FROM   user_data p
  LEFT JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles           cr  ON cr.id          = ucr.role_id
                                       AND cr.is_approval_slot = true
                                       AND cr.deleted_at IS NULL
  LEFT JOIN user_company_divisions ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));
  claims := jsonb_set(
    claims,
    '{active_division_id}',
    CASE WHEN v_active_division_id IS NOT NULL
      THEN to_jsonb(v_active_division_id::text)
      ELSE 'null'::jsonb
    END
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;


-- =============================================================================
-- 4. set_active_division(uuid) — RPC that the client calls when the user picks
--    a division. Validates the target is either a real active company_division
--    (super-viewer) or actually in the caller's access set (regular user).
--    NULL clears active (= "All divisions").
--    Caller must refresh their session after this call to pick up the new
--    JWT claim.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_active_division(p_division_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_user_type  text;
  v_allowed    boolean;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF p_division_id IS NULL THEN
    UPDATE user_data SET active_division_id = NULL WHERE id = v_profile_id;
    RETURN;
  END IF;

  v_user_type := auth.jwt() ->> 'user_type';

  IF v_user_type IN ('owner', 'accountant') THEN
    v_allowed := EXISTS (
      SELECT 1 FROM company_divisions WHERE id = p_division_id AND is_active
    );
  ELSE
    v_allowed := EXISTS (
      SELECT 1 FROM user_company_divisions ucd
      JOIN company_divisions cd ON cd.id = ucd.division_id
      WHERE ucd.profile_id = v_profile_id
        AND ucd.division_id = p_division_id
        AND cd.is_active
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Division % is not accessible to this user', p_division_id;
  END IF;

  UPDATE user_data SET active_division_id = p_division_id WHERE id = v_profile_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.set_active_division(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_active_division(uuid) TO authenticated, service_role;


-- =============================================================================
-- 5. Safety trigger: if a user_company_divisions row is deleted (user loses
--    access to a division), null out active_division_id on user_data if that
--    was their active choice. Prevents a stale JWT claim from silently
--    filtering their view to a division they can no longer see anything from.
-- =============================================================================
CREATE OR REPLACE FUNCTION public._trg_clear_active_on_division_removal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE user_data
     SET active_division_id = NULL
   WHERE id = OLD.profile_id
     AND active_division_id = OLD.division_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_active_on_division_removal ON public.user_company_divisions;
CREATE TRIGGER trg_clear_active_on_division_removal
  AFTER DELETE ON public.user_company_divisions
  FOR EACH ROW EXECUTE FUNCTION public._trg_clear_active_on_division_removal();
