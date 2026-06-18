BEGIN;

-- INSERT new rows for roles that don't exist yet. ON CONFLICT DO NOTHING
-- because some (Owner, Inventory Manager) already exist as permission roles.
INSERT INTO custom_roles (name, description, color, permissions, is_system, is_approval_slot)
VALUES
  ('Purchase Manager',  'Approval slot — Purchase Manager (PO chains)',  'bg-blue-500/15 text-blue-700 border-blue-500/30',     '{}', true, true),
  ('Accountant',        'Approval slot — Accountant',                    'bg-amber-500/15 text-amber-700 border-amber-500/30',  '{}', true, true),
  ('Brand Manager',     'Approval slot — Brand Manager (damage/write-off)', 'bg-purple-500/15 text-purple-700 border-purple-500/30', '{}', true, true),
  ('Employee',          'Approval slot — Employee',                      'bg-slate-500/15 text-slate-700 border-slate-500/30',  '{}', true, true),
  ('Warehouse Manager', 'Approval slot — Warehouse Manager',             'bg-teal-500/15 text-teal-700 border-teal-500/30',     '{}', true, true)
ON CONFLICT (name) DO NOTHING;

-- For Owner + Inventory Manager (which already exist as permission roles),
-- flip the is_approval_slot flag — leave name, description, permissions alone.
UPDATE custom_roles
SET    is_approval_slot = true
WHERE  name IN ('Owner', 'Inventory Manager')
  AND  deleted_at IS NULL;

COMMIT;
