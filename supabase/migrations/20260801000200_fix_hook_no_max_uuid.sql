-- Fix: previous version of custom_access_token_hook used MAX(uuid) inside the
-- role/division aggregation to pass through active_division_id, but Postgres
-- has no max(uuid) aggregate — the function threw at every token issuance:
--   ERROR: 42883: function max(uuid) does not exist
--
-- Fix: read active_division_id in a separate simple SELECT before the role
-- aggregation. Cleaner and avoids fighting the aggregator rules.

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
  SELECT active_division_id
    INTO v_active_division_id
  FROM user_data
  WHERE auth_user_id = (event ->> 'user_id')::UUID;

  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
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
