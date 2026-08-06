-- Teams + Places + Consumption — Task 1 of 4 DB migrations
--
-- Introduces a structured `warehouse_kind` column on `warehouses` so we can
-- distinguish real warehouses from the growing family of virtual containers.
-- Currently virtual warehouses are identified only by `is_virtual=true` +
-- the name string "Repair" (D.6.b). That's fine for one virtual, but two
-- more categories are coming (Teams, Places) so a proper discriminator
-- is now worth the small schema cost.
--
-- Also seeds the two new shared virtual warehouses (Teams, Places) and
-- adds a nullable `team_id` column on `warehouse_sub_containers` so the
-- future Teams module has a landing spot ready.
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md
-- Prior migration: 20260814000400_phase_f_relax_repair_shape_constraint.sql

-- 1. warehouse_kind column on warehouses ─────────────────────────────
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS warehouse_kind text NOT NULL DEFAULT 'general';

ALTER TABLE public.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_kind_check;

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_kind_check
  CHECK (warehouse_kind IN ('general', 'repair', 'teams', 'places'));

-- Backfill existing rows. The Repair consolidation (D.6.b) is the only
-- virtual warehouse today; every other row is a real physical WH.
UPDATE public.warehouses
   SET warehouse_kind = 'repair'
 WHERE is_virtual = true
   AND name = 'Repair'
   AND warehouse_kind = 'general';

CREATE INDEX IF NOT EXISTS idx_warehouses_kind
  ON public.warehouses (warehouse_kind)
  WHERE warehouse_kind <> 'general';

COMMENT ON COLUMN public.warehouses.warehouse_kind IS
'Discriminator for the row''s purpose:
  general  — real physical warehouse holding real stock.
  repair   — shared virtual WH; sub-containers are repair vendors (D.6.b).
  teams    — shared virtual WH; sub-containers are field teams.
  places   — shared virtual WH; sub-containers are off-site custody locations
             (customer sites, office storage, satellite sites — coded by name).
Kept alongside `is_virtual` for backward-compat; new UI filters by kind.';

-- 2. Seed the two new shared virtual warehouses ──────────────────────
-- Idempotent: only inserts if the (name, warehouse_kind) row is missing.
INSERT INTO public.warehouses (name, warehouse_kind, is_virtual, location, company_id)
SELECT 'Teams', 'teams', true, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouses WHERE warehouse_kind = 'teams'
);

INSERT INTO public.warehouses (name, warehouse_kind, is_virtual, location, company_id)
SELECT 'Places', 'places', true, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouses WHERE warehouse_kind = 'places'
);

-- 3. team_id column on warehouse_sub_containers ──────────────────────
-- Nullable, unused until the Teams module ships. When it lands, we'll add
-- the FK constraint and backfill from sub_container.name → team.id where
-- the sub-container's parent warehouse has kind='teams'.
ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN IF NOT EXISTS team_id uuid;

CREATE INDEX IF NOT EXISTS idx_wsc_team_id
  ON public.warehouse_sub_containers (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON COLUMN public.warehouse_sub_containers.team_id IS
'Placeholder FK to the future teams table. NULL for every sub-container
until the Teams module ships and the backfill / FK-add migration runs.
Only relevant on sub-containers whose parent warehouse has kind=''teams''.';
