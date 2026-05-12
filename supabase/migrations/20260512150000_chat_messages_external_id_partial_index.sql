-- Allow multiple NULL external_id rows (outgoing messages before Wati returns an ID).
-- Only enforce uniqueness on actual Wati message IDs.
DROP INDEX IF EXISTS chat_messages_external_id_unique;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_external_id_unique;
CREATE UNIQUE INDEX chat_messages_external_id_unique
  ON chat_messages (external_id)
  WHERE external_id IS NOT NULL;
