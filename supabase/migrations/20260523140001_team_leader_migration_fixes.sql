-- Fix 1: Missing index on site_visits.completed_by (foreign key join column)
CREATE INDEX IF NOT EXISTS idx_site_visits_completed_by ON site_visits(completed_by);

-- Fix 2: Optional index on team_live_locations.updated_at for admin monitoring queries
CREATE INDEX IF NOT EXISTS idx_tll_updated_at ON team_live_locations(updated_at);
