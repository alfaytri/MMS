-- ─── FOLLOW-UP REQUESTS ───
-- Team leader's request to the Ops Manager to schedule additional work
-- on a completed order. On confirmation, an `orders` row is created and
-- linked back via `resulting_order_id`.

CREATE TYPE follow_up_request_status AS ENUM (
  'pending', 'confirmed', 'cancelled', 'rejected'
);

CREATE TABLE follow_up_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number          TEXT UNIQUE NOT NULL,
  parent_order_id         UUID NOT NULL REFERENCES orders(id),
  requested_by_user_id    UUID NOT NULL REFERENCES auth.users(id),
  requested_team_id       UUID NOT NULL REFERENCES teams(id),
  requested_date          DATE,
  requested_time_from     TIME,
  requested_time_to       TIME,
  time_note               TEXT,
  services_to_followup    JSONB NOT NULL,  -- [{order_service_id, name}, ...]
  notes                   TEXT,
  status                  follow_up_request_status NOT NULL DEFAULT 'pending',
  confirmed_by_user_id    UUID REFERENCES auth.users(id),
  confirmed_at            TIMESTAMPTZ,
  resulting_order_id      UUID REFERENCES orders(id),
  cancelled_reason        TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_fur_time_pair
    CHECK ((requested_time_from IS NULL) = (requested_time_to IS NULL)),
  CONSTRAINT chk_fur_when_present
    CHECK (
      (requested_date IS NOT NULL AND requested_time_from IS NOT NULL)
      OR time_note IS NOT NULL
    )
);

CREATE INDEX idx_fur_status_date ON follow_up_requests (status, requested_date);
CREATE INDEX idx_fur_parent      ON follow_up_requests (parent_order_id);
CREATE INDEX idx_fur_team_date   ON follow_up_requests (requested_team_id, requested_date);

-- ─── ORDERS: link follow-up orders to their parent ───
ALTER TABLE orders ADD COLUMN parent_order_id       UUID REFERENCES orders(id);
ALTER TABLE orders ADD COLUMN follow_up_request_id  UUID REFERENCES follow_up_requests(id);
CREATE INDEX idx_orders_parent_order_id ON orders (parent_order_id);

-- ─── Request number sequence (per year, like ORD-2026-NNNN) ───
CREATE SEQUENCE follow_up_request_seq_2026 START 1;

CREATE OR REPLACE FUNCTION next_follow_up_request_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  yr   INT := EXTRACT(YEAR FROM now())::INT;
  seq  INT;
  seq_name TEXT := 'follow_up_request_seq_' || yr;
BEGIN
  -- Lazily create the per-year sequence on first call of a new year.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = seq_name
  ) THEN
    EXECUTE format('CREATE SEQUENCE %I START 1', seq_name);
  END IF;
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FUR-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$;

-- ─── RLS ───
ALTER TABLE follow_up_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user (team leader sees their own + everyone with
-- confirm permission sees all — permission filtering happens in API layer).
CREATE POLICY fur_select ON follow_up_requests
  FOR SELECT TO authenticated USING (true);

-- INSERT: any authenticated user. API layer enforces `follow_ups.request`.
CREATE POLICY fur_insert ON follow_up_requests
  FOR INSERT TO authenticated WITH CHECK (
    requested_by_user_id = auth.uid()
  );

-- UPDATE: any authenticated user. API layer enforces `follow_ups.confirm`.
CREATE POLICY fur_update ON follow_up_requests
  FOR UPDATE TO authenticated USING (true);
