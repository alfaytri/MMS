-- 20260827000200_guard_tool_unit_division_write.sql
-- Close the ungated-Edit bypass of rpc_transfer_tool_unit's permission gate.
--
-- tool_asset_units RLS is (and remains) a single permissive policy
-- "Authenticated users can manage tool_asset_units", USING(true)/WITH CHECK(true)
-- for ALL to {authenticated} (live-verified 2026-08-27 via pg_policy; flagged in
-- PROGRESS.md Security Audit Log under Bulk Tools P2b / Task 2b.5). That means the
-- Edit-Unit dialog's plain UPDATE (useUpdateToolAssetUnit) can silently move
-- division_id with zero permission check — bypassing rpc_transfer_tool_unit's
-- inventory.catalog.manage gate entirely by using Edit instead of Transfer.
--
-- This BEFORE UPDATE trigger closes it at the table level: any UPDATE that
-- changes division_id (direct PostgREST write OR the RPC's own UPDATE) must
-- come from a caller holding inventory.catalog.manage. Other column edits
-- (condition/status/assigned_to/serial_number/brand/expiry) stay ungated — the
-- guard only fires on a division_id diff, mirroring
-- guard_tool_tracking_mode_switch's single-column-diff style (migration
-- 20260826000200: BEFORE UPDATE, SECURITY DEFINER, RAISE on violation, no-op
-- RETURN NEW when the guarded column is unchanged).
--
-- rpc_transfer_tool_unit (20260827000100) already checks the same permission
-- before its own UPDATE runs, so a legitimate transfer passes this trigger too
-- (redundant-but-consistent — the same co-existence guard_po_locked_columns has
-- with its own gated RPCs).
--
-- Live-schema / helper check (2026-08-27, mwvblpgbgxipvrevkeff, via
-- pg_get_functiondef + information_schema + pg_policy + pg_trigger):
--   tool_asset_units(id uuid, item_id uuid, serial_number text, brand text,
--     condition tool_condition, status tool_status, expiry date, assigned_to uuid,
--     created_at timestamptz, receival_item_id uuid, is_placeholder bool,
--     division_id uuid -> company_divisions.id)
--   _user_has_permission(p_profile_id uuid, p_permission text) returns boolean —
--     STABLE SECURITY DEFINER, checks is_system_admin OR permission = ANY(cr.permissions)
--   _current_user_data_id() returns uuid — STABLE SECURITY DEFINER, resolves
--     user_data.id from auth.uid()
--   Both confirmed live and already used identically by rpc_transfer_tool_unit.
-- Zero pre-existing triggers on tool_asset_units (pg_trigger query returned no
-- rows) — no ordering conflict with anything else on this table.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tool_unit_division_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.division_id IS NOT DISTINCT FROM OLD.division_id THEN
    RETURN NEW;
  END IF;

  IF NOT _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to change the owning division of a tool unit'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tool_unit_division_write ON public.tool_asset_units;
CREATE TRIGGER trg_guard_tool_unit_division_write
  BEFORE UPDATE ON public.tool_asset_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_tool_unit_division_write();

NOTIFY pgrst, 'reload schema';
COMMIT;
