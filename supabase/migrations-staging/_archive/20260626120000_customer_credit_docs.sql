-- supabase/migrations/20260626120000_customer_credit_docs.sql
-- Boss-review correction: require uploaded credit docs before assigning a customer
-- to a credit group, and gate credit-group changes behind a dedicated permission.
--
-- - Adds doc-path + uploaded-at columns to `customers`
-- - Creates the private `customer-credit-docs` storage bucket with role-gated RLS
BEGIN;

-- ─── customers: doc paths + timestamps ───────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cr_url                  TEXT,
  ADD COLUMN IF NOT EXISTS cr_uploaded_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS establishment_id_url    TEXT,
  ADD COLUMN IF NOT EXISTS establishment_id_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_credit_form_url  TEXT,
  ADD COLUMN IF NOT EXISTS signed_credit_form_uploaded_at TIMESTAMPTZ;

-- ─── storage bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-credit-docs', 'customer-credit-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: can the calling auth user write credit docs?
-- Anyone with master_data.customers.manage OR master_data.customers.change_credit_group
-- can upload; system roles bypass the check (Owner / Admin).
CREATE OR REPLACE FUNCTION storage_customer_credit_docs_write_allowed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id           = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system = true
      OR 'master_data.customers.manage' = ANY(cr.permissions)
      OR 'master_data.customers.change_credit_group' = ANY(cr.permissions)
    )
  )
$$;

-- Read: any authenticated user (downloads still require a signed URL)
CREATE POLICY "customer_credit_docs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-credit-docs');

CREATE POLICY "customer_credit_docs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-credit-docs' AND storage_customer_credit_docs_write_allowed());

CREATE POLICY "customer_credit_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'customer-credit-docs' AND storage_customer_credit_docs_write_allowed())
  WITH CHECK (bucket_id = 'customer-credit-docs' AND storage_customer_credit_docs_write_allowed());

CREATE POLICY "customer_credit_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-credit-docs' AND storage_customer_credit_docs_write_allowed());

COMMIT;
