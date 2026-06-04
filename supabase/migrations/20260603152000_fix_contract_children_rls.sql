-- Fix RLS write policies for contract_services and contract_milestones.
-- The original policies used FOR ALL with only USING (no WITH CHECK),
-- which blocks INSERTs. Add WITH CHECK to allow inserts by division members.

-- ── contract_services ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Division-scoped write contract_services" ON contract_services;

CREATE POLICY "Division-scoped write contract_services"
  ON contract_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

-- ── contract_milestones ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Division-scoped write contract_milestones" ON contract_milestones;

CREATE POLICY "Division-scoped write contract_milestones"
  ON contract_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );
