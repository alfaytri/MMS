-- 1. Add soft-delete to teams (same gap as vehicles/employees/schedules)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. RLS for team_activity_log — table was created without policies, causing 403
ALTER TABLE team_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_activity_log" ON team_activity_log;
CREATE POLICY "authenticated_manage_activity_log"
  ON team_activity_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. employee_services junction table (was missing — caused upsert_employee_services 404)
CREATE TABLE IF NOT EXISTS employee_services (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  PRIMARY KEY (employee_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_services_employee ON employee_services (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_service  ON employee_services (service_id);

-- 4. Recreate upsert_employee_services now that the table exists
CREATE OR REPLACE FUNCTION upsert_employee_services(
  p_employee_id UUID,
  p_service_ids UUID[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;
END;
$$;

-- 5. Recreate save_employee without the removed site_visit params
CREATE OR REPLACE FUNCTION save_employee(
  p_employee_id UUID,
  p_name        TEXT,
  p_phone       TEXT,
  p_nationality TEXT,
  p_join_date   DATE,
  p_status      TEXT,
  p_avatar_url  TEXT,
  p_service_ids UUID[]
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
    avatar_url  = p_avatar_url
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
