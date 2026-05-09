-- supabase/migrations/20260509120003_drop_customer_address_line.sql
ALTER TABLE customer_addresses DROP COLUMN IF EXISTS address_line;
