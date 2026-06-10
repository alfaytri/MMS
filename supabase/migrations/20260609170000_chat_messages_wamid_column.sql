-- Add wamid column to chat_messages.
-- WhatsApp assigns a unique wamid (e.g. wamid.HBgL...) to every message.
-- Wati's send API returns a DIFFERENT numeric ID (e.g. 6a27ddb9154dde138e014fb3)
-- which is stored in external_id. Reactions, however, reference the wamid.
-- This column bridges the two ID systems so reaction webhooks can find their target.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS wamid TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_wamid
  ON public.chat_messages (wamid)
  WHERE wamid IS NOT NULL;
