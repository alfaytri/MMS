-- Composite index used by the chat_conversations.last_message_from_type backfill
-- AND by future queries that ask "give me the latest message for a conversation".
-- Created CONCURRENTLY so production traffic isn't blocked. The IF NOT EXISTS
-- makes this migration idempotent (Supabase CLI may re-run on retry).
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_messages_conv_created_idx
  ON chat_messages (conversation_id, created_at DESC);
