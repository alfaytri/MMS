-- Seed the company-default approval chain with 3 cumulative tiers.
-- Runs only if no company-default chain exists yet (division_id IS NULL).

DO $$
DECLARE
  v_chain_id UUID;
BEGIN
  -- Only seed if there is no company-default chain
  IF NOT EXISTS (SELECT 1 FROM approval_chains WHERE division_id IS NULL) THEN

    INSERT INTO approval_chains (division_id, name, is_active)
    VALUES (NULL, 'Company Default', true)
    RETURNING id INTO v_chain_id;

    -- Tier 1: Below QR 10,000 — Purchase Manager only
    INSERT INTO approval_chain_tiers (chain_id, rank, min_amount, max_amount, required_roles)
    VALUES (v_chain_id, 1, 0, 9999.99, ARRAY['purchase_manager']::approval_role[]);

    -- Tier 2: QR 10,000 – 25,000 — Purchase Manager then Accountant (sequential tiers)
    INSERT INTO approval_chain_tiers (chain_id, rank, min_amount, max_amount, required_roles)
    VALUES (v_chain_id, 2, 10000, 24999.99, ARRAY['accountant']::approval_role[]);

    -- Tier 3: Above QR 25,000 — Owner signs off last
    INSERT INTO approval_chain_tiers (chain_id, rank, min_amount, max_amount, required_roles)
    VALUES (v_chain_id, 3, 25000, NULL, ARRAY['owner']::approval_role[]);

  END IF;
END $$;
