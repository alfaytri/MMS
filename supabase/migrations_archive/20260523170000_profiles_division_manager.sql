-- Add is_division_manager flag to profiles.
-- Division managers can access the team leader page for all teams in their assigned divisions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_division_manager BOOLEAN NOT NULL DEFAULT false;
