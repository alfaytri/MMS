-- Fix: Normalise all service_customer_phones to E.164 format (+XXXXXXXXXXX)
--
-- The original backfill (20260511100002) copied phones raw from the old
-- customers table, so many entries are stored as '97472195504' instead of
-- '+97472195504'.  The Contact Centre phone lookup normalises to +XXX...
-- and does an exact match, so un-normalised phones are never found —
-- causing the "UNKNOWN CALLER" bug.
--
-- This migration adds the '+' prefix to any phone that is all-digits
-- (missing the '+'), then deduplicates rows that now conflict.

-- Step 1: Remove duplicates that WILL conflict after normalisation.
-- e.g. if both '97472195504' and '+97472195504' exist for the same customer,
-- delete the un-normalised one (the '+' version is already correct).
DELETE FROM public.service_customer_phones a
USING public.service_customer_phones b
WHERE a.id <> b.id
  AND a.customer_id = b.customer_id
  AND a.phone ~ '^\d+$'                          -- a is the un-normalised row
  AND b.phone = '+' || a.phone;                   -- b is the already-normalised row

-- Step 2: Cross-customer duplicates — different customers own the same number
-- in different formats. Keep the '+' version, delete the raw-digits version.
DELETE FROM public.service_customer_phones a
USING public.service_customer_phones b
WHERE a.id <> b.id
  AND a.phone ~ '^\d+$'
  AND b.phone = '+' || a.phone;

-- Step 3: Normalise remaining phones that are all-digits (no '+' yet).
UPDATE public.service_customer_phones
   SET phone = '+' || phone
 WHERE phone ~ '^\d+$';
