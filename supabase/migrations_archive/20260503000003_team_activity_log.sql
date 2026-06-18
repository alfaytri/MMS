CREATE TABLE IF NOT EXISTS team_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_entity_id  ON team_activity_log (entity_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_created_at ON team_activity_log (created_at DESC);
