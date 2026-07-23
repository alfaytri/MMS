-- Debit / Credit Notes split — add PO reference, replacement receival support, permission backfill
--
-- NOTE: this project has no standalone `permissions` table — permission slugs are defined in
-- src/lib/permissions.ts (PERMISSION_GROUPS) and stored as plain TEXT[] on custom_roles.permissions.
-- The new 'purchase.debit_notes.view' slug is registered there; this migration only backfills
-- existing roles that already had 'purchase.returns.view'.

-- 1. credit_notes: add purchase_order_id for debit notes
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid
  REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_po_id
  ON credit_notes(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- 2. receivals: replacement receival support
ALTER TABLE receivals
  ADD COLUMN IF NOT EXISTS is_replacement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_debit_note_id uuid
  REFERENCES credit_notes(id);

-- 3. Backfill: any role with purchase.returns.view also gets debit_notes.view
UPDATE custom_roles
SET    permissions = permissions || ARRAY['purchase.debit_notes.view']
WHERE  deleted_at IS NULL
  AND  NOT ('purchase.debit_notes.view' = ANY(permissions))
  AND  'purchase.returns.view' = ANY(permissions);
