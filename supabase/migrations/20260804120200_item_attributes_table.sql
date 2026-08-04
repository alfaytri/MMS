-- Per-item picked value. Cleared values delete the row rather than
-- storing NULL — no distinction between "never set" and "cleared".
-- option_id is RESTRICT so archived options that still have users
-- can't be hard-deleted (soft-hide via is_archived instead).
CREATE TABLE public.inventory_item_attributes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  definition_id  uuid NOT NULL REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE,
  option_id      uuid NOT NULL REFERENCES public.inventory_attribute_options(id) ON DELETE RESTRICT,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  UNIQUE (item_id, definition_id)
);

CREATE INDEX iia_item_idx       ON public.inventory_item_attributes (item_id);
CREATE INDEX iia_definition_idx ON public.inventory_item_attributes (definition_id);
CREATE INDEX iia_option_idx     ON public.inventory_item_attributes (option_id);

ALTER TABLE public.inventory_item_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY iia_read  ON public.inventory_item_attributes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iia_write ON public.inventory_item_attributes FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER iia_set_updated_at
  BEFORE UPDATE ON public.inventory_item_attributes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
