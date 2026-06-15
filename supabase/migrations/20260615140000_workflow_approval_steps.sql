BEGIN;

CREATE TABLE workflow_approval_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow        TEXT NOT NULL CHECK (workflow IN ('po','inv_check','stock_adj')),
  role_id         UUID NOT NULL REFERENCES custom_roles(id),
  step_key        TEXT NOT NULL,
  step_label      TEXT NOT NULL,
  step_order      INT  NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_conditional  BOOLEAN NOT NULL DEFAULT false,
  condition_types TEXT[] DEFAULT '{}',
  archived_at     TIMESTAMPTZ,
  archived_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow, step_key),
  CONSTRAINT positive_order CHECK (step_order > 0)
);

ALTER TABLE workflow_approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_steps_select" ON workflow_approval_steps
  FOR SELECT TO authenticated USING (true);

-- Seed PO Approvals
INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'po', cr.id, 'purchase_manager', 'Purchase Manager', 1
FROM custom_roles cr WHERE cr.name = 'Purchase Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'po', cr.id, 'accountant', 'Accountant', 2
FROM custom_roles cr WHERE cr.name = 'Accountant' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'po', cr.id, 'owner', 'Owner', 3
FROM custom_roles cr WHERE cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

-- Seed Inventory Check Approvals
INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'inv_check', cr.id, 'accounting_manager', 'Accounting Manager', 1
FROM custom_roles cr WHERE cr.name = 'Accountant' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'inv_check', cr.id, 'inventory_manager', 'Inventory Manager', 2
FROM custom_roles cr WHERE cr.name = 'Inventory Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'inv_check', cr.id, 'responsible_person', 'Responsible Person', 3
FROM custom_roles cr WHERE cr.name = 'Warehouse Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order, is_conditional, condition_types)
SELECT 'inv_check', cr.id, 'brand_manager', 'Brand Manager', 4, true, ARRAY['damage','write_off']
FROM custom_roles cr WHERE cr.name = 'Brand Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'inv_check', cr.id, 'owner', 'Owner', 5
FROM custom_roles cr WHERE cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

-- Seed Stock Adjustment Approvals (same steps as inv_check)
INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'stock_adj', cr.id, 'accounting_manager', 'Accounting Manager', 1
FROM custom_roles cr WHERE cr.name = 'Accountant' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'stock_adj', cr.id, 'inventory_manager', 'Inventory Manager', 2
FROM custom_roles cr WHERE cr.name = 'Inventory Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'stock_adj', cr.id, 'responsible_person', 'Responsible Person', 3
FROM custom_roles cr WHERE cr.name = 'Warehouse Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order, is_conditional, condition_types)
SELECT 'stock_adj', cr.id, 'brand_manager', 'Brand Manager', 4, true, ARRAY['damage','write_off']
FROM custom_roles cr WHERE cr.name = 'Brand Manager' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

INSERT INTO workflow_approval_steps (workflow, role_id, step_key, step_label, step_order)
SELECT 'stock_adj', cr.id, 'owner', 'Owner', 5
FROM custom_roles cr WHERE cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL;

COMMIT;
