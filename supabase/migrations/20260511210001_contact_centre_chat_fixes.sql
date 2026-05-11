-- supabase/migrations/20260511210001_contact_centre_chat_fixes.sql
-- Fix chat table schema gaps for Contact Centre Phase 1

BEGIN;

-- ── 1. Make chat_conversations.customer_id nullable and re-point to service_customers ──
-- Drop the old NOT NULL constraint and re-FK to service_customers
ALTER TABLE public.chat_conversations
  ALTER COLUMN customer_id DROP NOT NULL;

-- Drop old FK to customers table, add new FK to service_customers
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.chat_conversations'::regclass
    AND contype = 'f'
    AND conname LIKE '%customer_id%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chat_conversations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES public.service_customers(id)
  ON DELETE SET NULL;

-- ── 2. Make conversation_type NOT NULL (rows already have default value) ──
UPDATE public.chat_conversations SET conversation_type = 'customer' WHERE conversation_type IS NULL;
ALTER TABLE public.chat_conversations ALTER COLUMN conversation_type SET NOT NULL;

-- ── 3. Make chat_messages.text nullable (attachment-only messages have no text) ──
ALTER TABLE public.chat_messages ALTER COLUMN text DROP NOT NULL;

-- ── 4. Add compound index on chat_messages for thread queries ──
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages (conversation_id, created_at DESC);

COMMIT;
