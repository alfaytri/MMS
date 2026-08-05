-- Attribute schema per inventory category. Sub-categories inherit from
-- ancestors additively; a key can appear at most once per top-level tree.
CREATE TABLE public.inventory_attribute_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid NOT NULL REFERENCES public.inventory_categories(id) ON DELETE CASCADE,
  attribute_key     text NOT NULL,
  label_en          text NOT NULL,
  label_ar          text,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  UNIQUE (category_id, attribute_key)
);

CREATE INDEX iad_category_idx ON public.inventory_attribute_definitions (category_id);
CREATE INDEX iad_key_idx      ON public.inventory_attribute_definitions (attribute_key);

ALTER TABLE public.inventory_attribute_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY iad_read  ON public.inventory_attribute_definitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iad_write ON public.inventory_attribute_definitions FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Branch-uniqueness enforcement — walks ancestors + descendants and blocks
-- duplicate attribute_key. Cap depth at 10 to bound the walk.
CREATE OR REPLACE FUNCTION public._check_attribute_key_branch_unique()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conflict_category text;
BEGIN
  -- Ancestors
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, a.depth + 1
    FROM public.inventory_categories c
    JOIN ancestors a ON a.parent_id = c.id
    WHERE a.depth < 10
  )
  SELECT c.name_en INTO v_conflict_category
  FROM ancestors a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at ancestor category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  -- Descendants
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE parent_id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, d.depth + 1
    FROM public.inventory_categories c
    JOIN descendants d ON c.parent_id = d.id
    WHERE d.depth < 10
  )
  SELECT c.name_en INTO v_conflict_category
  FROM descendants a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at descendant category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER iad_branch_unique_trg
  BEFORE INSERT OR UPDATE OF category_id, attribute_key
  ON public.inventory_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public._check_attribute_key_branch_unique();

-- Auto-update updated_at on UPDATE (project uses public.set_updated_at())
CREATE TRIGGER iad_set_updated_at
  BEFORE UPDATE ON public.inventory_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
