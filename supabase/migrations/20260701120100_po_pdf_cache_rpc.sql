-- PO PDF cache — service-role RPC to write the URL without tripping the
-- invalidation trigger. Mirrors the sales PDF RPCs from 20260627101901.

CREATE OR REPLACE FUNCTION public.set_po_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.purchase_orders SET pdf_url = p_url WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_po_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_po_pdf_url(UUID, TEXT) TO service_role;
