-- supabase/migrations/20260516160000_service_customers_phone_id_referral.sql
-- Adds referral_source to service_customers and phone_id (address-phone link) to service_customer_addresses.

ALTER TABLE public.service_customers
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

ALTER TABLE public.service_customer_addresses
  ADD COLUMN IF NOT EXISTS phone_id UUID
    REFERENCES public.service_customer_phones(id) ON DELETE SET NULL;
