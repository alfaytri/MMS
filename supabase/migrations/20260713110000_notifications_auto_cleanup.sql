-- Auto-cleanup for completed notifications.
-- Deletes actioned notifications older than 45 days.
-- Intended to run quarterly via pg_cron (or manually).

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE actioned_at IS NOT NULL
    AND actioned_at < NOW() - INTERVAL '45 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Schedule quarterly cleanup (1st of Jan, Apr, Jul, Oct at 03:00 UTC).
-- pg_cron is enabled on Supabase Pro plans; on Free plan this is a no-op
-- and the function can be called manually instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-old-notifications',
      '0 3 1 1,4,7,10 *',
      'SELECT public.cleanup_old_notifications()'
    );
  END IF;
END;
$$;
