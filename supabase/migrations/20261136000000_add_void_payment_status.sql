-- 20261133000000_add_void_payment_status.sql
--
-- Add a 'void' value to the shared invoice_payment_status enum (used by
-- bills.payment_status, so_invoices.payment_status, customer_invoices.payment_status).
-- Lets a cancelled invoice/bill carry payment_status='void' so it reads "Void"
-- everywhere instead of lingering as "unpaid", and lets AR/AP outstanding calcs
-- exclude it. Additive + idempotent. MUST be applied (committed) before the
-- companion migration 20261134000000, which USES 'void' (SQL functions validate
-- the enum literal at CREATE time).
ALTER TYPE public.invoice_payment_status ADD VALUE IF NOT EXISTS 'void';
