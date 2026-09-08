-- Per-order internal Discussion: a polymorphic message thread (po|so) plus an
-- attachments table mirrored on bill_attachments, and a private bucket mirrored
-- on bill-attachments. Staff-only; nothing leaves the app.
BEGIN;

CREATE TABLE IF NOT EXISTS public.order_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_kind  text NOT NULL CHECK (order_kind IN ('po','so')),
  order_id    uuid NOT NULL,
  author_id   uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  author_name text,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_chat_messages_thread_idx
  ON public.order_chat_messages (order_kind, order_id, created_at);

CREATE TABLE IF NOT EXISTS public.order_chat_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.order_chat_messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  file_name   text NOT NULL,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_chat_attachments_message_idx
  ON public.order_chat_attachments (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_chat_attachments_storage_key_uniq
  ON public.order_chat_attachments (storage_key);

ALTER TABLE public.order_chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_chat_attachments ENABLE ROW LEVEL SECURITY;

-- Any authenticated staff may read + post; only the author may delete their own.
-- (Author match is an inline subquery so this does not depend on a helper fn.)
CREATE POLICY "order_chat_messages read"   ON public.order_chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_chat_messages insert" ON public.order_chat_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "order_chat_messages delete" ON public.order_chat_messages FOR DELETE TO authenticated
  USING (author_id = (SELECT id FROM public.user_data WHERE auth_user_id = auth.uid()));

CREATE POLICY "order_chat_attachments read"   ON public.order_chat_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_chat_attachments insert" ON public.order_chat_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "order_chat_attachments delete" ON public.order_chat_attachments FOR DELETE TO authenticated
  USING (uploaded_by = (SELECT id FROM public.user_data WHERE auth_user_id = auth.uid()));

-- Private bucket (mirror of bill-attachments): 5 MB, pdf + images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-chat-attachments', 'order-chat-attachments', false, 5 * 1024 * 1024,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "order_chat_attachments_bucket_read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'order-chat-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "order_chat_attachments_bucket_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'order-chat-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "order_chat_attachments_bucket_update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'order-chat-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "order_chat_attachments_bucket_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'order-chat-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
