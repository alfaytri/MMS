-- supabase/migrations/20260428000001_credit_groups_payment_methods.sql
BEGIN;

ALTER TABLE credit_groups
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_days        INTEGER;

COMMIT;
