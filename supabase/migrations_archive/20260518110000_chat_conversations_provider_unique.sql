-- Replace single-column unique constraint with (wati_phone, provider)
-- so WATI and WHAPI conversations for the same phone are separate rows.
ALTER TABLE chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_wati_phone_key;

ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_wati_phone_provider_key
  UNIQUE (wati_phone, provider);
