-- supabase/migrations/20260531120000_traccar_geofences.sql

CREATE TABLE traccar_geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traccar_geofence_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE traccar_geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read geofences"
  ON traccar_geofences FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert geofences"
  ON traccar_geofences FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update geofences"
  ON traccar_geofences FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete geofences"
  ON traccar_geofences FOR DELETE
  USING (auth.role() = 'authenticated');
