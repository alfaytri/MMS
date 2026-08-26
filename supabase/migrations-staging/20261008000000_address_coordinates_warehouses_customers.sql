-- Blue Plate / coordinate address support for warehouses + customers.
--
-- The Address Finder captures a Qatar National Addressing System (QNAS) blue
-- plate (Zone/Street/Building, verified → coordinates) OR, when a place has no
-- blue plate, Google Maps coordinates pasted directly. Either way we persist a
-- tidy address string plus latitude/longitude for future mapping.
--
-- All columns are nullable + additive → safe, no backfill, no data loss.
-- warehouses already has a `location` text column (reused for the tidy address);
-- customers had no address field at all (it was part of the pruned Orders
-- module), so it gets a fresh `address` column here.

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS latitude  numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address   text,
  ADD COLUMN IF NOT EXISTS latitude  numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;
