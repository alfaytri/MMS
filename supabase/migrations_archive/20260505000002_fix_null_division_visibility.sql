-- Records with NULL division_id pre-date division isolation and were never
-- assigned to a division. Treat them as unscoped: visible to all authenticated
-- users. Division-scoped records (division_id IS NOT NULL) remain restricted.
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    row_division_id IS NULL
    OR (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR row_division_id = ANY(
      ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    )
  );
$$;
