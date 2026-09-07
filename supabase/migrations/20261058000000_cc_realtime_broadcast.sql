-- Contact Centre realtime: Broadcast-from-DB replaces the unfiltered
-- postgres_changes fan-out on chat_messages.
--
-- A single AFTER trigger on chat_messages emits scoped broadcasts via
-- realtime.send:
--   • thread:{conversation_id}  — rich payload, every INSERT/UPDATE/DELETE.
--       Only agents with that conversation open subscribe, so delivery-status
--       churn (sending→sent→delivered→read) reaches ~1 viewer, not everyone.
--   • cc:inbox                  — tiny ping, only on INSERT of a customer
--       message. Drives the global chime + a conversation-list nudge.
--
-- Receiving is gated by RLS on realtime.messages to Contact-Centre users
-- (same rule as the sidebar gate). Sending is done by this SECURITY DEFINER
-- trigger, so it works regardless of which role wrote the chat row.
--
-- APPLIED DEV ONLY (wkmvjxxmzstsvahuiwsz). Whole-app migrations are
-- manual-apply — see the staging-migrations-not-auto-applied note.

BEGIN;

-- 1. Who may receive CC broadcasts — mirrors ContactCenterSidebarGate:
--    the direct has_contact_centre_access flag OR the contact_centre.view
--    permission (whose helper already bypasses for system admins).
CREATE OR REPLACE FUNCTION public._auth_has_cc_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
           (SELECT ud.has_contact_centre_access
              FROM public.user_data ud
             WHERE ud.auth_user_id = (SELECT auth.uid())
             LIMIT 1),
           false)
      OR public._auth_user_has_permission('contact_centre.view');
$$;

GRANT EXECUTE ON FUNCTION public._auth_has_cc_access() TO authenticated;

-- 2. The broadcast trigger. SECURITY DEFINER so the write into
--    realtime.messages runs with the definer's rights no matter who inserted
--    the chat row (authenticated client push, service_role webhook, …).
CREATE OR REPLACE FUNCTION public.cc_broadcast_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM realtime.send(
      jsonb_build_object('op', 'DELETE', 'id', OLD.id,
                         'conversation_id', OLD.conversation_id),
      'cc_message', 'thread:' || OLD.conversation_id::text, true);
    RETURN OLD;
  END IF;

  -- Rich payload to the per-conversation topic (only open-thread viewers listen).
  PERFORM realtime.send(
    jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)),
    'cc_message', 'thread:' || NEW.conversation_id::text, true);

  -- Lightweight global ping for a brand-new inbound customer message only.
  IF (TG_OP = 'INSERT' AND NEW.from_type = 'customer') THEN
    PERFORM realtime.send(
      jsonb_build_object('conversation_id', NEW.conversation_id,
                         'from_type',       NEW.from_type,
                         'preview',         left(COALESCE(NEW.text, ''), 80),
                         'created_at',      NEW.created_at),
      'cc_inbound', 'cc:inbox', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cc_broadcast_message_trg ON public.chat_messages;
CREATE TRIGGER cc_broadcast_message_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.cc_broadcast_message();

-- 3. Receive authorization for the private broadcast topics.
DROP POLICY IF EXISTS "cc_broadcast_receive" ON realtime.messages;
CREATE POLICY "cc_broadcast_receive" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (realtime.topic() = 'cc:inbox' OR realtime.topic() LIKE 'thread:%')
    AND public._auth_has_cc_access()
  );

-- 4. postgres_changes is retired for the chat tables → REPLICA IDENTITY FULL
--    no longer serves a purpose; shrink WAL back to the primary key.
ALTER TABLE public.chat_messages      REPLICA IDENTITY DEFAULT;
ALTER TABLE public.chat_conversations REPLICA IDENTITY DEFAULT;

COMMIT;
