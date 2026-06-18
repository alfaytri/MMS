-- Add service_customer_id to contracts table (links to new service_customers model)
-- The existing customer_id references legacy customers table; this new column
-- links to the Orders-era service_customers for phone lookup integration.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS phone_id UUID
    REFERENCES public.service_customer_phones(id);

CREATE INDEX IF NOT EXISTS idx_contracts_service_customer
  ON public.contracts(service_customer_id);
