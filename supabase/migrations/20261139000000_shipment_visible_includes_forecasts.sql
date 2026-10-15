-- Fix #1: a plan-ahead shipment has NO shipment_line_items (its items live in
-- purchase_forecasts), so the original line-based is_shipment_visible hid every
-- planned shipment. Extend it: a shipment is visible when a line's PO is in a
-- visible division OR a non-cancelled forecast linked to it is. (#3 phase 3b)
create or replace function public.is_shipment_visible(p_shipment_id uuid)
  returns boolean language sql stable security definer set search_path to 'public' as $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.shipment_line_items sli
      JOIN public.po_line_items pli ON pli.id = sli.po_line_item_id
      JOIN public.purchase_orders po ON po.id = pli.po_id
     WHERE sli.shipment_id = p_shipment_id
       AND public.is_division_visible(po.division_id)
  ) OR EXISTS (
    SELECT 1
      FROM public.purchase_forecasts pf
     WHERE pf.shipment_id = p_shipment_id
       AND pf.status <> 'cancelled'
       AND public.is_division_visible(pf.division_id)
  );
$function$;
