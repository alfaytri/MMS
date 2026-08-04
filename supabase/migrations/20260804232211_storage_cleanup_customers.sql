-- Storage cascade — customers.cr_url / establishment_id_url / signed_credit_form_url
-- Bucket: customer-credit-docs (private). Stored value is the raw path.
--
-- Triggers fire AFTER DELETE (nuke all three) and AFTER UPDATE OF the three
-- doc columns (nuke only the OLD value of the column that changed).

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_docs_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url,                 'customers', OLD.id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url,   'customers', OLD.id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customers', OLD.id::text);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_customer_docs_after_delete ON public.customers;
CREATE TRIGGER cleanup_customer_docs_after_delete
  AFTER DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_docs_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_docs_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.cr_url IS DISTINCT FROM NEW.cr_url AND OLD.cr_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url, 'customers', OLD.id::text);
  END IF;
  IF OLD.establishment_id_url IS DISTINCT FROM NEW.establishment_id_url AND OLD.establishment_id_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url, 'customers', OLD.id::text);
  END IF;
  IF OLD.signed_credit_form_url IS DISTINCT FROM NEW.signed_credit_form_url AND OLD.signed_credit_form_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customers', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_customer_docs_after_update ON public.customers;
CREATE TRIGGER cleanup_customer_docs_after_update
  AFTER UPDATE OF cr_url, establishment_id_url, signed_credit_form_url ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_docs_after_update();
