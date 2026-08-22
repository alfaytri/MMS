-- Change TL invoice number prefix from TLINV to SINV → SINV/YYYY/MM/NNNN
CREATE OR REPLACE FUNCTION public.generate_tl_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.invoice_number := 'SINV/' ||
    EXTRACT(YEAR FROM now())::text || '/' ||
    LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '/' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;
