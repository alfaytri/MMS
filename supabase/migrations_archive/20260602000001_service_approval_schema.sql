-- =============================================================
-- Service Approval Workflow — Schema, Triggers, RLS
-- =============================================================

-- 1. Enums
CREATE TYPE service_change_type AS ENUM ('add', 'edit', 'delete');
CREATE TYPE service_change_status AS ENUM ('pending', 'approved', 'rejected');

-- 2. Table
CREATE TABLE service_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID REFERENCES services(id),
  division         TEXT[],
  change_type      service_change_type NOT NULL,
  changes          JSONB NOT NULL,
  status           service_change_status NOT NULL DEFAULT 'pending',
  requested_by     UUID NOT NULL REFERENCES profiles(id),
  reviewed_by      UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT scr_rejection_reason_required
    CHECK (status != 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT scr_add_no_service_id
    CHECK (change_type != 'add' OR service_id IS NULL),
  CONSTRAINT scr_edit_delete_require_service_id
    CHECK (change_type = 'add' OR service_id IS NOT NULL)
);

-- 3. Indexes
CREATE INDEX idx_scr_service_id_status ON service_change_requests(service_id, status);
CREATE INDEX idx_scr_status ON service_change_requests(status);
CREATE INDEX idx_scr_requested_by ON service_change_requests(requested_by);
CREATE INDEX idx_scr_division_status ON service_change_requests USING GIN (division) WHERE status = 'pending';

-- 4. Add pending flag to services (trigger-managed only)
ALTER TABLE services ADD COLUMN IF NOT EXISTS has_pending_change BOOLEAN NOT NULL DEFAULT false;

-- 5. Trigger: keep has_pending_change in sync
CREATE OR REPLACE FUNCTION sync_service_pending_lock()
RETURNS TRIGGER AS $$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_change_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_service_pending
AFTER INSERT OR UPDATE OF status OR DELETE ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION sync_service_pending_lock();

-- 6. Trigger: auto-reject pending when service soft-deleted
CREATE OR REPLACE FUNCTION auto_reject_pending_on_service_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_change_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now(),
        updated_at = now()
    WHERE service_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reject_on_service_delete
AFTER UPDATE OF deleted_at ON services
FOR EACH ROW EXECUTE FUNCTION auto_reject_pending_on_service_delete();

-- 7. RLS
ALTER TABLE service_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY scr_select ON service_change_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = auth.uid()
      AND cr.deleted_at IS NULL
      AND (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
  )
);

CREATE POLICY scr_no_direct_insert ON service_change_requests FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY scr_no_direct_update ON service_change_requests FOR UPDATE TO authenticated
USING (false);

CREATE POLICY scr_no_direct_delete ON service_change_requests FOR DELETE TO authenticated
USING (false);

-- 8. Updated_at trigger
CREATE TRIGGER trg_scr_updated_at
BEFORE UPDATE ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
