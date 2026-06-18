ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS wati_contact_name TEXT;
