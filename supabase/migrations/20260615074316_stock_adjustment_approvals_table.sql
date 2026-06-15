BEGIN;

CREATE TABLE IF NOT EXISTS stock_adjustment_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL,
  step_role     TEXT NOT NULL,
  step_label    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  profile_id    UUID REFERENCES profiles(id),
  profile_name  TEXT,
  action_at     TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_adjustment_approvals_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT stock_adjustment_approvals_role_chk
    CHECK (step_role IN (
      'accounting_manager','inventory_manager','responsible_person','brand_manager','owner'
    )),
  UNIQUE (adjustment_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_saa_adjustment
  ON stock_adjustment_approvals(adjustment_id);

CREATE INDEX IF NOT EXISTS idx_saa_pending
  ON stock_adjustment_approvals(adjustment_id, step_order)
  WHERE status = 'pending';

ALTER TABLE stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can manage stock_adjustment_approvals"
  ON stock_adjustment_approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
