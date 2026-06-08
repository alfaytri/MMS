-- Inventory Check Module Redesign
-- Adds team-based counting: assignments, log timeline, multi-step approval chain

-- ── 1. Extend inventory_checks ───────────────────────────────────────────────
ALTER TABLE inventory_checks
  ADD COLUMN IF NOT EXISTS initiated_by_profile_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS initiated_by_name       text,
  ADD COLUMN IF NOT EXISTS started_at              timestamptz;

-- ── 2. Extend inventory_check_items ──────────────────────────────────────────
ALTER TABLE inventory_check_items
  ADD COLUMN IF NOT EXISTS assignment_id         uuid,
  ADD COLUMN IF NOT EXISTS category_name         text,
  ADD COLUMN IF NOT EXISTS assigned_profile_id   uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_profile_name text,
  ADD COLUMN IF NOT EXISTS variance_type         text; -- increase | decrease | damage | write_off

-- ── 3. inventory_check_assignments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_check_assignments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id             uuid        NOT NULL REFERENCES inventory_checks(id) ON DELETE CASCADE,
  profile_id           uuid        NOT NULL REFERENCES profiles(id),
  profile_name         text        NOT NULL,
  assigned_categories  text[]      NOT NULL DEFAULT '{}',
  status               text        NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_check_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can manage inventory_check_assignments"
  ON inventory_check_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 4. inventory_check_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_check_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id     uuid        NOT NULL REFERENCES inventory_checks(id) ON DELETE CASCADE,
  event_type   text        NOT NULL,  -- initialized | user_completed | all_counted | approval_action | approved | rejected
  profile_id   uuid        REFERENCES profiles(id),
  profile_name text,
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_check_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can manage inventory_check_log"
  ON inventory_check_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 5. inventory_check_approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_check_approvals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id     uuid        NOT NULL REFERENCES inventory_checks(id) ON DELETE CASCADE,
  step_order   integer     NOT NULL,
  step_role    text        NOT NULL,   -- accounting_manager | inventory_manager | responsible_person | brand_manager | owner
  step_label   text        NOT NULL,
  profile_id   uuid        REFERENCES profiles(id),
  profile_name text,
  status       text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  action_at    timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_check_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can manage inventory_check_approvals"
  ON inventory_check_approvals FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 6. FK from inventory_check_items → inventory_check_assignments ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_check_items_assignment_id_fkey'
      AND table_name = 'inventory_check_items'
  ) THEN
    ALTER TABLE inventory_check_items
      ADD CONSTRAINT inventory_check_items_assignment_id_fkey
      FOREIGN KEY (assignment_id) REFERENCES inventory_check_assignments(id) ON DELETE SET NULL;
  END IF;
END $$;
