-- Remove old webhook-duplicate outgoing rows created before the race-condition fix.
-- Before the fix, every app-sent message produced two rows:
--   1. Inserted by the app:     external_id = 'wati_<id>'
--   2. Inserted by the webhook: external_id = '<id>'  (no prefix, often empty text)
-- Delete the non-prefixed duplicates that have a wati_-prefixed twin in the same conversation.
DELETE FROM chat_messages
WHERE from_type = 'agent'
  AND external_id IS NOT NULL
  AND external_id NOT LIKE 'wati_%'
  AND EXISTS (
    SELECT 1 FROM chat_messages cm2
    WHERE cm2.external_id = 'wati_' || chat_messages.external_id
      AND cm2.conversation_id = chat_messages.conversation_id
  );
