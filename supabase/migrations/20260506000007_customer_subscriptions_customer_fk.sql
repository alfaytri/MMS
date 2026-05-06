-- supabase/migrations/20260506000007_customer_subscriptions_customer_fk.sql
-- TODO: Apply once the customers table primary key column is confirmed.
-- Run `npx supabase db push` after the customers module is live.

ALTER TABLE customer_subscriptions
  ADD CONSTRAINT fk_customer_subscriptions_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
