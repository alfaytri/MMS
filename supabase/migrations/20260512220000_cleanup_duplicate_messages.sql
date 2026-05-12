-- Clean up duplicate chat_messages rows caused by fetch-messages storing bare
-- external_id while MMS send-flow stored wati_<id> for the same message.
-- Strategy: keep the wati_-prefixed row (it has delivery_status, reactions, etc.)
-- and delete any bare-id duplicate that refers to the same conversation + text + time window.

DELETE FROM public.chat_messages a
WHERE a.external_id IS NOT NULL
  AND a.external_id NOT LIKE 'wati_%'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.external_id = 'wati_' || a.external_id
  );
