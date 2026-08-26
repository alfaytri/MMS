-- P1 hardening — from the 2026-08-26 prod DB audit (docs/DB Audits/2026-08-26-prod-db-audit.md).
-- C3 already closed anon access on these two tables (made them login-only); this
-- tightens them further so an authenticated user can't reach data that isn't theirs.
--
--   1. sale_delivery_lines — give it the SAME division-scope RESTRICTIVE layer its
--      parent sale_deliveries already has (mirrors sale_order_lines), so a user
--      only sees/writes delivery LINES for deliveries in a division they can see.
--      Read paths: mostly nested under sale_deliveries (already parent-scoped);
--      a few DIRECT reads (returns / repair pickers) were returning cross-division
--      rows — this is what the layer fixes. Client writes are always for the user's
--      own delivery (same division), and the DEFINER RPCs bypass RLS.
--
--   2. notifications — scope SELECT + DELETE to the recipient (profile_id), so a
--      user can only READ their own notifications. INSERT and UPDATE stay OPEN on
--      purpose: the app creates notifications for OTHER users (recipients), and
--      clears other users' 'po_approval_requested' notifications on PO recall/unlock
--      (usePurchaseOrders) — both are client-side and would silently break if scoped.
--      Mark-as-read / actioned of one's own notifications keeps working under the
--      open UPDATE. The privacy goal (don't let a user READ others' notifications)
--      is met by the SELECT scope.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

-- ================= 1. sale_delivery_lines: division scope via delivery -> order =================
DROP POLICY IF EXISTS division_scope_select_r ON public.sale_delivery_lines;
CREATE POLICY division_scope_select_r ON public.sale_delivery_lines
  AS RESTRICTIVE FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sale_deliveries d
    JOIN public.sale_orders so ON so.id = d.sale_order_id
    WHERE d.id = sale_delivery_lines.sale_delivery_id
      AND public.is_division_visible(so.division_id)));

DROP POLICY IF EXISTS division_scope_insert_r ON public.sale_delivery_lines;
CREATE POLICY division_scope_insert_r ON public.sale_delivery_lines
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sale_deliveries d
    JOIN public.sale_orders so ON so.id = d.sale_order_id
    WHERE d.id = sale_delivery_lines.sale_delivery_id
      AND public.is_division_visible(so.division_id)));

DROP POLICY IF EXISTS division_scope_update_r ON public.sale_delivery_lines;
CREATE POLICY division_scope_update_r ON public.sale_delivery_lines
  AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.sale_deliveries d
    JOIN public.sale_orders so ON so.id = d.sale_order_id
    WHERE d.id = sale_delivery_lines.sale_delivery_id
      AND public.is_division_visible(so.division_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sale_deliveries d
    JOIN public.sale_orders so ON so.id = d.sale_order_id
    WHERE d.id = sale_delivery_lines.sale_delivery_id
      AND public.is_division_visible(so.division_id)));

DROP POLICY IF EXISTS division_scope_delete_r ON public.sale_delivery_lines;
CREATE POLICY division_scope_delete_r ON public.sale_delivery_lines
  AS RESTRICTIVE FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.sale_deliveries d
    JOIN public.sale_orders so ON so.id = d.sale_order_id
    WHERE d.id = sale_delivery_lines.sale_delivery_id
      AND public.is_division_visible(so.division_id)));

-- ================= 2. notifications: per-recipient READ (and DELETE) scoping =================
DROP POLICY IF EXISTS allow_all_notifications  ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_any ON public.notifications;
DROP POLICY IF EXISTS notifications_update_any ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;

-- Read only your own notifications.
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (profile_id = public._current_user_data_id());

-- INSERT stays open: the app creates notifications addressed to OTHER users.
CREATE POLICY notifications_insert_any ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE stays open: PO recall/unlock clears OTHER users' 'po_approval_requested'
-- notifications (mark read), and own mark-read/actioned also flows through here.
-- Only benign read_at/actioned_at timestamps are ever written.
CREATE POLICY notifications_update_any ON public.notifications
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- DELETE only your own (no cross-user client delete exists; cleanup is a DEFINER RPC).
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (profile_id = public._current_user_data_id());
