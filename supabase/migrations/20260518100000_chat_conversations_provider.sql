-- Add provider column to chat_conversations to separate WATI and WHAPI message streams
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'wati'
    CHECK (provider IN ('wati', 'whapi'));

-- Backfill: all existing rows are WATI conversations
UPDATE chat_conversations SET provider = 'wati' WHERE provider IS DISTINCT FROM 'wati';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_provider
  ON chat_conversations (provider);
