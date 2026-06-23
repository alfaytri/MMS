-- WhatsApp "delete for everyone" (a.k.a. message revocation) needs its own
-- column. Reusing `deleted_at` would conflict with the existing soft-delete
-- semantic from the purge-admin feature — purged rows are filtered out
-- entirely from the UI, but a revoked message should remain visible as a
-- "This message was deleted" placeholder.
--
-- revoked_at = when the sender deleted the message via WhatsApp.
-- deleted_at = when the purge-admin soft-deleted the message (unchanged).

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chat_messages_revoked_at
  ON chat_messages (revoked_at)
  WHERE revoked_at IS NOT NULL;
