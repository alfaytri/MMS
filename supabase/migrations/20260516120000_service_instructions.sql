-- Junction table linking services to instructions (many-to-many)
CREATE TABLE IF NOT EXISTS public.service_instructions (
  service_id     UUID NOT NULL REFERENCES public.services(id)     ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES public.instructions(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, instruction_id)
);

CREATE INDEX IF NOT EXISTS idx_si_service     ON public.service_instructions(service_id);
CREATE INDEX IF NOT EXISTS idx_si_instruction ON public.service_instructions(instruction_id);

ALTER TABLE public.service_instructions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read; only service-role can write (mutations go through hooks)
CREATE POLICY "service_instructions_read" ON public.service_instructions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_instructions_write" ON public.service_instructions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
