-- Add speed (km/h) and heading (degrees 0-360) from browser Geolocation API.
-- Both nullable — older clients that don't send them will leave these NULL.
ALTER TABLE team_live_locations ADD COLUMN IF NOT EXISTS speed double precision;
ALTER TABLE team_live_locations ADD COLUMN IF NOT EXISTS heading double precision;
