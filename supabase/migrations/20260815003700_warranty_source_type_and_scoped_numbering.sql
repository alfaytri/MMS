-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1 refinement
--
-- Numbering format change and multi-source groundwork:
--   OLD: WAR-00001 (single shared sequence)
--   NEW: WAR-<SOURCE>-<DIVISION>-<COUNTER>
--        - source: SALE / SERVICE / CONTRACT (SALE is all we create today)
--        - division: company_divisions.short_name if set, else computed
--                    from name (see resolve_warranty_division_slug below)
--        - counter: independent per (source, division) tuple
--
-- Also opens the door to non-sales sources by adding a source_type enum
-- column on warranty_records. Only 'sale' is populated today; the enum
-- will absorb 'service' / 'contract' rows in later phases without any
-- schema churn.
--
-- Safe to run against staging with existing seed data (0 real records at
-- time of writing — only master-data policies exist).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. source_type enum + column ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warranty_source_type') THEN
    CREATE TYPE public.warranty_source_type AS ENUM ('sale', 'service', 'contract');
  END IF;
END $$;

ALTER TABLE public.warranty_records
  ADD COLUMN IF NOT EXISTS source_type public.warranty_source_type NOT NULL DEFAULT 'sale';

COMMENT ON COLUMN public.warranty_records.source_type IS
  'Which module issued the coverage. Sales is the only writer today; service and contract writers land in later phases.';

-- ── 2. Drop old numbering (safe — staging has 0 warranty_records rows) ────
ALTER TABLE public.warranty_records
  ALTER COLUMN warranty_number DROP DEFAULT;

DROP FUNCTION IF EXISTS public.next_warranty_number();
DROP SEQUENCE IF EXISTS public.warranty_number_seq;

-- ── 3. Per-source-per-division counter table ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.warranty_number_counters (
  source_type public.warranty_source_type NOT NULL,
  division_id uuid NOT NULL REFERENCES public.company_divisions(id) ON DELETE RESTRICT,
  next_value  integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (source_type, division_id)
);

COMMENT ON TABLE public.warranty_number_counters IS
  'Independent counter per (source, division). Ensures WAR-SALE-AFM-* numbers grow separately from WAR-SALE-AFK-* etc.';

-- ── 4. Division slug resolver ─────────────────────────────────────────────
-- Preferred source is company_divisions.short_name (already set for every
-- live division and used by the Division badge on SO / PO / Invoices lists).
-- If empty, computed from name per operator rule:
--   * Second word ≤ 3 chars (acronym like MEP)  → 'A' + full second word
--   * Second word ≥ 4 chars (Maintenance, etc.) → first 2 of first word + first of second
-- 'Al Faytri X' style 3-word names are collapsed: 'Al' + next word → single
-- first word so the rule still yields 'AFM' etc.
CREATE OR REPLACE FUNCTION public.resolve_warranty_division_slug(p_division_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_short_name text;
  v_name       text;
  v_words      text[];
  v_first      text;
  v_second     text;
BEGIN
  SELECT short_name, name
  INTO   v_short_name, v_name
  FROM   public.company_divisions
  WHERE  id = p_division_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Division % not found', p_division_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_short_name IS NOT NULL AND btrim(v_short_name) <> '' THEN
    RETURN upper(btrim(v_short_name));
  END IF;

  IF v_name IS NULL OR btrim(v_name) = '' THEN
    RAISE EXCEPTION 'Division % has no short_name and no name — cannot build warranty slug', p_division_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_words := regexp_split_to_array(btrim(v_name), '\s+');

  -- Collapse 'Al Faytri X' → treat 'AlFaytri' as one word so the rule
  -- still produces 'AFM' from 'Al Faytri Maintenance'.
  IF array_length(v_words, 1) >= 3 AND lower(v_words[1]) = 'al' THEN
    v_words := ARRAY[v_words[1] || v_words[2]] || v_words[3:array_length(v_words, 1)];
  END IF;

  IF array_length(v_words, 1) < 2 THEN
    RAISE EXCEPTION 'Division % name "%" has no second word — set short_name on this division', p_division_id, v_name
      USING ERRCODE = 'check_violation';
  END IF;

  v_first  := v_words[1];
  v_second := v_words[2];

  IF length(v_second) <= 3 THEN
    RETURN upper(substring(v_first FROM 1 FOR 1) || v_second);
  ELSE
    RETURN upper(substring(v_first FROM 1 FOR 2) || substring(v_second FROM 1 FOR 1));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_warranty_division_slug(uuid)
  TO authenticated, service_role;

-- ── 5. Scoped numbering RPC ───────────────────────────────────────────────
-- Atomic increment via INSERT ... ON CONFLICT DO UPDATE RETURNING.
-- The (source_type, division_id) row is either created with next_value 2
-- and we consume 1, or its existing next_value is incremented and we get
-- the previous value. Either way, exactly one caller gets each number.
CREATE OR REPLACE FUNCTION public.next_warranty_number(
  p_source_type public.warranty_source_type,
  p_division_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug     text;
  v_counter  integer;
  v_source_s text;
BEGIN
  v_slug := public.resolve_warranty_division_slug(p_division_id);

  INSERT INTO public.warranty_number_counters (source_type, division_id, next_value)
  VALUES (p_source_type, p_division_id, 2)
  ON CONFLICT (source_type, division_id)
  DO UPDATE SET next_value = warranty_number_counters.next_value + 1
  RETURNING next_value - 1 INTO v_counter;

  v_source_s := upper(p_source_type::text);

  RETURN 'WAR-' || v_source_s || '-' || v_slug || '-' || lpad(v_counter::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_warranty_number(public.warranty_source_type, uuid)
  TO authenticated, service_role;

-- ── 6. Update the delivery helper to use scoped numbering ─────────────────
-- Body is identical to 20260815003500_warranty_delivery_hook.sql except:
--   - Reads v_delivery.division_id up-front (already selected but now used
--     for the numbering call)
--   - Passes source_type = 'sale' + division_id into next_warranty_number
--   - INSERT now includes warranty_number + source_type explicitly (was
--     relying on the dropped column DEFAULT)
CREATE OR REPLACE FUNCTION public.create_warranty_records_for_delivery(
  p_delivery_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery      RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_invoice_date  date;
  v_warranty_no   text;
  v_inserted      integer := 0;
BEGIN
  SELECT sd.id, sd.date, sd.sale_order_id,
         so.customer_id, so.division_id
  INTO   v_delivery
  FROM   public.sale_deliveries sd
  JOIN   public.sale_orders so ON so.id = sd.sale_order_id
  WHERE  sd.id = p_delivery_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_delivery.division_id IS NULL THEN
    -- Legacy rows without a division cannot satisfy the numbering + RLS
    -- requirement. Skip silently.
    RETURN 0;
  END IF;

  SELECT MAX(issued_date)
  INTO   v_invoice_date
  FROM   public.invoices
  WHERE  sale_delivery_id = p_delivery_id;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty_delivered
    FROM   public.sale_delivery_lines
    WHERE  sale_delivery_id = p_delivery_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty_delivered IS NULL
       OR v_line.qty_delivered <= 0
    THEN
      CONTINUE;
    END IF;

    SELECT item_id INTO v_item_id
    FROM   public.inventory_item_brand_variants
    WHERE  id = v_line.brand_variant_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_policy_id := public.get_effective_warranty_policy(v_item_id);

    IF v_policy_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_policy
    FROM   public.warranty_policies
    WHERE  id = v_policy_id;

    IF v_policy.duration_months = 0 THEN
      CONTINUE;
    END IF;

    v_start_date := CASE
      WHEN v_policy.starts_from = 'invoice_date' AND v_invoice_date IS NOT NULL
        THEN v_invoice_date
      ELSE COALESCE(v_delivery.date, CURRENT_DATE)
    END;

    v_warranty_no := public.next_warranty_number('sale'::public.warranty_source_type, v_delivery.division_id);

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      sale_delivery_line_id,
      sale_order_id,
      customer_id,
      division_id,
      brand_variant_id,
      item_name,
      sku,
      qty,
      policy_id,
      policy_name_snapshot,
      coverage_type_snapshot,
      duration_months_snapshot,
      terms_en_snapshot,
      terms_ar_snapshot,
      void_conditions_snapshot,
      starts_from_snapshot,
      start_date,
      end_date
    ) VALUES (
      v_warranty_no,
      'sale',
      v_line.id,
      v_delivery.sale_order_id,
      v_delivery.customer_id,
      v_delivery.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      v_line.sku,
      v_line.qty_delivered,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date
    )
    ON CONFLICT (sale_delivery_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.create_warranty_records_for_delivery(uuid) IS
  'Creates warranty_records for every eligible line in a delivery. Called inline by complete_delivery_inventory. Numbers via next_warranty_number(''sale'', division_id). Idempotent via UNIQUE(sale_delivery_line_id).';

-- ── 7. RLS on the counters table ──────────────────────────────────────────
-- Writes happen inside SECURITY DEFINER functions only. Reads: authenticated
-- for observability (e.g. an admin curious about how many WAR-* numbers
-- exist per division).
ALTER TABLE public.warranty_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY warranty_number_counters_select
  ON public.warranty_number_counters FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.warranty_number_counters TO authenticated, service_role;
GRANT INSERT, UPDATE ON public.warranty_number_counters TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
