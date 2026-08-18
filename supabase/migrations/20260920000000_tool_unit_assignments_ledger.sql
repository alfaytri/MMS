-- Tools & Assets Phase 1 (Assign & Track): custody ledger + current-team pointer.
--
-- tool_unit_assignments is the source of truth for who-held-what-when: one row
-- per stint, released_at IS NULL = the current holder. A partial unique index
-- guarantees at most one open row per unit. tool_asset_units gets a denormalized
-- current_custody_location_id pointer (kept in sync by the RPCs in
-- 20260920000100) so "a team's current units" is a fast, indexed lookup.
--
-- All real writes go through the SECURITY DEFINER RPCs; the write policy below is
-- only a backstop against direct PostgREST writes. Permission expression copied
-- verbatim from the live guard_tool_unit_division_write body.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tool_unit_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL REFERENCES public.tool_asset_units(id) ON DELETE CASCADE,
  custody_location_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id),
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  released_at         timestamptz,
  release_reason      text CHECK (release_reason IN ('moved','returned','scrapped')),
  assigned_by         uuid,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- At most one OPEN assignment per unit (the current holder).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_unit_open_assignment
  ON public.tool_unit_assignments (unit_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tool_unit_assignments_unit
  ON public.tool_unit_assignments (unit_id);
CREATE INDEX IF NOT EXISTS ix_tool_unit_assignments_team
  ON public.tool_unit_assignments (custody_location_id);

ALTER TABLE public.tool_unit_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT open to authenticated (mirrors tool_asset_units tau_select).
DO $$ BEGIN
  CREATE POLICY tua_ledger_select ON public.tool_unit_assignments
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Direct writes require inventory.catalog.manage (DEFINER RPCs bypass this).
DO $$ BEGIN
  CREATE POLICY tua_ledger_write ON public.tool_unit_assignments
    FOR ALL TO authenticated
    USING (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'))
    WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Denormalized current-team pointer on the unit.
ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS current_custody_location_id uuid
    REFERENCES public.warehouse_sub_containers(id);
CREATE INDEX IF NOT EXISTS ix_tool_asset_units_current_team
  ON public.tool_asset_units (current_custody_location_id);

COMMIT;
