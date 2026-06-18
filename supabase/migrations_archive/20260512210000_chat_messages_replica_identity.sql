-- Required for Supabase Realtime postgres_changes filtered subscriptions.
-- Without REPLICA IDENTITY FULL, Postgres only includes the primary key in
-- WAL events for UPDATE/DELETE, so the `conversation_id=eq.X` channel filter
-- never matches and no events are delivered to the browser.
-- INSERT events also benefit — the full NEW row is always present.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_conversations REPLICA IDENTITY FULL;
