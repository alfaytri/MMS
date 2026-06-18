-- Add 'team-leader' to user_type enum (already written by user creation route)
ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'team-leader';
