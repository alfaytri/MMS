-- Drop the `supplier_bills` compatibility view.
--
-- Post invoice/bill split (see 20260721140000), the view is a plain passthrough
-- over the `bills` table with no filter or computed columns. All consumers have
-- been migrated to `.from('bills')` directly, so the view adds indirection
-- without value.

DROP VIEW IF EXISTS public.supplier_bills;
