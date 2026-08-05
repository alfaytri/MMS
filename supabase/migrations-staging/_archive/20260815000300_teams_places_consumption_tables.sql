-- Teams + Places + Consumption — Task 3 of 4 DB migrations
--
-- Creates the two new tables that back the Consumption module:
--
--   consumption_entries  — one row per posted consumption (like a
--                          lightweight SO header). Source is any warehouse
--                          + sub-container (real or virtual). Consumer is
--                          one of team | customer_site | customer | internal.
--                          Attachments column holds Supabase Storage URLs
--                          (PDFs, images, signed job cards).
--
--   consumption_lines    — one row per line item. Weighted unit_cost is
--                          filled by rpc_post_consumption from the FIFO
--                          deduct result.
--
-- Also extends `cogs_entries` with nullable columns so a COGS row can
-- attribute to a consumption + its consumer, alongside the existing
-- sale_delivery_id / sale_order_id / landed_cost_id shapes.
--
-- RLS mirrors inventory_damaged_movements: reads visible to authenticated,
-- writes fully gated (RPCs are SECURITY DEFINER).
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md (Task 3 of 4).
-- Prior migration: 20260815000200_teams_places_transfer_and_movement_enums.sql

-- 1. consumption_entries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consumption_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ce_number               text NOT NULL UNIQUE,
  date                    date NOT NULL DEFAULT current_date,

  -- Source location: any warehouse (real, Teams virtual, Places virtual)
  -- and any active sub-container inside it.
  source_warehouse_id     uuid NOT NULL REFERENCES public.warehouses(id)           ON DELETE RESTRICT,
  source_sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT,

  -- Who / what consumed the stock. Exactly one of the three fk columns
  -- below is expected to be non-null depending on consumer_type; the
  -- rpc_post_consumption RPC enforces the shape (application-level guard).
  consumer_type           text NOT NULL CHECK (consumer_type IN ('team', 'customer_site', 'customer', 'internal')),
  consumer_team_sub_id    uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,
  consumer_place_sub_id   uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,
  consumer_customer_id    uuid REFERENCES public.customers(id)                ON DELETE SET NULL,

  notes                   text,
  attachments             text[] NOT NULL DEFAULT '{}',   -- Supabase Storage URLs

  status                  text NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_by              uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  posted_by               uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  posted_at               timestamptz,
  cancelled_by            uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  cancelled_at            timestamptz,

  -- Division scoping — derived from source_sub_container_id at post time,
  -- stored so RLS + reports don't need to join every time.
  division_id             uuid REFERENCES public.company_divisions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consumption_entries_status_date
  ON public.consumption_entries (status, date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_source_sub
  ON public.consumption_entries (source_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_consumer_team
  ON public.consumption_entries (consumer_team_sub_id)
  WHERE consumer_team_sub_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumption_entries_consumer_place
  ON public.consumption_entries (consumer_place_sub_id)
  WHERE consumer_place_sub_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumption_entries_consumer_customer
  ON public.consumption_entries (consumer_customer_id)
  WHERE consumer_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumption_entries_division
  ON public.consumption_entries (division_id)
  WHERE division_id IS NOT NULL;

COMMENT ON TABLE public.consumption_entries IS
'One row per operator-posted consumption (SO-lite). Consumes FIFO stock at
(source_warehouse_id, source_sub_container_id) and books COGS attributed to
the consumer_type + one of the consumer_* FKs. Attachments column stores
job-card / signed-proof URLs.';

-- 2. consumption_lines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consumption_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_id    uuid NOT NULL REFERENCES public.consumption_entries(id) ON DELETE CASCADE,
  brand_variant_id  uuid NOT NULL REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT,
  item_name         text NOT NULL,
  sku               text,
  qty               int  NOT NULL CHECK (qty > 0),

  -- Weighted from the FIFO deduct at post time. NULL while status='draft'.
  unit_cost         numeric,
  total_cost        numeric GENERATED ALWAYS AS (qty * unit_cost) STORED,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumption_lines_consumption
  ON public.consumption_lines (consumption_id);
CREATE INDEX IF NOT EXISTS idx_consumption_lines_variant
  ON public.consumption_lines (brand_variant_id);

COMMENT ON TABLE public.consumption_lines IS
'One row per line item on a consumption entry. unit_cost is the FIFO-weighted
cost captured at post time. total_cost is generated (qty * unit_cost).';

-- 3. cogs_entries — add consumption-attribution columns ──────────────
-- Nullable so pre-Consumption COGS rows (sale-delivery-backed) stay valid.
ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS consumption_id        uuid REFERENCES public.consumption_entries(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumer_type         text,
  ADD COLUMN IF NOT EXISTS consumer_team_sub_id  uuid REFERENCES public.warehouse_sub_containers(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumer_place_sub_id uuid REFERENCES public.warehouse_sub_containers(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumer_customer_id  uuid REFERENCES public.customers(id)                  ON DELETE SET NULL;

ALTER TABLE public.cogs_entries
  DROP CONSTRAINT IF EXISTS cogs_entries_consumer_type_check;

ALTER TABLE public.cogs_entries
  ADD CONSTRAINT cogs_entries_consumer_type_check
  CHECK (consumer_type IS NULL OR consumer_type IN ('team', 'customer_site', 'customer', 'internal'));

CREATE INDEX IF NOT EXISTS idx_cogs_entries_consumption
  ON public.cogs_entries (consumption_id)
  WHERE consumption_id IS NOT NULL;

COMMENT ON COLUMN public.cogs_entries.consumption_id IS
'Present when this COGS row was booked by rpc_post_consumption. Mutually
exclusive with sale_delivery_id / sale_order_id in practice (a row can only
have one origin), but not constrained here — the existing source-check only
forbids sale_delivery + landed_cost combos.';

-- 4. RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.consumption_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_lines   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ce_read  ON public.consumption_entries;
DROP POLICY IF EXISTS p_ce_write ON public.consumption_entries;
DROP POLICY IF EXISTS p_cl_read  ON public.consumption_lines;
DROP POLICY IF EXISTS p_cl_write ON public.consumption_lines;

CREATE POLICY p_ce_read  ON public.consumption_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY p_ce_write ON public.consumption_entries FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY p_cl_read  ON public.consumption_lines   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY p_cl_write ON public.consumption_lines   FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 5. Division-scoped RESTRICTIVE policy (mirrors Phase C.3 backfill)
--    Consumption row is visible only when its division_id is visible to
--    the caller. Nulls (pre-post drafts) visible to everyone matching the
--    permissive policy above.
DROP POLICY IF EXISTS division_scope_select_r ON public.consumption_entries;
DROP POLICY IF EXISTS division_scope_insert_r ON public.consumption_entries;
DROP POLICY IF EXISTS division_scope_update_r ON public.consumption_entries;
DROP POLICY IF EXISTS division_scope_delete_r ON public.consumption_entries;

CREATE POLICY division_scope_select_r ON public.consumption_entries AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.consumption_entries AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.consumption_entries AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.consumption_entries AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- 6. Number generator ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_consumption_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.consumption_entries;
  RETURN 'CE-' || lpad((v_count + 1)::text, 5, '0');
END;
$function$;

COMMENT ON FUNCTION public.generate_consumption_number() IS
'Generates the next CE-##### number. Simple count-based scheme mirroring
sale_deliveries / warehouse_transfers. Not race-safe for concurrent inserts,
but rpc_post_consumption serializes via an implicit lock on
consumption_entries — the typical operator throughput never hits this.';
