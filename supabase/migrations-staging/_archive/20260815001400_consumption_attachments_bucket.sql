-- Teams + Places + Consumption — Task 9 storage
--
-- Creates the private `consumption-attachments` bucket that stores the
-- optional files an operator attaches to a Consumption entry (photo of
-- the consumed material, delivery slip, hand-written job note, etc.).
--
-- Any authenticated user can read (via signed URL) and write. The
-- consumption RPC is already SECURITY DEFINER and any-authenticated per
-- plan design, so the storage policy mirrors that policy — extra
-- role-gating here would be inconsistent with the RPC gate.
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md (Task 9 storage).
-- Bucket pattern mirrors 20260626120000_customer_credit_docs.sql.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('consumption-attachments', 'consumption-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "consumption_attachments_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'consumption-attachments');

CREATE POLICY "consumption_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'consumption-attachments');

CREATE POLICY "consumption_attachments_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'consumption-attachments')
  WITH CHECK (bucket_id = 'consumption-attachments');

CREATE POLICY "consumption_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'consumption-attachments');

COMMIT;
