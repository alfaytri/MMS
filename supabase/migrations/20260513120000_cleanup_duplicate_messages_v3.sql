-- Remove duplicate agent messages caused by numeric-id vs wamid external_id mismatch:
--   • app stores wati_<numericId> (from Wati send API response)
--   • fetch-messages stores <wamid>   (from Wati getMessages API response)
-- Both are the same physical message — only one row should exist.
--
-- Strategy: within each conversation, for any two agent message rows with identical
-- text within 5 minutes of each other, keep the wamid row (wAMID...) and delete the
-- wati_-prefixed or null-external_id duplicate.

DELETE FROM public.chat_messages a
WHERE a.from_type = 'agent'
  AND a.message_kind = 'message'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.from_type = 'agent'
      AND b.message_kind = 'message'
      AND b.id <> a.id
      AND b.text = a.text
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) < 300
      -- keep b (better row): prefer wamid > wati_ > numeric > null
      AND (
        (b.external_id LIKE 'wAMID%' AND (a.external_id NOT LIKE 'wAMID%' OR a.external_id IS NULL)) OR
        (b.external_id LIKE 'wati_%' AND (a.external_id NOT LIKE 'wAMID%' AND a.external_id NOT LIKE 'wati_%')) OR
        (b.external_id IS NOT NULL AND a.external_id IS NULL)
      )
  );

-- Same cleanup for customer messages within 60 s window
DELETE FROM public.chat_messages a
WHERE a.from_type = 'customer'
  AND a.message_kind = 'message'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.from_type = 'customer'
      AND b.message_kind = 'message'
      AND b.id <> a.id
      AND b.text = a.text
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) < 60
      AND (
        (b.external_id LIKE 'wAMID%' AND (a.external_id NOT LIKE 'wAMID%' OR a.external_id IS NULL)) OR
        (b.external_id IS NOT NULL AND a.external_id IS NULL)
      )
  );
