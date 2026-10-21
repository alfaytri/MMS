-- ─────────────────────────────────────────────────────────────────────────────
-- Harden rpc_search_services.
--
-- (1) SECURITY INVOKER, not DEFINER. `services` has no RLS today, so DEFINER
--     bought nothing — but it would become a silent RLS bypass the day anyone
--     enables it. INVOKER is identical now and safe later.
-- (2) p_limit is clamped server-side. Any authenticated caller could pass
--     1,000,000 and walk the whole catalogue; the Free-plan quota has been
--     exhausted twice already.
-- (3) p_query escapes LIKE metacharacters. Typing a single `%` matched every
--     service in the catalogue.
-- (4) The recursive CTE carries a visited-id array and stops on a cycle. A
--     parent_id loop previously recursed until the statement was killed.
-- ─────────────────────────────────────────────────────────────────────────────

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
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT s.id, s.parent_id, ARRAY[s.name_en] AS path, ARRAY[s.id] AS seen
      FROM public.services s
     WHERE s.parent_id IS NULL
       AND s.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, t.path || c.name_en, t.seen || c.id
      FROM public.services c
      JOIN tree t ON c.parent_id = t.id
     WHERE c.deleted_at IS NULL
       -- Cycle guard: a parent_id loop would otherwise recurse until killed.
       AND NOT (c.id = ANY(t.seen))
       AND array_length(t.seen, 1) < 20
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
      s.name_en ILIKE '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      OR (s.name_ar IS NOT NULL AND s.name_ar ILIKE '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    )
  ORDER BY (s.name_en ILIKE p_query || '%') DESC, s.name_en
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_search_services(text, text, text[], int) TO authenticated;
