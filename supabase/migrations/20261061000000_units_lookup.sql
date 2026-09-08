-- Managed Units lookup — a mirror of public.brands so the item Unit field
-- becomes an add-your-own + reuse list instead of a hardcoded dropdown.
-- items.unit stays TEXT (the unit name); this table only supplies the options.
BEGIN;

CREATE TABLE IF NOT EXISTS public.units (
  id         uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name       text        NOT NULL,
  name_ar    text,
  sort_order integer     DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid
);

-- Case-insensitive uniqueness so "Piece" and "piece" cannot both exist.
CREATE UNIQUE INDEX IF NOT EXISTS units_lower_name_key ON public.units (lower(name));

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Same permissive authenticated access as public.brands (baseline policies).
CREATE POLICY "Internal users can read units"   ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal users can insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can update units" ON public.units FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can delete units" ON public.units FOR DELETE TO authenticated USING (true);

-- Seed the 9 units previously hardcoded in ItemEditDialog.
INSERT INTO public.units (name, sort_order) VALUES
  ('Piece', 1), ('Kg', 2), ('Litre', 3), ('Set', 4), ('Box', 5),
  ('Metre', 6), ('Roll', 7), ('Pair', 8), ('Other', 9)
ON CONFLICT (lower(name)) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
