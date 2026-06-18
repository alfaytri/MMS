-- live_calls: ephemeral presence/race-resolution state for in-flight 3CX calls.
-- Inserted by the webhook (or dial route as safety net); claimed atomically;
-- deleted on hangup. Persistent history lives in call_records.

CREATE TABLE live_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threecx_call_id   TEXT UNIQUE NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  state             TEXT NOT NULL CHECK (state IN ('ringing','dialing','connected')),

  customer_phone    TEXT NOT NULL,
  customer_name     TEXT,
  conversation_id   UUID REFERENCES chat_conversations(id),
  did               TEXT,

  claimed_by        UUID REFERENCES profiles(id),
  claimed_at        TIMESTAMPTZ,
  agent_extension   TEXT,

  initiated_by      UUID REFERENCES profiles(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_calls_ringing ON live_calls(state) WHERE state = 'ringing';
CREATE INDEX live_calls_claimed_by ON live_calls(claimed_by) WHERE claimed_by IS NOT NULL;

ALTER TABLE live_calls ENABLE ROW LEVEL SECURITY;

-- Read: any user with an extension assigned can see live calls (for popups + banners).
CREATE POLICY live_calls_select ON live_calls FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.threecx_extension IS NOT NULL
  ));

-- No INSERT/UPDATE/DELETE policies: only the service role (API routes + webhook) writes.

-- Enable Realtime so the RestProvider can subscribe to changes.
ALTER PUBLICATION supabase_realtime ADD TABLE live_calls;

COMMENT ON TABLE live_calls IS '3CX calls currently in flight. Rows are ephemeral; deleted on hangup. See call_records for persistent history.';
