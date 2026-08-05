-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 1
--
-- Creates the reusable warranty policy templates that admins define once and
-- reuse across categories/items. Also creates the warranty_number sequence
-- and helper (used later by warranty_records) and seeds three default
-- policies so the app has something to work with day one.
--
-- Follow-up migrations in Phase 1:
--   - inventory_categories.default_warranty_policy_id FK
--   - inventory_items.warranty_policy_id FK (override)
--   - get_effective_warranty_policy(p_item_id) resolver
--   - warranty_records table + RLS
--   - complete_delivery_inventory RPC hook (auto-create at delivered)
--
-- See docs/plans/2026-08-05-warranty-phase-1.md.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. warranty_policies table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warranty_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  duration_months   integer NOT NULL CHECK (duration_months >= 0),
  coverage_type     text NOT NULL
                    CHECK (coverage_type IN ('none', 'parts_only', 'parts_and_labor', 'replacement_only')),
  starts_from       text NOT NULL DEFAULT 'delivery_date'
                    CHECK (starts_from IN ('delivery_date', 'invoice_date')),
  terms_en          text,
  terms_ar          text,
  void_conditions   text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.user_data(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.warranty_policies IS
  'Reusable warranty policy templates. Referenced by inventory_categories.default_warranty_policy_id and inventory_items.warranty_policy_id, and snapshotted onto warranty_records at delivery time.';

-- updated_at trigger — reuse the shared helper if present, otherwise inline.
CREATE OR REPLACE FUNCTION public.warranty_policies_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warranty_policies_updated_at ON public.warranty_policies;
CREATE TRIGGER trg_warranty_policies_updated_at
  BEFORE UPDATE ON public.warranty_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.warranty_policies_set_updated_at();

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
-- Mirrors the reason_list_categories pattern: all authenticated can read,
-- authenticated (admin gate is enforced client-side on the master-data page)
-- can INSERT/UPDATE. There is no division scope on this table — policies
-- are global master data.
ALTER TABLE public.warranty_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read warranty_policies"
  ON public.warranty_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can manage warranty_policies"
  ON public.warranty_policies FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_policies
  TO authenticated, service_role;

-- ── 3. warranty_number sequence + helper ────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.warranty_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.next_warranty_number()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'WAR-' || LPAD(nextval('public.warranty_number_seq')::TEXT, 5, '0');
$$;

GRANT EXECUTE ON FUNCTION public.next_warranty_number() TO authenticated, service_role;

-- ── 4. Seed 3 default policies ──────────────────────────────────────────────
INSERT INTO public.warranty_policies
  (name, duration_months, coverage_type, starts_from, terms_en, terms_ar, void_conditions)
VALUES
  (
    'Standard 12 months',
    12,
    'parts_only',
    'delivery_date',
    'This product is warranted against defects in materials for 12 months from the delivery date. Warranty covers replacement of defective parts only; labor and transport are excluded. Warranty is non-transferable and requires the original receipt.',
    'يُضمن هذا المنتج ضد عيوب المواد لمدة 12 شهراً من تاريخ التسليم. يشمل الضمان استبدال القطع المعيبة فقط؛ ولا تُغطى تكاليف اليد العاملة أو النقل. الضمان غير قابل للتحويل ويستلزم إبراز الفاتورة الأصلية.',
    ARRAY[
      'Physical damage',
      'Unauthorized repair or modification',
      'Misuse or negligence',
      'Water or liquid damage'
    ]
  ),
  (
    'AC / Large Appliance 24 months',
    24,
    'parts_and_labor',
    'delivery_date',
    'This air-conditioning or large-appliance unit is warranted for 24 months from the delivery date. Warranty covers both parts and labor for manufacturing defects, including compressor and control-board failures under normal use.',
    'يُضمن هذا الجهاز (تكييف أو جهاز منزلي كبير) لمدة 24 شهراً من تاريخ التسليم. يشمل الضمان قطع الغيار واليد العاملة لعيوب التصنيع، بما في ذلك أعطال الضاغط ولوحة التحكم في ظل الاستخدام الطبيعي.',
    ARRAY[
      'Physical damage',
      'Unauthorized repair or modification',
      'Misuse or negligence',
      'Water or liquid damage',
      'Installation by non-authorized technician',
      'Power surge or unstable electrical supply'
    ]
  ),
  (
    'No Warranty',
    0,
    'none',
    'delivery_date',
    'This item is sold as-is without any warranty coverage.',
    'يُباع هذا المنتج كما هو دون أي تغطية ضمان.',
    ARRAY[]::text[]
  )
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
