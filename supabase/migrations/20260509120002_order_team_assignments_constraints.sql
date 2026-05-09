-- supabase/migrations/20260509120002_order_team_assignments_constraints.sql

-- Prevent two agents from booking the same team into the same slot on the same day
ALTER TABLE order_team_assignments
  ADD CONSTRAINT uq_team_slot
    UNIQUE (team_id, scheduled_date, time_slot);

-- Allows contract visits (which have no specific time) without blocking the whole day
ALTER TABLE order_team_assignments
  ADD COLUMN is_full_day boolean NOT NULL DEFAULT false;

-- Groups multi-day visits so swapping one day doesn't silently move all others
ALTER TABLE order_team_assignments
  ADD COLUMN parent_assignment_id uuid REFERENCES order_team_assignments(id);
