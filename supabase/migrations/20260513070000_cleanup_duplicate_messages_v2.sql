-- Remove duplicate chat_messages caused by external_id format mismatch:
--   • app stores wati_<numericId>
--   • webhook stores <wamid>  (different string → both rows created)
--
-- Strategy: within each conversation, for any two agent rows with identical
-- text within 5 minutes of each other, keep the one with a non-null
-- external_id (preferring wamid over wati_ prefix) and delete the other.

-- Step 1: delete bare-numeric-id duplicates where a wati_-prefixed twin exists
-- (covered by previous migration 20260512220000 but re-run as safety net)
DELETE FROM public.chat_messages a
WHERE a.external_id IS NOT NULL
  AND a.external_id NOT LIKE 'wati_%'
  AND NOT a.external_id LIKE 'wAMID%'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.external_id = 'wati_' || a.external_id
  );

-- Step 2: delete duplicate agent messages within the same conversation
-- where text matches and timestamps are within 5 minutes — keep the
-- row whose external_id looks most like a wamid (starts with wAMID or is longer).
DELETE FROM public.chat_messages a
WHERE a.from_type = 'agent'
  AND a.message_kind = 'message'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.from_type = 'agent'
      AND b.id <> a.id
      AND b.text = a.text
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) < 300
      -- keep b (the better row): prefer wamid > wati_ > numeric > null
      AND (
        (b.external_id LIKE 'wAMID%' AND a.external_id NOT LIKE 'wAMID%') OR
        (b.external_id LIKE 'wati_%' AND a.external_id NOT LIKE 'wAMID%' AND a.external_id NOT LIKE 'wati_%') OR
        (b.external_id IS NOT NULL AND a.external_id IS NULL)
      )
  );

-- Step 3: deduplicate customer messages the same way
DELETE FROM public.chat_messages a
WHERE a.from_type = 'customer'
  AND a.message_kind = 'message'
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.from_type = 'customer'
      AND b.id <> a.id
      AND b.text = a.text
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) < 60
      AND (
        (b.external_id LIKE 'wAMID%' AND a.external_id NOT LIKE 'wAMID%') OR
        (b.external_id IS NOT NULL AND a.external_id IS NULL)
      )
  );
