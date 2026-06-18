-- Restore full unique index on external_id.
-- PostgreSQL natively allows multiple NULLs in a full unique index (NULL != NULL),
-- so outgoing messages with external_id = NULL do not conflict with each other.
-- A full index (no WHERE clause) is required for ON CONFLICT (external_id) in
-- the fetch-messages upsert — a partial index breaks that conflict target lookup.
DROP INDEX IF EXISTS chat_messages_external_id_unique;
DROP INDEX IF EXISTS idx_chat_messages_external_id;
CREATE UNIQUE INDEX chat_messages_external_id_unique
  ON chat_messages (external_id);
