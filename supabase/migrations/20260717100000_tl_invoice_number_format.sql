-- Change TL invoice number format from TL-YYYY-NNNN to TLINV/YYYY/MM/NNNN
CREATE OR REPLACE FUNCTION public.generate_tl_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.invoice_number := 'TLINV/' ||
    EXTRACT(YEAR FROM now())::text || '/' ||
    LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '/' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;
