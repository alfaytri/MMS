-- Rewrite contract_services / contract_milestones RLS to use the JWT-based
-- pattern (is_division_visible) so owners/accountants bypass division checks.
--
-- The old policies joined through user_divisions, which fails for super-viewers
-- (owner/accountant) who don't have rows in user_divisions.

-- ── Helper: contract visibility based on contract.divisions[] (slugs) ────────
CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR EXISTS (
      SELECT 1
      FROM contracts c
      JOIN divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$$;

-- ── contract_services ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Division-scoped read contract_services"  ON contract_services;
DROP POLICY IF EXISTS "Division-scoped write contract_services" ON contract_services;

CREATE POLICY "contract_services_select"
  ON contract_services FOR SELECT TO authenticated
  USING (is_contract_visible(contract_id));

CREATE POLICY "contract_services_insert"
  ON contract_services FOR INSERT TO authenticated
  WITH CHECK (is_contract_visible(contract_id));

CREATE POLICY "contract_services_update"
  ON contract_services FOR UPDATE TO authenticated
  USING (is_contract_visible(contract_id))
  WITH CHECK (is_contract_visible(contract_id));

CREATE POLICY "contract_services_delete"
  ON contract_services FOR DELETE TO authenticated
  USING (is_contract_visible(contract_id));

-- ── contract_milestones ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Division-scoped read contract_milestones"  ON contract_milestones;
DROP POLICY IF EXISTS "Division-scoped write contract_milestones" ON contract_milestones;

CREATE POLICY "contract_milestones_select"
  ON contract_milestones FOR SELECT TO authenticated
  USING (is_contract_visible(contract_id));

CREATE POLICY "contract_milestones_insert"
  ON contract_milestones FOR INSERT TO authenticated
  WITH CHECK (is_contract_visible(contract_id));

CREATE POLICY "contract_milestones_update"
  ON contract_milestones FOR UPDATE TO authenticated
  USING (is_contract_visible(contract_id))
  WITH CHECK (is_contract_visible(contract_id));

CREATE POLICY "contract_milestones_delete"
  ON contract_milestones FOR DELETE TO authenticated
  USING (is_contract_visible(contract_id));
