-- Allow authenticated users to update chat_messages.
-- This is needed for:
--   • agents adding/removing emoji reactions (reactions column)
--   • the webhook service role updating delivery_status/external_id
-- The webhook uses the service role key and bypasses RLS; this policy
-- covers browser-client actions (reactions from the agent UI).

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user can read all messages
DROP POLICY IF EXISTS "cc_messages_select" ON public.chat_messages;
CREATE POLICY "cc_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

-- INSERT: authenticated users can insert messages (optimistic inserts from the app)
DROP POLICY IF EXISTS "cc_messages_insert" ON public.chat_messages;
CREATE POLICY "cc_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: authenticated users can update any message
-- (reactions, delivery_status patching from the browser client)
DROP POLICY IF EXISTS "cc_messages_update" ON public.chat_messages;
CREATE POLICY "cc_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
