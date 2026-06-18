-- Payment batches: groups multiple tl_invoices into a single Dibsy payment
CREATE TABLE IF NOT EXISTS tl_payment_batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone    text        NOT NULL,
  total_amount      numeric     NOT NULL,
  dibsy_payment_id  text,
  dibsy_checkout_url text,
  payment_status    text        NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending', 'paid')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tl_payment_batch_items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid    NOT NULL REFERENCES tl_payment_batches(id) ON DELETE CASCADE,
  tl_invoice_id   uuid    NOT NULL REFERENCES tl_invoices(id),
  amount          numeric NOT NULL
);

-- updated_at trigger for batches
CREATE OR REPLACE FUNCTION update_tl_payment_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tl_payment_batches_updated_at
  BEFORE UPDATE ON tl_payment_batches
  FOR EACH ROW EXECUTE FUNCTION update_tl_payment_batches_updated_at();

-- RLS
ALTER TABLE tl_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tl_payment_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payment batches"
  ON tl_payment_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert payment batches"
  ON tl_payment_batches FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update payment batches"
  ON tl_payment_batches FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view batch items"
  ON tl_payment_batch_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert batch items"
  ON tl_payment_batch_items FOR INSERT TO authenticated WITH CHECK (true);
