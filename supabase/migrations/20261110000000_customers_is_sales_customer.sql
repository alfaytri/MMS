-- Sales-customer tag on the shared customer master. Sales pickers filter to
-- tagged customers; Projects / Orders / Contact-Centre show the whole list.
-- DEFAULT true backfills every existing customer as a sales customer (all
-- current customers are sales-origin), so Sales behaviour is unchanged. Future
-- non-sales creators (Contact Centre, Orders, Projects) set it false explicitly.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_sales_customer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customers.is_sales_customer IS
  'TRUE = a Sales customer (shown in Sales pickers). Projects/Orders/Contact-Centre show all customers regardless. Backfilled TRUE for existing rows.';
