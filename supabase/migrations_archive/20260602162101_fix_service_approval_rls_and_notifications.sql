-- =============================================================
-- Fix: Service Change Requests RLS + Approval Notifications
-- =============================================================
-- Problem: scr_select policy compared auth.uid() (auth user UUID)
-- to profile_id fields. In this project profiles.id ≠ auth.uid().
-- Also: add server-side notification to approvers on new pending request.

-- 1. Drop the broken RLS policy and recreate with correct profile lookup
DROP POLICY IF EXISTS scr_select ON service_change_requests;

CREATE POLICY scr_select ON service_change_requests FOR SELECT TO authenticated
USING (
  requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND cr.deleted_at IS NULL
      AND (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
  )
);

-- 2. Trigger: notify all approvers when a pending change request is created
CREATE OR REPLACE FUNCTION notify_approvers_on_service_change()
RETURNS TRIGGER AS $$
DECLARE
  v_approver_id UUID;
  v_service_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Only fire on new pending requests
  IF NEW.status != 'pending' THEN
    RETURN NULL;
  END IF;

  -- Resolve service name (for edits/deletes) or from changes payload (for adds)
  IF NEW.service_id IS NOT NULL THEN
    SELECT name_en INTO v_service_name FROM services WHERE id = NEW.service_id;
  ELSE
    v_service_name := NEW.changes->'name_en'->>'new';
  END IF;
  v_service_name := COALESCE(v_service_name, 'Unknown Service');

  -- Resolve requester name
  SELECT full_name INTO v_requester_name FROM profiles WHERE id = NEW.requested_by;
  v_requester_name := COALESCE(v_requester_name, 'Unknown User');

  -- Insert notification for each approver (except the requester themselves)
  FOR v_approver_id IN
    SELECT DISTINCT ucr.profile_id
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
      AND ucr.profile_id != NEW.requested_by
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, related_id, related_type)
    VALUES (
      v_approver_id,
      'service_change_pending',
      'Service change pending approval',
      v_requester_name || ' requested a ' || NEW.change_type || ' on "' || v_service_name || '"',
      COALESCE(NEW.service_id, NEW.id),
      'service'
    );
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_approvers_on_service_change
AFTER INSERT ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION notify_approvers_on_service_change();

-- 3. Also clean up any stale has_pending_change flags (no matching pending request)
UPDATE services s
SET has_pending_change = false
WHERE has_pending_change = true
  AND NOT EXISTS (
    SELECT 1 FROM service_change_requests scr
    WHERE scr.service_id = s.id AND scr.status = 'pending'
  );
