-- Stage 3 Task 1: warranty_claims schema (enum, table, numbering, so_po_returns
-- link, RLS). Plan: docs/plans/2026-08-21-warranty-completion/03-claims.md
-- "Task 1: Schema — warranty_claims, enum, numbering, return link, RLS".
--
-- Filename note: the plan text names this file 20261002000200, but that
-- timestamp was already claimed by the shipped Stage-2 origin-snapshot
-- migration (20261002000200_warranty_origin_snapshot.sql). Using
-- 20261002000300 instead so ordering stays correct after the repo's latest
-- migration (20261002000200).
--
-- Live-verified before writing (2026-08-21, staging mwvblpgbgxipvrevkeff via
-- `supabase db query --linked`) — plan's SQL matched live reality with ZERO
-- deviations:
--   - enum public.warranty_source_type exists with labels (sale, service,
--     contract), in that order — so `warranty_type public.warranty_source_type`
--     below is a valid column type.
--   - public.is_division_visible(uuid) exists (SECURITY DEFINER; live param
--     name is `row_division_id`, called positionally below) and is the exact
--     predicate already used by warranty_records' own RLS policies
--     (warranty_records_division_select/insert/update/delete), so this
--     migration's RLS follows the established convention for this table
--     family, not a new pattern.
--   - public.resolve_warranty_division_slug(p_division_id uuid) exists
--     (STABLE, not SECURITY DEFINER — a pure lookup/formatting helper with no
--     row access, safe to call from the SECURITY DEFINER function below).
--   - public.warranty_records, public.user_data, public.so_po_returns all
--     exist with a uuid `id` primary key (constraint names retained from
--     pre-rename tables: profiles_pkey on user_data, returns_pkey on
--     so_po_returns — cosmetic only, FKs below target the correct live
--     tables/columns).
--   - No pre-existing collision on warranty_claims, warranty_claim_status,
--     warranty_claim_counters, next_warranty_claim_number, or
--     so_po_returns.warranty_claim_id — all clean to create.

BEGIN;

CREATE TYPE public.warranty_claim_status AS ENUM
  ('open','covered','rejected','in_progress','resolved','void');

CREATE TABLE public.warranty_claims (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number          text UNIQUE NOT NULL,
  warranty_record_id    uuid NOT NULL REFERENCES public.warranty_records(id) ON DELETE RESTRICT,
  warranty_type         public.warranty_source_type NOT NULL,   -- snapshot; drives workflow (sale only for now)
  status                public.warranty_claim_status NOT NULL DEFAULT 'open',
  issue_description     text NOT NULL,
  reported_by           uuid REFERENCES public.user_data(id),
  reported_at           timestamptz NOT NULL DEFAULT now(),
  decision              text CHECK (decision IN ('covered','rejected')),
  decided_by            uuid REFERENCES public.user_data(id),
  decided_at            timestamptz,
  decision_reason       text,
  resolution_type       text CHECK (resolution_type IN ('replacement','credit','refund','repair')),
  resolved_at           timestamptz,
  linked_return_id      uuid REFERENCES public.so_po_returns(id),
  linked_credit_note_id uuid,
  void_reason           text,
  voided_by             uuid REFERENCES public.user_data(id),
  voided_at             timestamptz,
  division_id           uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warranty_claims_record   ON public.warranty_claims(warranty_record_id);
CREATE INDEX idx_warranty_claims_division ON public.warranty_claims(division_id);
CREATE INDEX idx_warranty_claims_status   ON public.warranty_claims(status);

ALTER TABLE public.so_po_returns
  ADD COLUMN IF NOT EXISTS warranty_claim_id uuid REFERENCES public.warranty_claims(id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_warranty_claim ON public.so_po_returns(warranty_claim_id);

-- Numbering (mirrors next_warranty_number's per-division counter pattern)
CREATE TABLE public.warranty_claim_counters (
  division_id uuid PRIMARY KEY,
  next_value  integer NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.next_warranty_claim_number(p_division_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_n integer; v_slug text;
BEGIN
  INSERT INTO warranty_claim_counters(division_id, next_value)
  VALUES (p_division_id, 1)
  ON CONFLICT (division_id) DO UPDATE SET next_value = warranty_claim_counters.next_value + 1
  RETURNING next_value INTO v_n;
  v_slug := public.resolve_warranty_division_slug(p_division_id);  -- reuse existing slug helper
  RETURN 'WC-' || v_slug || '-' || lpad(v_n::text, 5, '0');
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.next_warranty_claim_number(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.next_warranty_claim_number(uuid) TO authenticated;

-- RLS: division-scoped read; writes only via the DEFINER RPCs in later tasks.
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY warranty_claims_select ON public.warranty_claims
  FOR SELECT TO authenticated USING (public.is_division_visible(division_id));
-- No INSERT/UPDATE/DELETE policy for authenticated → only SECURITY DEFINER RPCs write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.warranty_claims FROM authenticated;
REVOKE ALL ON public.warranty_claims FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
