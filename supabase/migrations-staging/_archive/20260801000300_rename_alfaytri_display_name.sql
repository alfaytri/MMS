-- Rename the company display name "Alfaytri" → "Al Faytri" on the companies
-- row(s). Correct spelling per the brand; the app's UI + PDF code was updated
-- in commit 079695f2 but the DB value is the source of truth for PDF headers
-- (`companies.name_en` fed into brand_resolver / pdf-fonts fallbacks).
--
-- Idempotent — safe to re-run. Only rewrites rows that still hold the old
-- spelling; leaves rows already at "Al Faytri" (or anything else) alone.

UPDATE public.companies
SET    name_en = 'Al Faytri'
WHERE  name_en = 'Alfaytri';

-- Also catch the all-caps variant that older staging baselines seeded.
UPDATE public.companies
SET    name_en = 'AL FAYTRI'
WHERE  name_en = 'ALFAYTRI';
