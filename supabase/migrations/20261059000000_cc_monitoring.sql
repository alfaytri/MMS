-- Contact Centre monitoring — Phase 1 foundation.
--   1. cc_handling_events: permanent log of which agent opened which conversation
--      (the reliable "who handled what" record, even when they only read).
--   2. _auth_has_cc_monitoring(): permission gate for the monitoring/audit screen.
--   3. realtime RLS extended so CC agents can use a private `cc:presence` channel
--      for the live "who has this chat open right now" badges.
--
-- APPLIED DEV ONLY (wkmvjxxmzstsvahuiwsz) — whole-app migrations are manual-apply.

BEGIN;

-- ── 1. Handling log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cc_handling_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  profile_id      uuid,          -- user_data.id of the agent who opened it
  agent_name      text,
  auth_user_id    uuid,          -- auth.users id (for the "own events" RLS check)
  opened_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_handling_events_conv_idx  ON public.cc_handling_events (conversation_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS cc_handling_events_agent_idx ON public.cc_handling_events (profile_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS cc_handling_events_time_idx  ON public.cc_handling_events (opened_at DESC);

ALTER TABLE public.cc_handling_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.cc_handling_events TO authenticated;

-- ── 2. Monitoring permission gate ───────────────────────────────────────────
-- _auth_user_has_permission already bypasses for system admins, so this is just
-- the CC-monitoring permission string.
CREATE OR REPLACE FUNCTION public._auth_has_cc_monitoring()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT public._auth_user_has_permission('contact_centre.monitoring');
$$;
GRANT EXECUTE ON FUNCTION public._auth_has_cc_monitoring() TO authenticated;

-- Agents log their own open events; monitors (+ system admins) read everything,
-- and anyone can read their own.
DROP POLICY IF EXISTS cc_handling_insert ON public.cc_handling_events;
CREATE POLICY cc_handling_insert ON public.cc_handling_events
  FOR INSERT TO authenticated
  WITH CHECK (public._auth_has_cc_access() AND auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cc_handling_select ON public.cc_handling_events;
CREATE POLICY cc_handling_select ON public.cc_handling_events
  FOR SELECT TO authenticated
  USING (public._auth_has_cc_monitoring() OR auth_user_id = (SELECT auth.uid()));

-- ── 3. Live presence channel authorization (cc:presence) ────────────────────
-- Receiving presence + broadcasts: SELECT on realtime.messages for our topics.
DROP POLICY IF EXISTS "cc_broadcast_receive" ON realtime.messages;
CREATE POLICY "cc_broadcast_receive" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (realtime.topic() = 'cc:inbox'
      OR realtime.topic() = 'cc:presence'
      OR realtime.topic() LIKE 'thread:%')
    AND public._auth_has_cc_access()
  );

-- Tracking presence (writing "I'm on conversation X") = INSERT, scoped to the
-- presence topic only so clients can't inject broadcasts on the message topics.
DROP POLICY IF EXISTS "cc_presence_send" ON realtime.messages;
CREATE POLICY "cc_presence_send" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() = 'cc:presence' AND public._auth_has_cc_access());

NOTIFY pgrst, 'reload schema';
COMMIT;
