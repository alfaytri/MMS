-- Repair is_contract_visible(uuid): branch (a) referenced custom_roles.is_system,
-- a column that does not exist in the live schema (the column is is_system_admin).
-- The predicate therefore errored whenever it ran. It was previously wired to
-- nothing so the breakage was latent; it is now used by contract_board_summary()
-- and by the contract RLS policies, so it must actually work.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    -- (a) System admin custom role
    EXISTS (
      SELECT 1
      FROM user_data p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      WHERE p.auth_user_id = auth.uid()
        AND cr.is_system_admin = true
    )
    OR
    -- (b) Super-viewer (owner / accountant) via JWT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- (c) Has any contracts permission AND division overlap
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN user_data p ON p.auth_user_id = auth.uid()
      JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
      JOIN custom_roles           cr  ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      JOIN user_company_divisions ud  ON ud.profile_id = p.id
      JOIN company_divisions      d   ON d.id = ud.division_id
      WHERE c.id = p_contract_id
        AND d.slug = ANY(c.divisions)
        AND (
          'contracts.quotations.view'   = ANY(cr.permissions) OR
          'contracts.quotations.manage' = ANY(cr.permissions) OR
          'contracts.live.view'         = ANY(cr.permissions) OR
          'contracts.live.manage'       = ANY(cr.permissions) OR
          'contracts.activate'          = ANY(cr.permissions)
        )
    )
    OR
    -- (d) Legacy JWT-based division match
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN company_divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
