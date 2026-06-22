-- WATI's sendReaction endpoint identifies messages by their internal
-- MongoDB ObjectID (24-char hex), not by the WhatsApp wamid we store in
-- external_id. Add a dedicated column so we can pass WATI back its own id
-- without a getMessages round-trip for every reaction.
--
-- The webhook update that populates this column comes in the same change set
-- as this migration. Old messages that pre-date the webhook update fall back
-- to a getMessages lookup; the index makes the typical eq('external_id', ...)
-- lookup-then-grab-wati_id query cheap even on large message tables.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS wati_id text;

CREATE INDEX IF NOT EXISTS idx_chat_messages_wati_id
  ON chat_messages (wati_id)
  WHERE wati_id IS NOT NULL;
