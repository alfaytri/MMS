-- Bill attachments: supplier-invoice PDFs / scans / photos attached to
-- purchase bills at creation time so AP audit doesn't require digging
-- through email later.
--
-- Mirrors the shape used by landed-cost bill attachments (lc-bills bucket +
-- bill_path column on landed_cost_lines) but as a proper 1-to-many table
-- so a single bill can hold multiple files (invoice + delivery slip + …).
--
-- Storage:
--   bill-attachments — private bucket, 5 MB per file, PDF/JPG/PNG/WEBP.
--
-- RLS:
--   Row visibility inherits from the parent bill (an EXISTS subquery
--   against public.bills, which is already restricted by division scope
--   + bills.manage permission via existing policies).

BEGIN;

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bill_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id      uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bill_attachments_bill_id_idx
  ON public.bill_attachments (bill_id);

CREATE UNIQUE INDEX IF NOT EXISTS bill_attachments_storage_key_uniq
  ON public.bill_attachments (storage_key);

ALTER TABLE public.bill_attachments ENABLE ROW LEVEL SECURITY;

-- ── RLS: inherit from parent bill ───────────────────────────────────────────
-- SELECT: anyone who can see the bill can see its attachments.
CREATE POLICY "bill_attachments_select_via_bill" ON public.bill_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b WHERE b.id = bill_attachments.bill_id
    )
  );

-- INSERT / UPDATE / DELETE: gated on purchase.bills.manage — same permission
-- as recording the bill itself.
CREATE POLICY "bill_attachments_insert_bills_manage" ON public.bill_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage')
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_attachments.bill_id)
  );

CREATE POLICY "bill_attachments_update_bills_manage" ON public.bill_attachments
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "bill_attachments_delete_bills_manage" ON public.bill_attachments
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

-- ── Storage bucket ──────────────────────────────────────────────────────────
-- Private: supplier invoices contain commercial-sensitive data (unit prices,
-- payment terms). The app mints short-lived signed URLs for viewing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bill-attachments',
  'bill-attachments',
  false,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "bill_attachments_bucket_auth_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'bill-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bill_attachments_bucket_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'bill-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bill_attachments_bucket_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'bill-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bill_attachments_bucket_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'bill-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
