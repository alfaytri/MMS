-- Creates a function that backfills last_message / last_message_at on
-- chat_conversations from the most recent chat_messages row for each
-- conversation where last_message is still null.
--
-- Why: Wati's /getContacts API often omits lastMessage, so synced contacts
-- end up with last_message = NULL in chat_conversations even though their
-- message history exists in chat_messages. This function is called at the
-- end of every sync so the list always shows the real last message text.

CREATE OR REPLACE FUNCTION backfill_conversation_last_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      COALESCE(NULLIF(text, ''), '[message]') AS last_msg,
      created_at
    FROM chat_messages
    WHERE message_kind = 'message'
    ORDER BY conversation_id, created_at DESC
  )
  UPDATE chat_conversations cc
  SET
    last_message    = latest.last_msg,
    last_message_at = GREATEST(
      COALESCE(cc.last_message_at, '1970-01-01'::timestamptz),
      latest.created_at
    )
  FROM latest
  WHERE cc.id = latest.conversation_id
    AND (cc.last_message IS NULL OR cc.last_message = '');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Run the backfill immediately on migration apply
SELECT backfill_conversation_last_messages();
