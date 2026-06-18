-- Add CRM tables to the Realtime publication so the v2 Contact Centre
-- SyncWorker can subscribe to live updates on a single channel.
--
-- Without these, the SyncWorker's single channel reports CHANNEL_ERROR
-- because some of the tables it subscribes to aren't published — which
-- surfaces in the UI as a persistent "Working offline" banner.

alter publication supabase_realtime add table public.service_customers;
alter publication supabase_realtime add table public.service_customer_addresses;
alter publication supabase_realtime add table public.service_customer_phones;
alter publication supabase_realtime add table public.installed_products;
