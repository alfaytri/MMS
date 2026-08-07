-- One-off cleanup: delete bill_attachments rows whose storage object no
-- longer exists in the `bill-attachments` bucket. Fixes rows created
-- before the sweep-on-submit ordering bug was patched — where the
-- storage object was removed by a stale-closure cancel-sweep even though
-- the DB row was successfully written by persistBillAttachments.
--
-- Idempotent: no-op on any future DB where storage and rows stay in sync.

BEGIN;

DELETE FROM public.bill_attachments a
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.objects o
  WHERE o.bucket_id = 'bill-attachments'
    AND o.name = a.storage_key
);

COMMIT;
