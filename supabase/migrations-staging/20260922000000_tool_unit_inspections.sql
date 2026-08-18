-- Tools & Assets Phase 2 (Health & Disposal): on-demand condition-check history.
-- One row per inspection of a serialized tool unit. "Last checked" = MAX(inspected_at)
-- per unit; "due this month" = no row in the current calendar month. The verdict
-- drives the §6 lifecycle mapping applied by rpc_record_tool_inspection
-- (20260922000100): good->condition Good, bad->condition Fair, under_repair->status
-- maintenance. RLS mirrors tool_unit_assignments (read open; writes gated on
-- inventory.catalog.manage — RPCs are DEFINER and bypass this).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tool_unit_inspections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL REFERENCES public.tool_asset_units(id) ON DELETE CASCADE,
  custody_location_id uuid REFERENCES public.warehouse_sub_containers(id),   -- team holding it at check time (snapshot)
  inspected_at        timestamptz NOT NULL DEFAULT now(),
  inspected_by        uuid,
  verdict             text NOT NULL CHECK (verdict IN ('good','bad','under_repair')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Latest-first per unit (last-checked / timeline lookups).
CREATE INDEX IF NOT EXISTS ix_tool_unit_inspections_unit
  ON public.tool_unit_inspections (unit_id, inspected_at DESC);

ALTER TABLE public.tool_unit_inspections ENABLE ROW LEVEL SECURITY;

-- SELECT open to authenticated (mirrors tua_ledger_select).
DO $$ BEGIN
  CREATE POLICY tui_select ON public.tool_unit_inspections
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Direct writes require inventory.catalog.manage (RPCs are DEFINER and bypass this;
-- this only guards accidental direct PostgREST writes). Byte-matches tua_ledger_write.
DO $$ BEGIN
  CREATE POLICY tui_write ON public.tool_unit_inspections
    FOR ALL TO authenticated
    USING (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'))
    WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
