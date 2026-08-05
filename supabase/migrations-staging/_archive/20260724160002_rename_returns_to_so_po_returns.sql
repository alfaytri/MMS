-- Rename the polymorphic returns table. The name `returns` was ambiguous
-- (returns from what?); `so_po_returns` states it holds both sales-order
-- returns (source_type='sale_order') and purchase-order returns
-- (source_type='purchase_order') in one table.
--
-- ALTER TABLE RENAME preserves indexes, RLS policies, triggers, and FK
-- constraints pointing at the table. Existing stored functions that
-- reference `returns` in their bodies (dispatch_return, undispatch_return,
-- restock_return, and their FIFO variants) are backed by a compatibility
-- view for now — Batch B will rewrite those function bodies and drop the
-- view.

BEGIN;

ALTER TABLE public.returns RENAME TO so_po_returns;

-- Backward-compat view so existing plpgsql functions that hardcode `returns`
-- keep working. It's a plain SELECT * so PostgreSQL treats it as an updatable
-- view — inserts, updates and deletes pass straight through to so_po_returns.
CREATE OR REPLACE VIEW public.returns AS
SELECT * FROM public.so_po_returns;

COMMENT ON VIEW public.returns IS
  'DEPRECATED — compatibility view for legacy RPCs that reference "returns". Do not add new callers; use public.so_po_returns directly.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
