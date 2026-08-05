-- Four views were being displayed as UNRESTRICTED in Supabase Studio because
-- they were created without `security_invoker = on`. Postgres treats an
-- ordinary view as if the view creator ran the query, which bypasses the
-- RLS policies on the underlying tables — every authenticated caller gets
-- postgres-level access through the view.
--
-- The prior fix migration 20260713165620 patched customer_credit_summary the
-- same way; that fix got regressed when Batch B rebuilt the view without
-- the option, and the two new compat views from Batch C (`profiles`,
-- `inventory_brand_variants`) plus the Batch A `returns` view shipped
-- without the option to begin with.
--
-- ALTER VIEW SET (security_invoker = on) flips the option without touching
-- the view body — so the SELECT * FROM shape stays and RLS on the base
-- table (user_data / so_po_returns / inventory_item_brand_variants /
-- customers) is now enforced per-caller.

BEGIN;

ALTER VIEW public.profiles                  SET (security_invoker = on);
ALTER VIEW public.returns                   SET (security_invoker = on);
ALTER VIEW public.inventory_brand_variants  SET (security_invoker = on);
ALTER VIEW public.customer_credit_summary   SET (security_invoker = on);

NOTIFY pgrst, 'reload schema';

COMMIT;
