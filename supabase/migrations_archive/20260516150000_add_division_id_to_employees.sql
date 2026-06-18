-- Add division_id FK to employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_division ON employees (division_id);

-- Recreate save_employee with division_id support (new param has a default so old callers still work)
CREATE OR REPLACE FUNCTION save_employee(
  p_employee_id UUID,
  p_name        TEXT,
  p_phone       TEXT,
  p_nationality TEXT,
  p_join_date   DATE,
  p_status      TEXT,
  p_avatar_url  TEXT,
  p_service_ids UUID[],
  p_division_id UUID DEFAULT NULL
)
RETURNS employees LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name        = p_name,
    phone       = p_phone,
    nationality = p_nationality,
    join_date   = p_join_date,
    status      = p_status,
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
