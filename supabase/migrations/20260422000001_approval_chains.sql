-- supabase/migrations/20260422000001_approval_chains.sql

-- ── New tables ────────────────────────────────────────────────────────────────

CREATE TABLE approval_chains (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  UUID REFERENCES divisions(id),
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (division_id)
);

CREATE TABLE approval_chain_tiers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id       UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  rank           INT NOT NULL,
  min_amount     NUMERIC NOT NULL,
  max_amount     NUMERIC,
  required_roles approval_role[] NOT NULL,
  deleted_at     TIMESTAMPTZ,
  UNIQUE (chain_id, rank),
  CONSTRAINT chk_amount_range CHECK (max_amount IS NULL OR max_amount > min_amount),
  CONSTRAINT chk_required_roles_nonempty CHECK (cardinality(required_roles) > 0)
);

CREATE TABLE approval_role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        approval_role NOT NULL,
  division_id UUID REFERENCES divisions(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (profile_id, role, division_id)
);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  related_id   UUID,
  related_type TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Alter po_approvals ────────────────────────────────────────────────────────

ALTER TABLE po_approvals
  DROP COLUMN IF EXISTS assigned_to,
  ADD COLUMN IF NOT EXISTS tier_rank      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iteration      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS force_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_comment  TEXT;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_notifications_related_id         ON notifications(related_id);
CREATE INDEX idx_notifications_profile_read        ON notifications(profile_id, read_at);
CREATE INDEX idx_po_approvals_po_iteration         ON po_approvals(po_id, iteration);
CREATE INDEX idx_po_approvals_active_pending       ON po_approvals(po_id, is_active, status);

-- I1: ensure only one global (division_id IS NULL) approval chain
CREATE UNIQUE INDEX idx_approval_chains_single_global
  ON approval_chains ((true))
  WHERE division_id IS NULL;

-- I2: ensure uniqueness of role assignments in global scope (division_id IS NULL)
CREATE UNIQUE INDEX idx_role_assignments_global
  ON approval_role_assignments (profile_id, role)
  WHERE division_id IS NULL;

-- I4: lookup indexes
CREATE INDEX idx_approval_chains_division         ON approval_chains(division_id);
CREATE INDEX idx_role_assignments_division_role   ON approval_role_assignments(division_id, role);

-- ── RLS (permissive — matches existing pattern) ───────────────────────────────

ALTER TABLE approval_chains           ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chain_tiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_approval_chains"           ON approval_chains           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approval_chain_tiers"      ON approval_chain_tiers      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approval_role_assignments" ON approval_role_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifications"             ON notifications             FOR ALL USING (true) WITH CHECK (true);

-- ── State machine function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_po_approval_tier(p_po_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_iteration  INT;
  v_next_rank  INT;
  v_all_done   BOOLEAN;
BEGIN
  -- C1: advisory lock to prevent concurrent execution for the same PO
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- C2: existence guard — bail if no approval rows exist for this PO
  IF NOT EXISTS (SELECT 1 FROM po_approvals WHERE po_id = p_po_id AND iteration = (
    SELECT COALESCE(MAX(iteration), 1) FROM po_approvals WHERE po_id = p_po_id
  )) THEN
    RETURN;
  END IF;

  -- I3: do not advance if PO is in a terminal non-pending state
  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = p_po_id AND status = 'pending_approval'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM po_approvals WHERE po_id = p_po_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM po_approvals
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND is_active = true
      AND status NOT IN ('approved')
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT MIN(tier_rank) INTO v_next_rank
  FROM po_approvals
  WHERE po_id = p_po_id
    AND iteration = v_iteration
    AND is_active = false
    AND status = 'pending';

  IF v_next_rank IS NOT NULL THEN
    UPDATE po_approvals
    SET is_active = true
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND tier_rank = v_next_rank;
  ELSE
    UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
  END IF;
END;
$$;
