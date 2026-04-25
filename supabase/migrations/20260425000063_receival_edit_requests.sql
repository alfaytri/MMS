-- supabase/migrations/20260425000063_receival_edit_requests.sql
BEGIN;

CREATE TABLE IF NOT EXISTS receival_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_id     UUID NOT NULL REFERENCES receivals(id),
  requested_by    UUID NOT NULL REFERENCES profiles(id),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
  approved_by     UUID REFERENCES profiles(id),
  rejection_note  TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

ALTER TABLE receival_edit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can manage receival_edit_requests" ON receival_edit_requests;
CREATE POLICY "authenticated can manage receival_edit_requests"
  ON receival_edit_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rer_receival ON receival_edit_requests(receival_id);
CREATE INDEX IF NOT EXISTS idx_rer_status   ON receival_edit_requests(status);

COMMIT;
