-- Allowed values per attribute definition. Soft-hide via is_archived so
-- items already pointing at an option don't lose their reference when the
-- option is removed from the picker.
CREATE TABLE public.inventory_attribute_options (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  uuid NOT NULL REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE,
  value_en       text NOT NULL,
  value_ar       text,
  sort_order     int NOT NULL DEFAULT 0,
  is_archived    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on English value within a definition.
CREATE UNIQUE INDEX iao_value_en_ci_uidx ON public.inventory_attribute_options (definition_id, lower(value_en));
CREATE INDEX iao_definition_idx ON public.inventory_attribute_options (definition_id);
CREATE INDEX iao_active_idx     ON public.inventory_attribute_options (definition_id) WHERE NOT is_archived;

ALTER TABLE public.inventory_attribute_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY iao_read  ON public.inventory_attribute_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iao_write ON public.inventory_attribute_options FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
