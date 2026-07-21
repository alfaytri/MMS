-- Migration: Drop unused profiles.division_id column
-- The app never writes to this column. Division access is managed entirely
-- through user_company_divisions junction table + JWT claims.

-- Drop the FK constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_division_id_fkey;

-- Drop the index
DROP INDEX IF EXISTS public.idx_profiles_division_id;

-- Drop the column
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS division_id;
