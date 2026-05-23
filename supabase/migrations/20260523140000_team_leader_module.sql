-- supabase/migrations/20260523140000_team_leader_module.sql

-- 1. employees: add profile_id if not present
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_profile_id ON employees(profile_id);

-- 2. site_visits: add completion tracking columns
ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. site_visits: add 'customer-unavailable' to status if it uses a check constraint
--    (drops and recreates the constraint; no-op if column is plain text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_visits' AND constraint_name = 'site_visits_status_check'
  ) THEN
    ALTER TABLE site_visits DROP CONSTRAINT site_visits_status_check;
    ALTER TABLE site_visits ADD CONSTRAINT site_visits_status_check
      CHECK (status IN (
        'scheduled','in-progress','completed','cancelled',
        'customer-unavailable','no-show'
      ));
  END IF;
END $$;

-- 4. team_live_locations table
CREATE TABLE IF NOT EXISTS team_live_locations (
  team_id    uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  lat        numeric(10, 7) NOT NULL,
  lng        numeric(10, 7) NOT NULL,
  accuracy   float,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_live_locations ENABLE ROW LEVEL SECURITY;

-- Fix 6: separate INSERT and UPDATE policies for UPSERT support
CREATE POLICY "tll_insert" ON team_live_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id = (
      SELECT t.id FROM teams t
      JOIN employees e ON e.id = t.leader_id
      JOIN profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "tll_update" ON team_live_locations
  FOR UPDATE TO authenticated
  USING (
    team_id = (
      SELECT t.id FROM teams t
      JOIN employees e ON e.id = t.leader_id
      JOIN profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id = (
      SELECT t.id FROM teams t
      JOIN employees e ON e.id = t.leader_id
      JOIN profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "tll_read" ON team_live_locations
  FOR SELECT TO authenticated
  USING (true);
