-- Schedules template table
CREATE TABLE IF NOT EXISTS schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  days       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Team schedule assignment history
CREATE TABLE IF NOT EXISTS team_schedule_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_sched_team_id ON team_schedule_assignments (team_id);

-- RPC: sync teams.schedule_id to current active assignment (Risk R5)
-- Updated per Errata 9: joins on deleted_at IS NULL to exclude soft-deleted schedules
CREATE OR REPLACE FUNCTION sync_team_active_schedule(p_team_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  SELECT tsa.schedule_id INTO v_schedule_id
  FROM team_schedule_assignments tsa
  JOIN schedules s ON s.id = tsa.schedule_id
  WHERE tsa.team_id = p_team_id
    AND tsa.start_date <= CURRENT_DATE
    AND (tsa.end_date IS NULL OR tsa.end_date >= CURRENT_DATE)
    AND s.deleted_at IS NULL
  ORDER BY tsa.start_date DESC
  LIMIT 1;

  UPDATE teams SET schedule_id = v_schedule_id WHERE id = p_team_id;
END;
$$;

-- RPC: atomically assign team leader + ensure member (Risk R4)
CREATE OR REPLACE FUNCTION assign_team_leader(p_team_id UUID, p_employee_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE employees SET team_id = p_team_id, status = 'active'
  WHERE id = p_employee_id;

  UPDATE teams SET leader_id = p_employee_id WHERE id = p_team_id;

  INSERT INTO team_activity_log (action, entity_type, entity_id, after_data)
  VALUES (
    'leader-assigned', 'team', p_team_id,
    jsonb_build_object('leader_id', p_employee_id)
  );
END;
$$;

-- RPC: upsert employee skills atomically (Risk R3)
CREATE OR REPLACE FUNCTION upsert_employee_services(
  p_employee_id UUID,
  p_service_ids UUID[]
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;
END;
$$;

-- RPC: atomically update employee + skills in one transaction (Errata 2 - non-atomic fix)
CREATE OR REPLACE FUNCTION save_employee(
  p_employee_id          UUID,
  p_name                 TEXT,
  p_phone                TEXT,
  p_nationality          TEXT,
  p_join_date            DATE,
  p_status               TEXT,
  p_site_visit_order     BOOLEAN,
  p_site_visit_quotation BOOLEAN,
  p_avatar_url           TEXT,
  p_service_ids          UUID[]
)
RETURNS employees LANGUAGE plpgsql AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name                 = p_name,
    phone                = p_phone,
    nationality          = p_nationality,
    join_date            = p_join_date,
    status               = p_status,
    site_visit_order     = p_site_visit_order,
    site_visit_quotation = p_site_visit_quotation,
    avatar_url           = p_avatar_url
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
