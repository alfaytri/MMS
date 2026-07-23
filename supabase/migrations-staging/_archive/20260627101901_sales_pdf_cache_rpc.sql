-- ─────────────────────────────────────────────────────────────────────────────
-- Sales PDF cache — service-role RPCs to write the URL without tripping the
-- invalidation trigger.
--
-- Each RPC sets the transaction-local GUC `app.skip_pdf_invalidation` to
-- 'true' before its UPDATE, which the BEFORE-UPDATE trigger reads to decide
-- whether to null the URL. The GUC is automatically reset at COMMIT (because
-- `is_local = true` in set_config).
--
-- These are SECURITY DEFINER and only callable by service_role — the
-- application's API routes invoke them via supabase-js .rpc() using the
-- service-role key. Anon/auth roles cannot trigger them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sale_order_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.sale_orders SET quotation_pdf_url = p_url WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_sale_order_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sale_order_pdf_url(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.set_invoice_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.invoices SET pdf_url = p_url WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_invoice_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_invoice_pdf_url(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.set_credit_note_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.credit_notes SET pdf_url = p_url WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_credit_note_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_credit_note_pdf_url(UUID, TEXT) TO service_role;
