-- Add title column to profiles (supports Mr., Ms., Dr., etc.)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Mr.';
