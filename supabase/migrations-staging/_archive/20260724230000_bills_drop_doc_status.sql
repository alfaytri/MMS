-- Drop bills.doc_status entirely.
--
-- The 6-value approval workflow (draft → ready_to_send → sent →
-- pending_approval → approved/rejected) was copy-pasted from the AR
-- invoices column when bills were split off in 20260721140000. For AP
-- supplier bills the workflow never made business sense — the supplier
-- sends the bill to us, we don't "send" it anywhere — and the approval
-- hook (useApproveBill) was never wired into any UI, so no bill has
-- ever transitioned past 'draft'. Aging reports filtered out 'rejected'
-- but nothing ever sets that either.
--
-- Remove the column. If bill-level approval is ever needed later, model
-- it via a dedicated approvals table (like po_approvals) rather than a
-- single status column.

ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_doc_status_check;

ALTER TABLE public.bills
  DROP COLUMN IF EXISTS doc_status;
