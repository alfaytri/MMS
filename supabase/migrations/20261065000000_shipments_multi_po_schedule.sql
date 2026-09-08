-- 20261065000000_shipments_multi_po_schedule.sql
-- Shipments multi-PO + schedule history — schema layer.
-- Adds: enums, shipment_number (SHP-#####), nullable tracking_number + po_id,
-- cached etd_actual/eta_actual, shipment_line_items (item-level PO contents),
-- shipment_schedule_revisions (ETD/ETA original→updated→actual), and the
-- recursion-safe is_shipment_visible() RLS helper.
-- shipments' OWN division-scope policies still key off po_id here (valid — po_id
-- still exists); they are rewritten to use is_shipment_visible AFTER backfill in
-- 20261068, and po_id is dropped in 20261069.
-- Spec:  docs/plans/2026-09-08-shipments-multi-po-and-schedule-design.md
-- Plan:  docs/plans/2026-09-08-shipments-multi-po-and-schedule-plan.md  (Task 1)
BEGIN;

CREATE TYPE public.shipment_schedule_leg AS ENUM ('etd','eta');
CREATE TYPE public.shipment_schedule_revision_type AS ENUM ('original','updated','actual');

-- ── shipments: SHP number, nullable tracking/po_id, cached actual dates ──────────
CREATE SEQUENCE IF NOT EXISTS public.shipment_number_seq;
ALTER TABLE public.shipments ADD COLUMN shipment_number text;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.shipments
)
UPDATE public.shipments s
   SET shipment_number = 'SHP-' || lpad(o.rn::text, 5, '0')
  FROM ordered o WHERE o.id = s.id;

SELECT setval('public.shipment_number_seq', GREATEST((SELECT count(*) FROM public.shipments), 1));

ALTER TABLE public.shipments ALTER COLUMN shipment_number SET NOT NULL;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_shipment_number_key UNIQUE (shipment_number);

CREATE OR REPLACE FUNCTION public.assign_shipment_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipment_number IS NULL THEN
    NEW.shipment_number := 'SHP-' || lpad(nextval('public.shipment_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_assign_shipment_number
  BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.assign_shipment_number();

ALTER TABLE public.shipments ALTER COLUMN tracking_number DROP NOT NULL;
ALTER TABLE public.shipments ALTER COLUMN po_id DROP NOT NULL;  -- dropped in 20261069 once consumers repointed
ALTER TABLE public.shipments ADD COLUMN etd_actual date, ADD COLUMN eta_actual date;

-- ── shipment_line_items ─────────────────────────────────────────────────────────
CREATE TABLE public.shipment_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  po_line_item_id uuid NOT NULL REFERENCES public.po_line_items(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, po_line_item_id)
);
CREATE INDEX idx_shipment_line_items_shipment ON public.shipment_line_items(shipment_id);
CREATE INDEX idx_shipment_line_items_po_line  ON public.shipment_line_items(po_line_item_id);
ALTER TABLE public.shipment_line_items ENABLE ROW LEVEL SECURITY;

-- ── shipment_schedule_revisions ─────────────────────────────────────────────────
CREATE TABLE public.shipment_schedule_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  leg public.shipment_schedule_leg NOT NULL,
  revision_type public.shipment_schedule_revision_type NOT NULL,
  date_value date NOT NULL,
  reason text,
  created_by uuid,  -- auth.uid() of the reviser; no FK (this project links profiles via user_data.auth_user_id, not id) — resolve the name via user_data.auth_user_id = created_by
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_schedule_original ON public.shipment_schedule_revisions(shipment_id, leg) WHERE revision_type = 'original';
CREATE UNIQUE INDEX uq_schedule_actual   ON public.shipment_schedule_revisions(shipment_id, leg) WHERE revision_type = 'actual';
CREATE INDEX idx_schedule_shipment_leg   ON public.shipment_schedule_revisions(shipment_id, leg, created_at);
ALTER TABLE public.shipment_schedule_revisions ENABLE ROW LEVEL SECURITY;

-- ── visibility helper (SECURITY DEFINER → its shipment_line_items read never
--    re-triggers RLS, so policies on that table can call it without recursion) ────
CREATE OR REPLACE FUNCTION public.is_shipment_visible(p_shipment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.shipment_line_items sli
      JOIN public.po_line_items pli ON pli.id = sli.po_line_item_id
      JOIN public.purchase_orders po ON po.id = pli.po_id
     WHERE sli.shipment_id = p_shipment_id
       AND public.is_division_visible(po.division_id)
  );
$$;

-- ── RLS: permissive "manage" (mirrors shipments) + RESTRICTIVE any-division scope ─
CREATE POLICY sli_manage ON public.shipment_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sli_div_scope ON public.shipment_line_items AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_shipment_visible(shipment_id))
  WITH CHECK (public.is_shipment_visible(shipment_id));

CREATE POLICY ssr_manage ON public.shipment_schedule_revisions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ssr_div_scope ON public.shipment_schedule_revisions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_shipment_visible(shipment_id))
  WITH CHECK (public.is_shipment_visible(shipment_id));

REVOKE ALL ON public.shipment_line_items, public.shipment_schedule_revisions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_line_items, public.shipment_schedule_revisions TO authenticated;
REVOKE ALL ON FUNCTION public.is_shipment_visible(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_shipment_visible(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
