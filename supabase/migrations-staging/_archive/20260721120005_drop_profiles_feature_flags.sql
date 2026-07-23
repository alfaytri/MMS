-- ============================================================
-- Drop unused feature_flags column from profiles
--
-- Never read or written by any code. Testing is done on
-- staging environment instead of per-user feature flags.
-- ============================================================

ALTER TABLE public.profiles DROP COLUMN IF EXISTS feature_flags;
