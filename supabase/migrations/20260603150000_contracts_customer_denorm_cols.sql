-- Add denormalized customer fields to contracts table
-- These store the customer info at time of quotation creation
-- so the contract record is self-contained for display/search.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Make customer_id nullable — new quotation flow uses service_customer_id instead
ALTER TABLE public.contracts
  ALTER COLUMN customer_id DROP NOT NULL;
