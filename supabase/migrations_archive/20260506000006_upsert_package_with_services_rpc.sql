-- supabase/migrations/20260506000006_upsert_package_with_services_rpc.sql

CREATE OR REPLACE FUNCTION upsert_package_with_services(
  p_package  jsonb,
  p_services jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (p_package->>'id') IS NOT NULL THEN
    -- UPDATE existing package
    v_id := (p_package->>'id')::uuid;
    UPDATE subscription_packages SET
      name               = p_package->>'name',
      name_ar            = NULLIF(p_package->>'name_ar', ''),
      description        = NULLIF(p_package->>'description', ''),
      discount_percent   = (p_package->>'discount_percent')::numeric,
      initial_fee        = (p_package->>'initial_fee')::numeric,
      duration_months    = (p_package->>'duration_months')::int,
      priority_response  = p_package->>'priority_response',
      response_hours     = CASE
                             WHEN p_package->>'response_hours' IS NULL THEN NULL
                             ELSE (p_package->>'response_hours')::int
                           END,
      auto_renew_default = (p_package->>'auto_renew_default')::boolean,
      updated_at         = now()
    WHERE id = v_id;
  ELSE
    -- INSERT new package
    INSERT INTO subscription_packages (
      name, name_ar, description,
      discount_percent, initial_fee, duration_months,
      priority_response, response_hours, auto_renew_default,
      created_by_name
    ) VALUES (
      p_package->>'name',
      NULLIF(p_package->>'name_ar', ''),
      NULLIF(p_package->>'description', ''),
      (p_package->>'discount_percent')::numeric,
      (p_package->>'initial_fee')::numeric,
      (p_package->>'duration_months')::int,
      p_package->>'priority_response',
      CASE
        WHEN p_package->>'response_hours' IS NULL THEN NULL
        ELSE (p_package->>'response_hours')::int
      END,
      (p_package->>'auto_renew_default')::boolean,
      NULLIF(p_package->>'created_by_name', '')
    )
    RETURNING id INTO v_id;
  END IF;

  -- Atomically replace all services for this package
  DELETE FROM subscription_package_services WHERE package_id = v_id;

  INSERT INTO subscription_package_services (package_id, service_id, discount_override)
  SELECT
    v_id,
    (svc->>'service_id')::uuid,
    CASE
      WHEN svc->>'discount_override' IS NULL THEN NULL
      ELSE (svc->>'discount_override')::numeric
    END
  FROM jsonb_array_elements(p_services) AS svc;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION upsert_package_with_services(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_package_with_services(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_package_with_services(jsonb, jsonb) TO service_role;
