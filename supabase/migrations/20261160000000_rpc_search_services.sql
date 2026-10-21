-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_search_services — server-side, indexed service search for the picker.
--
-- The picker used to walk a cascade of dropdowns over the whole tree held in
-- the browser. The catalogue is heading for ~500 services and beyond, so search
-- moves to the server behind trigram indexes rather than shipping every row to
-- every order form (and the Supabase budget rule forbids the latter anyway).
--
-- Returns BRANCHES AS WELL AS LEAVES, flagged by is_leaf: a branch that matches
-- the query is something the user drills into, never something they can add to
-- an order. The picker needs to see both to offer that.
--
-- `path` is the root -> leaf breadcrumb, built here by a recursive CTE. It is
-- what lets a human tell two services both named "Cleaning" apart; assembling
-- it client-side would mean shipping the tree, which is the thing this avoids.
--
-- TARGET: Dev DB (wkmvjxxmzstsvahuiwsz) only.
-- STAGING MIRROR DELIBERATELY SKIPPED: `services` is an excluded module,
-- dropped from staging/prod, so this has nothing to apply against there.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_services_name_en_trgm
  ON public.services USING gin (name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_services_name_ar_trgm
  ON public.services USING gin (name_ar gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.rpc_search_services(
  p_query           text,
  p_tree_type       text    DEFAULT 'normal',
  p_division_slugs  text[]  DEFAULT '{}',
  p_limit           int     DEFAULT 50
)
RETURNS TABLE (
  id              uuid,
  name_en         text,
  name_ar         text,
  path            text[],
  price           numeric,
  emergency_price numeric,
  duration        int,
  division        text[],
  thumb_url       text,
  is_leaf         boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE tree AS (
    -- Roots: the breadcrumb starts with the root's own name.
    SELECT s.id, s.parent_id, ARRAY[s.name_en] AS path
      FROM public.services s
     WHERE s.parent_id IS NULL
       AND s.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, t.path || c.name_en
      FROM public.services c
      JOIN tree t ON c.parent_id = t.id
     WHERE c.deleted_at IS NULL
  )
  SELECT
    s.id,
    s.name_en,
    s.name_ar,
    t.path,
    s.price,
    s.emergency_price,
    s.duration,
    s.division,
    s.catalog_thumb_url AS thumb_url,
    NOT EXISTS (
      SELECT 1 FROM public.services c
       WHERE c.parent_id = s.id AND c.deleted_at IS NULL
    ) AS is_leaf
  FROM public.services s
  JOIN tree t ON t.id = s.id
  WHERE s.deleted_at IS NULL
    AND s.status = 'active'
    AND s.tree_type = p_tree_type
    AND (
      coalesce(array_length(p_division_slugs, 1), 0) = 0
      OR s.division && p_division_slugs
    )
    AND (
      s.name_en ILIKE '%' || p_query || '%'
      OR (s.name_ar IS NOT NULL AND s.name_ar ILIKE '%' || p_query || '%')
    )
  -- Prefix matches first, then alphabetical: typing "cle" should surface
  -- "Cleaning" above "Coil Clean".
  ORDER BY (s.name_en ILIKE p_query || '%') DESC, s.name_en
  LIMIT p_limit;
$function$;

COMMENT ON FUNCTION public.rpc_search_services(text, text, text[], int) IS
  'Service picker search. Case-insensitive substring match on English or Arabic '
  'name, scoped to a tree_type and optionally to division slugs. Returns the '
  'root-to-leaf breadcrumb and an is_leaf flag; branches are returned so the '
  'picker can drill into them, but only leaves are addable to an order.';

GRANT EXECUTE ON FUNCTION public.rpc_search_services(text, text, text[], int) TO authenticated;
