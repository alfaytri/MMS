-- Phase 2 "Cancel & Return everything": mark a sales return as the vehicle for a
-- full SO cancellation. When true: the client skips the auto return credit note
-- (money flows through the cancel's refund CN instead), the return is excluded
-- from the "needs credit note" UI, and restocking it auto-runs
-- rpc_finalize_shipped_so_cancel (void invoice + refund CN for amount paid +
-- cancel the SO). Default false → zero effect on every existing return.
BEGIN;

ALTER TABLE public.so_po_returns
  ADD COLUMN IF NOT EXISTS cancels_sale_order boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.so_po_returns.cancels_sale_order IS
  'When true this return is a full-cancellation return: no return CN is created; '
  'on restock the SO is finalized-cancelled (invoice voided + refund CN for amount paid). Phase 2.';

COMMIT;

NOTIFY pgrst, 'reload schema';
