-- Remove rows with NULL wati_phone (can't conflict-upsert on NULL)
DELETE FROM public.chat_conversations WHERE wati_phone IS NULL;

-- Remove duplicate wati_phones, keeping the most recently updated row
DELETE FROM public.chat_conversations
WHERE id NOT IN (
  SELECT DISTINCT ON (wati_phone) id
  FROM public.chat_conversations
  WHERE wati_phone IS NOT NULL
  ORDER BY wati_phone, last_message_at DESC NULLS LAST, created_at DESC
);

-- Drop old attempt if it exists, then add clean constraint
ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_wati_phone_key;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_wati_phone_key UNIQUE (wati_phone);
