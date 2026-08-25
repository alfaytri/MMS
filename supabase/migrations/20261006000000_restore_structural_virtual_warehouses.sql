-- Restore the 4 structural virtual warehouses cleared by the 2026-08-24 go-live data reset.
--
-- These rows are app plumbing, NOT business data:
--   * _repair_vendor_provision_warehouse (BEFORE INSERT on repair_vendors) resolves the
--     shared warehouse by name='Repair' AND is_virtual, and RAISEs if it is missing —
--     so creating a repair vendor fails without it.
--   * create_project requires its target warehouse to be warehouse_kind='custody'.
--   * rpc_create_custody_transfer resolves custody locations by warehouse_kind='custody'
--     and gates hand-out on can_transfer_custody (VAN = true, Teams/Projects = false).
--
-- Values mirror the live staging DB exactly (name / warehouse_kind / is_project_warehouse /
-- can_transfer_custody / location). company_id and repair_vendor_id are NULL (shared,
-- vendor-agnostic), matching staging. The Repair location text carries an em-dash, so it is
-- supplied via base64-decode to reproduce the exact UTF-8 bytes regardless of client encoding.
--
-- Idempotent: a row is inserted only when its (name, warehouse_kind, is_virtual=true) triple
-- is absent, so this is a no-op on any DB that still has these warehouses (staging, dev).

INSERT INTO public.warehouses
  (name, warehouse_kind, is_virtual, is_project_warehouse, can_transfer_custody, location, company_id)
SELECT v.name, v.warehouse_kind, true, v.is_project_warehouse, v.can_transfer_custody, v.location, NULL
FROM (VALUES
  ('Repair',   'repair',  false, false, convert_from(decode('U2hhcmVkIHJlcGFpciBjb250YWluZXIg4oCUIHZlbmRvcnMgYXMgc3ViLWNvbnRhaW5lcnM=', 'base64'), 'UTF8')),
  ('Teams',    'custody', false, false, NULL),
  ('VAN',      'custody', false, true,  NULL),
  ('Projects', 'custody', true,  false, NULL)
) AS v(name, warehouse_kind, is_project_warehouse, can_transfer_custody, location)
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouses w
  WHERE w.name = v.name
    AND w.warehouse_kind = v.warehouse_kind
    AND w.is_virtual = true
);
