-- 1. Fix external_id unique index: drop partial, create full.
--    PostgreSQL allows multiple NULLs in a full unique index, so no rows are lost.
--    The full index is required for ON CONFLICT (external_id) to work in Supabase upsert.
DROP INDEX IF EXISTS chat_messages_external_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_external_id_unique
  ON chat_messages (external_id);

-- 2. Conversation metadata
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_agent text,
  ADD COLUMN IF NOT EXISTS is_opened      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wati_status    text    NOT NULL DEFAULT 'open';
