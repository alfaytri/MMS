-- Cleanup: remove the orphaned CC-Monitoring-only backend left after the
-- monitoring UI was deleted (page/TranscriptViewer/useCCMonitoring/nav).
-- KEEP cc_handling_events (the inbox's useCCPresence still INSERTs handling
-- events), its INSERT policy (gated by the SHARED _auth_has_cc_access()), and
-- its indexes. Only the two monitoring reader RPCs and the monitoring
-- permission helper have no callers left.
BEGIN;

-- The SELECT policy gated reads on _auth_has_cc_monitoring() (monitoring-only).
-- Nothing reads cc_handling_events now, so drop the monitoring branch and keep a
-- harmless self-read rule; this also frees _auth_has_cc_monitoring() to be dropped.
DROP POLICY IF EXISTS cc_handling_select ON public.cc_handling_events;
CREATE POLICY cc_handling_select ON public.cc_handling_events
  FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP FUNCTION IF EXISTS public.cc_monitoring_feed(integer);
DROP FUNCTION IF EXISTS public.cc_conversation_transcript(uuid);
DROP FUNCTION IF EXISTS public._auth_has_cc_monitoring();

COMMIT;
NOTIFY pgrst, 'reload schema';
