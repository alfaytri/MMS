CREATE TABLE user_ui_preferences (
  user_id              UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  hide_3cx_mobile_note BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_ui_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_ui_preferences_self_select ON user_ui_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_ui_preferences_self_upsert ON user_ui_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_ui_preferences_self_update ON user_ui_preferences FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
