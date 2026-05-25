-- Fix: Comprehensive phone normalisation for service_customer_phones
--
-- The previous migration (20260524110000) only handled all-digit phones.
-- Old data may also contain dashes, spaces, parentheses, or other formatting:
--   e.g. '974-72195504', '+974 7219 5504', '(974)72195504'
-- These won't match the CC's normalised lookup of '+97472195504'.
--
-- This migration:
-- 1. Strips ALL non-digit characters from every phone (except a leading '+')
-- 2. Ensures every phone starts with '+'
-- 3. Deduplicates any collisions

-- Step 1: Strip formatting characters (spaces, dashes, parens, dots) but keep leading '+'
-- '+974 7219 5504' → '+97472195504'
-- '974-72195504'   → '97472195504' (will get '+' in step 2)
-- '(974)72195504'  → '97472195504' (will get '+' in step 2)
UPDATE public.service_customer_phones
   SET phone = CASE
     WHEN phone ~ '^\+' THEN '+' || regexp_replace(substring(phone from 2), '[^0-9]', '', 'g')
     ELSE regexp_replace(phone, '[^0-9]', '', 'g')
   END
 WHERE phone ~ '[^+0-9]';  -- only rows that have non-digit, non-plus characters

-- Step 2: Add '+' prefix to any remaining all-digit phones
-- '97472195504' → '+97472195504'
UPDATE public.service_customer_phones
   SET phone = '+' || phone
 WHERE phone ~ '^\d+$';

-- Step 3: Dedup — if normalisation created duplicates within the same customer,
-- keep the row with is_primary=true (or the first inserted one as tiebreaker).
DELETE FROM public.service_customer_phones a
USING public.service_customer_phones b
WHERE a.phone = b.phone
  AND a.customer_id = b.customer_id
  AND a.id <> b.id
  AND (
    -- keep b if b is primary and a is not
    (b.is_primary AND NOT a.is_primary)
    -- or keep whichever was created first (smaller UUID as proxy)
    OR (a.is_primary = b.is_primary AND a.id > b.id)
  );

-- Step 4: Cross-customer dedup — same phone owned by two different customers.
-- Keep the one that has is_primary=true, or the older row.
DELETE FROM public.service_customer_phones a
USING public.service_customer_phones b
WHERE a.phone = b.phone
  AND a.customer_id <> b.customer_id
  AND a.id <> b.id
  AND (
    (b.is_primary AND NOT a.is_primary)
    OR (a.is_primary = b.is_primary AND a.id > b.id)
  );

-- Step 5: Also normalise chat_conversations.wati_phone so the CC list lookup
-- matches. Some WATI-synced conversations may have phones without '+'.
UPDATE public.chat_conversations
   SET wati_phone = CASE
     WHEN wati_phone ~ '^\+' THEN '+' || regexp_replace(substring(wati_phone from 2), '[^0-9]', '', 'g')
     ELSE '+' || regexp_replace(wati_phone, '[^0-9]', '', 'g')
   END
 WHERE wati_phone IS NOT NULL
   AND (wati_phone ~ '[^+0-9]' OR wati_phone ~ '^\d+$');

-- Step 6: Re-link conversations to customers now that phones are normalised.
-- Any conversation with customer_id = NULL that now matches a service_customer_phones
-- row should be linked.
UPDATE public.chat_conversations cc
   SET customer_id = scp.customer_id
  FROM public.service_customer_phones scp
 WHERE cc.customer_id IS NULL
   AND cc.wati_phone = scp.phone;
