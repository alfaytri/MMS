-- Distinguish real chat messages from Wati system activity events
-- ('Chat is now assigned to...', 'The chat has been initialized by...', etc.)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'message';
