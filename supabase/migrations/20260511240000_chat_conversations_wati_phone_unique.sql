-- Ensure wati_phone is unique so upsert ON CONFLICT works
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_wati_phone_key UNIQUE (wati_phone);
