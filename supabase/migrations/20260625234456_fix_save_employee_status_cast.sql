-- Fix save_employee: cast p_status text to employee_status enum.
-- The old overloads (dropped in previous migration) had SECURITY DEFINER
-- which masked this type mismatch. The remaining overload needs an explicit cast.

CREATE OR REPLACE FUNCTION public.save_employee(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_nationality text,
  p_join_date date,
  p_status text,
  p_avatar_url text,
  p_service_ids uuid[],
  p_division_id uuid DEFAULT NULL::uuid
) RETURNS public.employees
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name        = p_name,
    phone       = p_phone,
    nationality = p_nationality,
    join_date   = p_join_date,
    status      = p_status::employee_status,
    avatar_url  = p_avatar_url,
    division_id = p_division_id
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$$;
