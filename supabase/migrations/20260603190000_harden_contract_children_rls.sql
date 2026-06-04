-- Harden contract_services / contract_milestones RLS so the
-- "new row violates row-level security policy" error can never recur.
--
-- Strategy: defense-in-depth. The visibility helper now passes if ANY of:
--   (a) The caller has the system Admin role     (custom_roles.is_system = true)
--   (b) The caller has user_type owner/accountant (JWT super-viewer)
--   (c) The caller has any contracts.* permission via a custom role
--       AND the contract's divisions[] overlaps the caller's divisions
--   (d) Legacy JWT-based division match (existing path)
--
-- This guarantees:
--   • Admins are NEVER blocked, even if the JWT custom-token hook is unregistered
--   • Users with proper permissions can always write children rows for their own divisions
--   • Cross-division access stays blocked for non-super-viewers

CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- (a) System Admin role — fallback that works WITHOUT JWT claims
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      WHERE p.auth_user_id = auth.uid()
        AND cr.is_system = true
    )
    OR
    -- (b) Super-viewer (owner / accountant) via JWT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- (c) Has any contracts permission AND division overlap (DB-side, robust)
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = p_contract_id
        AND d.slug = ANY(c.divisions)
        AND (
          'contracts.view'     = ANY(cr.permissions) OR
          'contracts.create'   = ANY(cr.permissions) OR
          'contracts.edit'     = ANY(cr.permissions) OR
          'contracts.activate' = ANY(cr.permissions)
        )
    )
    OR
    -- (d) Legacy JWT-based division match (fast path when JWT hook is active)
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$$;
