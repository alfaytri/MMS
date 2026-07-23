-- Restore the Teams-module tables that were dropped without a DROP
-- migration on record (probably lost during a manual db reset). Original
-- shapes taken verbatim from baseline_schema.sql — the app code assumed
-- these still existed, so the Teams UI has been failing at runtime and
-- TypeScript is producing hundreds of errors for stale field references.
--
-- Tables restored: employees, teams, schedules, team_activity_log,
-- team_schedule_assignments, tool_assignments, vehicles.
-- Enums restored: employee_status, team_tag.
--
-- All statements guarded so the migration is idempotent.

BEGIN;

-- 1. Enums ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.employee_status AS ENUM ('active','vacation','archived','unassigned','on-task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.team_tag AS ENUM ('normal','emergency','qc','site-visit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. schedules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  days        jsonb NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  deleted_at  timestamptz
);

-- 3. teams ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  tag                    public.team_tag DEFAULT 'normal',
  vehicle_id             uuid,
  schedule_id            uuid,
  schedule_start         integer DEFAULT 7,
  schedule_end           integer DEFAULT 17,
  leader_id              uuid,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  is_emergency           boolean DEFAULT false NOT NULL,
  is_qc                  boolean DEFAULT false NOT NULL,
  traccar_device_id      text,
  deleted_at             timestamptz,
  name_en                text DEFAULT '' NOT NULL,
  name_ar                text,
  phone                  text,
  site_visit_order       boolean DEFAULT false NOT NULL,
  site_visit_quotation   boolean DEFAULT false NOT NULL,
  division_id            uuid,
  is_normal              boolean DEFAULT false NOT NULL,
  CONSTRAINT check_qc_exclusive CHECK (NOT (is_qc AND (is_normal OR is_emergency)))
);

-- 4. employees ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  name_ar                text,
  phone                  text NOT NULL,
  skills                 text[] DEFAULT '{}',
  status                 public.employee_status DEFAULT 'active',
  team_id                uuid,
  avatar                 text,
  join_date              date NOT NULL,
  nationality            text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  site_visit_order       boolean DEFAULT false NOT NULL,
  site_visit_quotation   boolean DEFAULT false NOT NULL,
  avatar_url             text,
  deleted_at             timestamptz,
  division_id            uuid,
  profile_id             uuid
);

-- 5. vehicles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               text NOT NULL,
  plate              text NOT NULL,
  team_id            uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  traccar_device_id  text,
  deleted_at         timestamptz,
  name               text
);

-- 6. team_activity_log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  before_data  jsonb,
  after_data   jsonb,
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- 7. team_schedule_assignments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_schedule_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL,
  schedule_id  uuid NOT NULL,
  start_date   date NOT NULL,
  end_date     date,
  created_at   timestamptz DEFAULT now()
);

-- 8. tool_assignments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_unit_id  uuid NOT NULL,
  assigned_to   text NOT NULL,
  team_id       uuid,
  employee_id   uuid,
  assigned_at   timestamptz DEFAULT now() NOT NULL,
  notes         text,
  CONSTRAINT one_target CHECK (
    ((team_id IS NOT NULL) AND (employee_id IS NULL))
    OR ((employee_id IS NOT NULL) AND (team_id IS NULL))
  ),
  CONSTRAINT tool_assignments_assigned_to_check CHECK (assigned_to = ANY (ARRAY['team','employee']))
);

-- 9. Foreign keys — guarded so replays are safe. Only add FKs where the
--    target table is known to still exist on staging.
DO $$ BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_vehicle_id_fkey  FOREIGN KEY (vehicle_id)  REFERENCES public.vehicles(id)  ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_leader_id_fkey   FOREIGN KEY (leader_id)   REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_team_id_fkey     FOREIGN KEY (team_id)     REFERENCES public.teams(id)             ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_profile_id_fkey  FOREIGN KEY (profile_id)  REFERENCES public.profiles(id)          ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicles
    ADD CONSTRAINT vehicles_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.team_schedule_assignments
    ADD CONSTRAINT team_schedule_assignments_team_id_fkey     FOREIGN KEY (team_id)     REFERENCES public.teams(id)     ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.team_schedule_assignments
    ADD CONSTRAINT team_schedule_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tool_assignments
    ADD CONSTRAINT tool_assignments_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES public.tool_asset_units(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tool_assignments
    ADD CONSTRAINT tool_assignments_team_id_fkey     FOREIGN KEY (team_id)     REFERENCES public.teams(id)     ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tool_assignments
    ADD CONSTRAINT tool_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. RLS + permissive policies — mirrors how other master-data tables
--     work on staging. Real policies can be tightened later.
ALTER TABLE public.schedules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_activity_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_assignments          ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "auth all" ON public.schedules                 TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.teams                     TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.employees                 TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.vehicles                  TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.team_activity_log         TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.team_schedule_assignments TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth all" ON public.tool_assignments          TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
