-- Batch 5b — approval-execution siblings surfaced by the batch-5 sweep.
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md (§ Approval-execution).
--
-- A post-batch-5 sweep of every SECURITY DEFINER function matching
-- approv|advance|reject|action.*step found two more internal-only mutators still
-- directly EXECUTE-able by `authenticated` with no caller authorization:
--
--   approve_receival_inventory(uuid, text) — the RECEIVAL sibling of the
--   stock-adjustment hole: flips a receival to approved and POSTS inventory
--   (FIFO layers + stock_level + stock movements + recalc_average_cost), or on
--   'rejected' reverses po_line_items.received_qty. Orphaned — the live flow uses
--   the gated create_and_approve_receival; nothing (function or client) calls this
--   one. A direct call would post/reverse receival inventory with no permission.
--
--   build_sales_approval_chain(uuid, approval_type, jsonb) — inserts pending
--   sale_order_approvals rows from the configured workflow. Called ONLY by the
--   gated create_sale_order / apply_sale_order_edit / resubmit_sale_order (all
--   SECURITY DEFINER owned by postgres). A direct call would let a user inject
--   arbitrary approval rows for any sale order.
--
-- Both owned by postgres, so revoking `authenticated` closes the direct attack
-- surface without breaking the internal PERFORM calls (a DEFINER function's
-- effective user is its owner). Verified: 0 client call-sites for either.
--
-- NOT revoked: build_inv_check_approval_chain (STABLE, read-only preview the UI
-- calls — no writes, non-sensitive) and _sale_orders_block_bypass_approval
-- (a trigger function; Postgres forbids direct invocation).

REVOKE ALL ON FUNCTION public.approve_receival_inventory(uuid, text)                 FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.build_sales_approval_chain(uuid, approval_type, jsonb) FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
