-- Teams + Places + Consumption — Task 8c follow-up:
-- Fix warehouse_transfer_items visibility on cross-division transfers.
--
-- Symptom (observed 2026-08-03): a custody_return from Team 2 (Kitchen sub)
-- to Birkat Alawamer Warehouse (Maintenance sub). The receiving admin's
-- active_division was Maintenance. On the Transfers page they saw the
-- transfer header + Confirm Receival button but ZERO items — clicking
-- Confirm Receival still fired but the receival subform was empty (no
-- inputs, no dispatched-qty context). Switching to a Kitchen-active
-- account showed the items normally.
--
-- Root cause: Phase C.3 shipped
--   `sub_container_scope_select_r` on warehouse_transfer_items
-- keyed on the item's own sub_container_id — which captures the SOURCE
-- sub on both create_transfer_v2 and the custody RPCs. When the source
-- sub's division isn't in the reader's active_division set,
-- is_sub_container_visible() returns false and the item row is filtered
-- out even though the reader has full access to the destination side.
-- The parent warehouse_transfers policy already tolerates this — it
-- admits transfers where EITHER endpoint sub is visible. The children
-- policy didn't follow.
--
-- Fix: rewrite the transfer_items SELECT policy to also admit rows via
-- either endpoint sub on the parent transfer. Strictly permissive — no
-- row that was visible before becomes hidden.
--
-- Note: Phase E (20260810000100) already dropped
-- warehouse_transfers.division_id + the division_scope RLS family, so
-- there's nothing division-column-related to stamp here. The visibility
-- fix is enough.
--
-- Prior migration: 20260815001100_custody_request_dispatch_flow.sql

DROP POLICY IF EXISTS sub_container_scope_select_r ON public.warehouse_transfer_items;

CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfer_items
  AS RESTRICTIVE FOR SELECT
  USING (
    public.is_sub_container_visible(sub_container_id)
    OR EXISTS (
      SELECT 1
      FROM   public.warehouse_transfers t
      WHERE  t.id = warehouse_transfer_items.transfer_id
        AND (
             public.is_sub_container_visible(t.from_sub_container_id)
          OR public.is_sub_container_visible(t.to_sub_container_id)
        )
    )
  );

COMMENT ON POLICY sub_container_scope_select_r ON public.warehouse_transfer_items IS
'Admits transfer_items visible via the item''s own sub_container_id OR either
endpoint on the parent transfer. Mirrors the parent warehouse_transfers
sub_container_scope_select_r policy so cross-division transfers (notably
custody moves between real WHs and Teams/Places virtual WHs) show their item
lists to both sides.';

-- Sanity check: matching INSERT/UPDATE/DELETE policies stay strict (an
-- item can only be created / mutated by callers who own its own
-- sub_container_id — same behaviour as before). Only SELECT is widened.
