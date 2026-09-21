-- Milestone codes can belong to MULTIPLE disciplines.
--
-- A code keeps its "home" discipline (milestone_codes.discipline_id, the owner
-- of the UNIQUE(discipline_id, code) constraint) and can ALSO be made available
-- in other disciplines via this junction. It stays ONE row with ONE id, so it
-- is genuinely the same code everywhere: spend aggregates under it, and it is
-- created/edited/managed only from its home discipline.

CREATE TABLE IF NOT EXISTS public.milestone_code_disciplines (
  milestone_code_id uuid NOT NULL REFERENCES public.milestone_codes(id) ON DELETE CASCADE,
  discipline_id     uuid NOT NULL REFERENCES public.disciplines(id)     ON DELETE CASCADE,
  created_by        uuid REFERENCES public.user_data(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (milestone_code_id, discipline_id)
);

CREATE INDEX IF NOT EXISTS milestone_code_disciplines_discipline_idx
  ON public.milestone_code_disciplines (discipline_id);

COMMENT ON TABLE public.milestone_code_disciplines IS
  'Extra disciplines a milestone_code is shared into, beyond its home milestone_codes.discipline_id. Same code id → shared everywhere.';

ALTER TABLE public.milestone_code_disciplines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcd_select ON public.milestone_code_disciplines;
CREATE POLICY mcd_select ON public.milestone_code_disciplines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mcd_write ON public.milestone_code_disciplines;
CREATE POLICY mcd_write ON public.milestone_code_disciplines
  FOR ALL TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'warehouse.projects.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'warehouse.projects.manage'));

-- ── Upsert now takes an "also available in" set (extra disciplines) ──────────
-- Old 6-arg signature is dropped so there is a single canonical function.
DROP FUNCTION IF EXISTS public.rpc_upsert_milestone_code(uuid, uuid, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.rpc_upsert_milestone_code(
  p_id                   uuid,
  p_discipline_id        uuid,
  p_code                 text,
  p_grp                  text    DEFAULT NULL::text,
  p_description          text    DEFAULT NULL::text,
  p_sort_order           integer DEFAULT 0,
  p_extra_discipline_ids uuid[]  DEFAULT '{}'::uuid[]
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id       uuid;
  v_uid      uuid := public._current_user_data_id();
  v_code     text := btrim(p_code);
  v_extra    uuid[];
  v_conflict text;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.milestone_codes (id, discipline_id, code, grp, description, sort_order, created_by)
  VALUES (COALESCE(p_id, gen_random_uuid()), p_discipline_id, v_code,
          nullif(btrim(p_grp),''), nullif(btrim(p_description),''), coalesce(p_sort_order,0), v_uid)
  ON CONFLICT (id) DO UPDATE
    SET code        = v_code,
        grp         = nullif(btrim(p_grp),''),
        description = nullif(btrim(p_description),''),
        sort_order  = coalesce(p_sort_order,0),
        updated_at  = now()
  RETURNING id INTO v_id;   -- discipline_id (home) is never reassigned on edit

  -- Normalize the requested extra set: distinct, non-null, minus the home
  -- discipline (implicit) and this code's own id noise.
  SELECT coalesce(array_agg(DISTINCT e), '{}'::uuid[]) INTO v_extra
  FROM   unnest(coalesce(p_extra_discipline_ids, '{}'::uuid[])) AS e
  WHERE  e IS NOT NULL AND e <> p_discipline_id;

  -- Guard: a code string must stay unique within any discipline's EFFECTIVE set
  -- (its own home codes + codes shared into it). Reject sharing into a discipline
  -- that already surfaces a DIFFERENT code with the same string.
  SELECT d.name INTO v_conflict
  FROM   unnest(v_extra) AS ed(discipline_id)
  JOIN   public.disciplines d ON d.id = ed.discipline_id
  WHERE  EXISTS (SELECT 1 FROM public.milestone_codes mc
                 WHERE mc.code = v_code AND mc.id <> v_id AND mc.discipline_id = ed.discipline_id)
     OR  EXISTS (SELECT 1 FROM public.milestone_code_disciplines j
                 JOIN public.milestone_codes mc2 ON mc2.id = j.milestone_code_id
                 WHERE j.discipline_id = ed.discipline_id AND mc2.code = v_code AND mc2.id <> v_id)
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'Discipline "%" already has a code "%" — can''t share this one there.', v_conflict, v_code
      USING ERRCODE = '23505';
  END IF;

  -- Full replace of this code's extra-discipline links.
  DELETE FROM public.milestone_code_disciplines WHERE milestone_code_id = v_id;
  INSERT INTO public.milestone_code_disciplines (milestone_code_id, discipline_id, created_by)
  SELECT v_id, e, v_uid FROM unnest(v_extra) AS e
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_milestone_code(uuid, uuid, text, text, text, integer, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_milestone_code(uuid, uuid, text, text, text, integer, uuid[]) TO authenticated, service_role;

-- ── Codes available in a discipline = its own (home) + shared-in ────────────
CREATE OR REPLACE FUNCTION public.rpc_milestone_codes_for_discipline(p_discipline_id uuid)
RETURNS SETOF public.milestone_codes
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT mc.*
  FROM   public.milestone_codes mc
  WHERE  mc.is_active
    AND (mc.discipline_id = p_discipline_id
         OR EXISTS (SELECT 1 FROM public.milestone_code_disciplines j
                    WHERE j.milestone_code_id = mc.id AND j.discipline_id = p_discipline_id))
  ORDER BY mc.sort_order, mc.code;
$function$;

REVOKE ALL ON FUNCTION public.rpc_milestone_codes_for_discipline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_milestone_codes_for_discipline(uuid) TO authenticated, service_role;
