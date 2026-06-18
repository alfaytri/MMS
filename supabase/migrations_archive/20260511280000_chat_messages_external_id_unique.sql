-- Deduplicate chat_messages rows with the same external_id (keep the oldest)
DELETE FROM chat_messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY created_at ASC) AS rn
    FROM   chat_messages
    WHERE  external_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Unique index on external_id (NULLs not constrained — multiple agent-sent messages can have NULL)
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_external_id_unique
  ON chat_messages (external_id)
  WHERE external_id IS NOT NULL;
