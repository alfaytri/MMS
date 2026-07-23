-- Add actioned_at column to notifications for tracking whether the user
-- completed the required action (e.g. approved a PO, resolved a transfer).
-- read_at = user saw it, actioned_at = user completed the action.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actioned_at timestamptz;

-- Index for querying pending (not actioned) notifications efficiently
CREATE INDEX IF NOT EXISTS idx_notifications_profile_pending
  ON public.notifications (profile_id, created_at DESC)
  WHERE actioned_at IS NULL;
