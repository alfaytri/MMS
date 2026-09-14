-- QC Quality-Analyst Workflow — A1 foundation (config + scoring data model).
--
-- Adds:
--   • teams.quality_score  — the per-team "how good, out of 10" rating (starts 10).
--   • qc_point_rules        — the editable scoring rules (seeded with the agreed set).
--   • app_settings 'qc_config' — threshold / max_qc_per_day / same_site_mode.
--
-- QC teams REUSE the existing teams.is_qc flag (the "QC" team type set in team
-- creation) — no new flag. Roles qc.analyst / qc.manager are TS-catalog permission
-- slugs (this app has no permissions table), added in code, not here.
--
-- A2 will add qc_inspections + the auto-booking engine; A3 the score updates +
-- per-item scoring. This migration is config/data only — safe, backward-compatible.

BEGIN;

-- ── Team quality score (0–10, starts at 10; −1 per backwork, +1 recovery — wired in A3) ──
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS quality_score int NOT NULL DEFAULT 10;

-- ── QC point rules — editable scoring config, one row per scenario ──
CREATE TABLE IF NOT EXISTS public.qc_point_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario    text NOT NULL UNIQUE,            -- stable key (matched by the scoring engine)
  label       text NOT NULL,                   -- human label shown in the admin
  points      int  NOT NULL DEFAULT 0,
  timing      text NOT NULL DEFAULT 'along',   -- before | along | after (auto-book timing)
  active      boolean NOT NULL DEFAULT true,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qc_point_rules_timing_chk CHECK (timing IN ('before','along','after'))
);

ALTER TABLE public.qc_point_rules ENABLE ROW LEVEL SECURITY;
-- Permissive like reason_lists / other master-data config: access is gated at the
-- admin-sidebar level (a QC/admin permission), not by RLS.
DROP POLICY IF EXISTS qc_point_rules_rw ON public.qc_point_rules;
CREATE POLICY qc_point_rules_rw ON public.qc_point_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed the agreed scenarios (idempotent by scenario key). Points per the user's
-- rules; timings default to "along" and are editable per scenario in the admin.
INSERT INTO public.qc_point_rules (scenario, label, points, timing, sort_order) VALUES
  ('new_member',         'New member in team',                          1, 'along', 10),
  ('new_leader',         'New leader',                                  2, 'along', 20),
  ('new_service',        'New service (team hasn''t done it before)',    4, 'along', 30),
  ('backwork',           'Backwork',                                    5, 'along', 40),
  ('customer_complaint', 'Customer complaint',                          5, 'along', 50),
  ('new_team',           'New team (new to the service or newly created)', 7, 'along', 60),
  ('team_score_watch',   'Team score watch (after a backwork)',         3, 'along', 70)
ON CONFLICT (scenario) DO NOTHING;

-- ── QC config (threshold / daily capacity / same-site behaviour) ──
-- Stored in app_settings (jsonb) mirroring customer_risk_tiers — no new table.
--   threshold      : QC score >= this triggers a candidate
--   max_qc_per_day : how many QCs can be booked per day (overflow rolls to next day)
--   same_site_mode : 'combine' (one QC per customer+site+day) | 'separate' (one per order)
INSERT INTO public.app_settings (key, value)
VALUES ('qc_config', jsonb_build_object('threshold', 5, 'max_qc_per_day', 3, 'same_site_mode', 'combine'))
ON CONFLICT (key) DO NOTHING;

COMMIT;
