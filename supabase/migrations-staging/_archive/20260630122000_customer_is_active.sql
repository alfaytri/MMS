-- Add is_active flag to customers. Disabled customers cannot be selected
-- when creating sale orders. All existing customers default to active.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customers.is_active IS
  'When false, the customer is disabled and cannot be selected for new sale orders.';
