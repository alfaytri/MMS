-- Consumption warranties: warranty_records can now originate from a consumption
-- line instead of a sale delivery line. Relax the sales-only NOT NULLs and add
-- the consumption provenance + integrity guards. Existing sales rows keep
-- sale_delivery_line_id set (XOR still satisfied).
ALTER TABLE public.warranty_records
  ALTER COLUMN sale_delivery_line_id DROP NOT NULL,
  ALTER COLUMN sale_order_id         DROP NOT NULL,
  ALTER COLUMN customer_id           DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS consumption_id      uuid REFERENCES public.consumption_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS consumption_line_id uuid REFERENCES public.consumption_lines(id)  ON DELETE CASCADE;

-- Idempotency for the create RPC (one warranty per consumption line). NULLs are
-- distinct in a Postgres unique index, so all sales rows (consumption_line_id NULL)
-- coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_records_consumption_line
  ON public.warranty_records (consumption_line_id);

-- Exactly one source: a sale delivery line XOR a consumption line. Guarded so a
-- re-apply (e.g. after a partial cross-DB run) is a no-op instead of an error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warranty_records_source_xor'
      AND conrelid = 'public.warranty_records'::regclass
  ) THEN
    ALTER TABLE public.warranty_records
      ADD CONSTRAINT warranty_records_source_xor CHECK (
        (sale_delivery_line_id IS NOT NULL AND consumption_line_id IS NULL)
        OR (sale_delivery_line_id IS NULL AND consumption_line_id IS NOT NULL)
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
