-- supabase/migrations/20260425000200_lc_bills_bucket.sql
BEGIN;

-- Private bucket — no direct public URL access
INSERT INTO storage.buckets (id, name, public)
VALUES ('lc-bills', 'lc-bills', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: does the calling auth user hold LC management permission?
CREATE OR REPLACE FUNCTION storage_lc_bills_write_allowed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$$;

-- Read: any authenticated user (downloads require signed URL anyway)
CREATE POLICY "lc_bills_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lc-bills');

-- Write: LC managers and system admins only
CREATE POLICY "lc_bills_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

CREATE POLICY "lc_bills_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed())
  WITH CHECK (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

CREATE POLICY "lc_bills_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING  (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

COMMIT;
