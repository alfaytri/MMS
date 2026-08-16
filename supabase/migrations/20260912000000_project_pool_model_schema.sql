-- Projects "Option B" — a project is ONE stock pool sub-container; discipline
-- and milestone become tags on consumption (not stock containers).
--
-- This migration lays the schema foundation; the RPC rewrites (…000100) and the
-- data migration that collapses existing discipline buckets into one pool
-- (…000200) follow.
--
--   • project_disciplines(project_id, discipline_id) — the disciplines a project
--     has (tags, not containers).
--   • project_milestones.discipline_id — a milestone now belongs to a
--     (pool sub-container, discipline).
--   • consumption_entries.discipline_id + cogs_entries.discipline_id — the
--     discipline tag recorded on each spend, so the report can group by it
--     without resolving through the (now single) consumer sub-container.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. project_disciplines — which disciplines apply to a project
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_disciplines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id)    ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE RESTRICT,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.user_data(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, discipline_id)
);

ALTER TABLE public.project_disciplines ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user who can see the project's division.
DROP POLICY IF EXISTS project_disciplines_select ON public.project_disciplines;
CREATE POLICY project_disciplines_select ON public.project_disciplines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND public.is_division_visible(p.division_id)
  ));

-- Write: managers only. The RPCs are SECURITY DEFINER; this policy backstops
-- any direct PostgREST write.
DROP POLICY IF EXISTS project_disciplines_write ON public.project_disciplines;
CREATE POLICY project_disciplines_write ON public.project_disciplines
  FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));

-- ─────────────────────────────────────────────────────────────────────
-- 2. project_milestones.discipline_id — scope a milestone to a discipline
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS discipline_id uuid REFERENCES public.disciplines(id) ON DELETE RESTRICT;

-- Uniqueness moves from (sub_container_id, label) to
-- (sub_container_id, discipline_id, label): one label per discipline per pool.
ALTER TABLE public.project_milestones
  DROP CONSTRAINT IF EXISTS project_milestones_sub_container_id_label_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_milestones_sub_disc_label_key
  ON public.project_milestones (sub_container_id, discipline_id, label);

-- ─────────────────────────────────────────────────────────────────────
-- 3. discipline tag on the spend ledger
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.consumption_entries
  ADD COLUMN IF NOT EXISTS discipline_id uuid REFERENCES public.disciplines(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS discipline_id uuid REFERENCES public.disciplines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cogs_entries_discipline_idx
  ON public.cogs_entries (discipline_id) WHERE discipline_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
