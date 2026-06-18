-- supabase/migrations/20260511210000_contact_centre_phase1.sql
-- Contact Centre Phase 1 — chat tables, customer extensions, permissions

BEGIN;

-- ── 1. Extend service_customers if it exists (new schema) ───────────────────
ALTER TABLE public.service_customers
  ADD COLUMN IF NOT EXISTS is_blocked          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_type       TEXT    NOT NULL DEFAULT 'individual'
    CHECK (customer_type IN ('individual', 'business')),
  ADD COLUMN IF NOT EXISTS pending_payment_amount NUMERIC NOT NULL DEFAULT 0;

-- ── 2. Add is_geocoded to service_customer_addresses if it exists ──────────
ALTER TABLE public.service_customer_addresses
  ADD COLUMN IF NOT EXISTS is_geocoded BOOLEAN NOT NULL DEFAULT true;

-- ── 3. Extend existing chat_conversations with new columns ─────────────────
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS conversation_type TEXT DEFAULT 'customer'
    CHECK (conversation_type IN ('customer', 'team')),
  ADD COLUMN IF NOT EXISTS wati_phone TEXT;

-- ── 4. Create index on wati_phone if it doesn't exist ───────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_conversations_wati_phone
  ON public.chat_conversations (wati_phone);

-- ── 5. customer_blocks table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES public.service_customers(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  notes       TEXT,
  image_url   TEXT,
  blocked_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_blocks_select" ON public.customer_blocks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cc_blocks_insert" ON public.customer_blocks
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── 6. Extend chat_messages with new columns ──────────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS delivery_status   TEXT DEFAULT 'sending'
    CHECK (delivery_status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS external_id       TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_external_id TEXT,
  ADD COLUMN IF NOT EXISTS sent_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 7. Create unique index on external_id for chat_messages ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_external_id
  ON public.chat_messages (external_id)
  WHERE external_id IS NOT NULL;

-- ── 8. Permission seed ────────────────────────────────────────────────────────
UPDATE public.custom_roles
SET permissions = array_append(permissions, 'contact_centre.view')
WHERE name IN ('Call Centre', 'Owner')
  AND NOT ('contact_centre.view' = ANY(permissions));

COMMIT;
