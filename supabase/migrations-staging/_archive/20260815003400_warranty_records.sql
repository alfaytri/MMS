-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 5
--
-- warranty_records — the actual coverage. One row per delivered
-- sale_delivery_line. Policy terms are SNAPSHOTTED at insert time so the
-- record survives later edits to the underlying warranty_policies row
-- (immutability = legal safety).
--
-- Auto-creation happens in Task 6 (complete_delivery_inventory hook).
-- The UNIQUE constraint on sale_delivery_line_id makes the hook safe to
-- retry: a duplicate insert becomes a no-op-with-conflict.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.warranty_records (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_number          text NOT NULL UNIQUE
                           DEFAULT public.next_warranty_number(),

  -- The delivery line this coverage attaches to. CASCADE: if the line is
  -- deleted (which shouldn't happen for a delivered line, but safe default),
  -- its warranty goes with it.
  sale_delivery_line_id    uuid NOT NULL UNIQUE
                           REFERENCES public.sale_delivery_lines(id) ON DELETE CASCADE,

  -- Denormalised parents for fast lookup + RLS. RESTRICT on sale_order and
  -- customer because losing them would strand the record — if that ever
  -- needs to happen, it's an explicit ops action.
  sale_order_id            uuid NOT NULL
                           REFERENCES public.sale_orders(id) ON DELETE RESTRICT,
  customer_id              uuid NOT NULL
                           REFERENCES public.customers(id) ON DELETE RESTRICT,
  division_id              uuid NOT NULL
                           REFERENCES public.company_divisions(id) ON DELETE RESTRICT,
  brand_variant_id         uuid
                           REFERENCES public.inventory_item_brand_variants(id) ON DELETE SET NULL,

  -- Line-level snapshot
  item_name                text NOT NULL,
  sku                      text,
  qty                      integer NOT NULL CHECK (qty > 0),

  -- Policy reference + snapshot. RESTRICT: policies stay around as long
  -- as any coverage cites them.
  policy_id                uuid NOT NULL
                           REFERENCES public.warranty_policies(id) ON DELETE RESTRICT,
  policy_name_snapshot     text NOT NULL,
  coverage_type_snapshot   text NOT NULL
                           CHECK (coverage_type_snapshot IN ('none', 'parts_only', 'parts_and_labor', 'replacement_only')),
  duration_months_snapshot integer NOT NULL CHECK (duration_months_snapshot >= 0),
  terms_en_snapshot        text,
  terms_ar_snapshot        text,
  void_conditions_snapshot text[] NOT NULL DEFAULT '{}',
  starts_from_snapshot     text NOT NULL DEFAULT 'delivery_date'
                           CHECK (starts_from_snapshot IN ('delivery_date', 'invoice_date')),

  start_date               date NOT NULL,
  end_date                 date NOT NULL,

  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT warranty_records_end_after_start CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.warranty_records IS
  'One coverage record per delivered sale_delivery_line, created by the complete_delivery_inventory RPC. Policy terms are snapshotted at insert time — future edits to warranty_policies do NOT retroactively change existing records.';

COMMENT ON COLUMN public.warranty_records.warranty_number IS
  'WAR-00001 sequence — populated by DEFAULT next_warranty_number() so the trigger does not need to compute it.';

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_warranty_records_customer_end
  ON public.warranty_records(customer_id, end_date DESC);

CREATE INDEX IF NOT EXISTS idx_warranty_records_end_date
  ON public.warranty_records(end_date);

CREATE INDEX IF NOT EXISTS idx_warranty_records_division
  ON public.warranty_records(division_id);

CREATE INDEX IF NOT EXISTS idx_warranty_records_sale_order
  ON public.warranty_records(sale_order_id);

CREATE INDEX IF NOT EXISTS idx_warranty_records_policy
  ON public.warranty_records(policy_id);

-- ── RLS — division-scoped, restrictive ─────────────────────────────────────
-- Mirrors the sale_orders / so_po_returns pattern: only rows whose
-- division_id is visible to the caller are readable/writable. Super-viewers
-- see everything (handled inside is_division_visible).
ALTER TABLE public.warranty_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY warranty_records_division_select
  ON public.warranty_records
  FOR SELECT TO authenticated
  USING (public.is_division_visible(division_id));

CREATE POLICY warranty_records_division_insert
  ON public.warranty_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY warranty_records_division_update
  ON public.warranty_records
  FOR UPDATE TO authenticated
  USING (public.is_division_visible(division_id))
  WITH CHECK (public.is_division_visible(division_id));

CREATE POLICY warranty_records_division_delete
  ON public.warranty_records
  FOR DELETE TO authenticated
  USING (public.is_division_visible(division_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_records
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
