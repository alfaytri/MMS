-- Auto-generate hierarchical service codes on INSERT
-- Pattern: {PREFIX}-{NNN} for roots, {PARENT_CODE}-{NN} for children
-- Prefixes: SVC (normal), CTR (contract), MOB (mobile)

CREATE OR REPLACE FUNCTION generate_service_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_parent_code text;
  v_sibling_count int;
  v_seq text;
BEGIN
  -- Skip if code already provided (legacy data)
  IF NEW.code IS NOT NULL AND NEW.code != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.tree_type
    WHEN 'normal'   THEN 'SVC'
    WHEN 'contract'  THEN 'CTR'
    WHEN 'mobile'    THEN 'MOB'
    ELSE 'SVC'
  END;

  IF NEW.parent_id IS NULL THEN
    -- Root level: PREFIX-NNN
    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE tree_type = NEW.tree_type
      AND parent_id IS NULL
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 3, '0');
    NEW.code := v_prefix || '-' || v_seq;
  ELSE
    -- Child: PARENT_CODE-NN
    SELECT code INTO v_parent_code
    FROM services
    WHERE id = NEW.parent_id;

    -- If parent has no code yet, build a placeholder
    IF v_parent_code IS NULL OR v_parent_code = '' THEN
      v_parent_code := v_prefix || '-000';
    END IF;

    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE parent_id = NEW.parent_id
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 2, '0');
    NEW.code := v_parent_code || '-' || v_seq;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger fires BEFORE INSERT so the code is set before the row lands
CREATE TRIGGER trg_auto_service_code
  BEFORE INSERT ON services
  FOR EACH ROW
  EXECUTE FUNCTION generate_service_code();

-- ── Backfill existing services that have NULL/empty codes ──
-- Process roots first, then children, so parent codes exist when children run
DO $$
DECLARE
  r RECORD;
  v_prefix text;
  v_seq int;
  v_parent_code text;
  v_child_seq int;
BEGIN
  -- 1. Backfill root-level services (parent_id IS NULL)
  FOR r IN (
    SELECT id, tree_type,
           ROW_NUMBER() OVER (PARTITION BY tree_type ORDER BY sort_order, created_at, id) AS rn
    FROM services
    WHERE (code IS NULL OR code = '')
      AND parent_id IS NULL
    ORDER BY tree_type, sort_order, created_at
  ) LOOP
    v_prefix := CASE r.tree_type
      WHEN 'normal'   THEN 'SVC'
      WHEN 'contract'  THEN 'CTR'
      WHEN 'mobile'    THEN 'MOB'
      ELSE 'SVC'
    END;
    UPDATE services SET code = v_prefix || '-' || LPAD(r.rn::text, 3, '0') WHERE id = r.id;
  END LOOP;

  -- 2. Backfill L2 children
  FOR r IN (
    SELECT s.id, s.parent_id,
           p.code AS parent_code,
           ROW_NUMBER() OVER (PARTITION BY s.parent_id ORDER BY s.sort_order, s.created_at, s.id) AS rn
    FROM services s
    JOIN services p ON p.id = s.parent_id
    WHERE (s.code IS NULL OR s.code = '')
      AND s.parent_id IS NOT NULL
      AND p.parent_id IS NULL  -- parent is L1
  ) LOOP
    IF r.parent_code IS NOT NULL AND r.parent_code != '' THEN
      UPDATE services SET code = r.parent_code || '-' || LPAD(r.rn::text, 2, '0') WHERE id = r.id;
    END IF;
  END LOOP;

  -- 3. Backfill L3 children (grandchildren)
  FOR r IN (
    SELECT s.id, s.parent_id,
           p.code AS parent_code,
           ROW_NUMBER() OVER (PARTITION BY s.parent_id ORDER BY s.sort_order, s.created_at, s.id) AS rn
    FROM services s
    JOIN services p ON p.id = s.parent_id
    JOIN services gp ON gp.id = p.parent_id
    WHERE (s.code IS NULL OR s.code = '')
      AND s.parent_id IS NOT NULL
      AND p.parent_id IS NOT NULL
      AND gp.parent_id IS NULL  -- grandparent is L1
  ) LOOP
    IF r.parent_code IS NOT NULL AND r.parent_code != '' THEN
      UPDATE services SET code = r.parent_code || '-' || LPAD(r.rn::text, 2, '0') WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
