-- Migration: Merge cx_extension into threecx_extension, then drop the old column
-- Reviewer feedback: "Why is there cx_extension AND threecx_extension? We need one."

-- Step 1: Copy any non-null cx_extension values where threecx_extension is null
UPDATE public.profiles
SET    threecx_extension = cx_extension
WHERE  cx_extension IS NOT NULL
  AND  (threecx_extension IS NULL OR threecx_extension = '');

-- Step 2: Drop the old column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cx_extension;
