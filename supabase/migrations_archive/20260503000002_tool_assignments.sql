CREATE TABLE IF NOT EXISTS tool_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_unit_id UUID NOT NULL REFERENCES tool_asset_units(id) ON DELETE CASCADE,
  assigned_to  TEXT NOT NULL CHECK (assigned_to IN ('team','employee')),
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES employees(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  CONSTRAINT one_target CHECK (
    (team_id IS NOT NULL AND employee_id IS NULL) OR
    (employee_id IS NOT NULL AND team_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_team_id     ON tool_assignments (team_id);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_employee_id ON tool_assignments (employee_id);
