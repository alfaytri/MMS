BEGIN;

-- ── Seed field_rp role ──────────────────────────────────────────────────
INSERT INTO custom_roles (name, description, is_system, permissions, color)
VALUES (
  'field_rp',
  'Field Responsible Person — physically manages a warehouse',
  true,
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create',
    'warehouse.transfer.dispatch',
    'warehouse.transfer.receive',
    'warehouse.adjustment.request',
    'warehouse.check.count'
  ],
  'bg-blue-500/15 text-blue-700 border-blue-500/30'
)
ON CONFLICT (name) DO NOTHING;

-- ── Seed inventory_manager role ─────────────────────────────────────────
INSERT INTO custom_roles (name, description, is_system, permissions, color)
VALUES (
  'inventory_manager',
  'Inventory Manager — global oversight, approvals, and settings',
  true,
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create',
    'warehouse.transfer.approve',
    'warehouse.adjustment.request',
    'warehouse.adjustment.approve',
    'warehouse.check.count',
    'warehouse.check.create',
    'warehouse.check.approve',
    'warehouse.settings.manage'
  ],
  'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
