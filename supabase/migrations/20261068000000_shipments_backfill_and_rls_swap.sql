-- 20261068000000_shipments_backfill_and_rls_swap.sql
-- Backfill existing shipments into the new model, THEN swap shipments' own
-- division-scope policies to key off the linked POs (via is_shipment_visible)
-- instead of the single po_id. Backfill runs FIRST so every existing row already
-- has lines and stays visible under the new policy. Plan Task 4.
BEGIN;

-- 1) whole-PO line backfill (idempotent)
INSERT INTO public.shipment_line_items (shipment_id, po_line_item_id, qty)
SELECT s.id, pli.id, pli.qty
  FROM public.shipments s
  JOIN public.po_line_items pli ON pli.po_id = s.po_id
 WHERE s.po_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.shipment_line_items x
      WHERE x.shipment_id = s.id AND x.po_line_item_id = pli.id);

-- 2) seed an ETD 'original' from the shipment's etd or the PO's expected_delivery
INSERT INTO public.shipment_schedule_revisions (shipment_id, leg, revision_type, date_value)
SELECT s.id, 'etd', 'original', COALESCE(s.etd, po.expected_delivery)
  FROM public.shipments s
  LEFT JOIN public.purchase_orders po ON po.id = s.po_id
 WHERE COALESCE(s.etd, po.expected_delivery) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.shipment_schedule_revisions r
      WHERE r.shipment_id = s.id AND r.leg = 'etd' AND r.revision_type = 'original');

-- 3) swap shipments' division-scope (old policies reference the soon-dropped po_id)
DROP POLICY division_scope_select_r ON public.shipments;
DROP POLICY division_scope_insert_r ON public.shipments;
DROP POLICY division_scope_update_r ON public.shipments;
DROP POLICY division_scope_delete_r ON public.shipments;

CREATE POLICY division_scope_select_r ON public.shipments AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_shipment_visible(id));
-- a brand-new shipment has no lines yet, so its division can't be checked at
-- insert time; creation goes through the SECURITY DEFINER create_shipment RPC.
CREATE POLICY division_scope_insert_r ON public.shipments AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY division_scope_update_r ON public.shipments AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_shipment_visible(id)) WITH CHECK (public.is_shipment_visible(id));
CREATE POLICY division_scope_delete_r ON public.shipments AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.is_shipment_visible(id));

NOTIFY pgrst, 'reload schema';
COMMIT;
