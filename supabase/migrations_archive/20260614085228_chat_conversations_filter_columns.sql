-- Adds the two columns that power the filter tabs:
--   last_message_from_type  → drives the Unanswered tab predicate
--   unanswered_dismissed_at → lets an agent escape the Thank-You loop
-- Nullable last_message_from_type covers conversations with no message yet.

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS last_message_from_type TEXT,
  ADD COLUMN IF NOT EXISTS unanswered_dismissed_at TIMESTAMPTZ;

-- Backfill BEFORE adding the CHECK constraint so legacy from_type values
-- (e.g. 'system', 'bot', 'automation' from old ingest paths) get coalesced
-- to 'customer' first. Without this order, the constraint would reject
-- the legacy values and crash the migration.
UPDATE chat_conversations cc
SET last_message_from_type = CASE
  WHEN m.from_type IN ('agent', 'customer') THEN m.from_type
  ELSE 'customer'
END
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, from_type
  FROM chat_messages
  WHERE message_kind = 'message'
  ORDER BY conversation_id, created_at DESC
) m
WHERE cc.id = m.conversation_id
  AND cc.last_message_from_type IS NULL;

ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_last_message_from_type_check
  CHECK (last_message_from_type IS NULL
      OR last_message_from_type IN ('agent', 'customer'));
