-- supabase/migrations/20260509120001_installed_products.sql

CREATE TABLE installed_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_id            uuid NOT NULL REFERENCES customer_phones(id),
  address_id          uuid REFERENCES customer_addresses(id),
  order_id            uuid NOT NULL REFERENCES orders(id),
  product_name        varchar(255) NOT NULL,
  brand               varchar(100),
  model               varchar(100),
  serial_number       varchar(100),
  installed_at        date NOT NULL,
  warranty_months     integer NOT NULL DEFAULT 0,
  warranty_expires_at date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Trigger function to compute warranty_expires_at
CREATE OR REPLACE FUNCTION compute_warranty_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.warranty_months > 0 THEN
    NEW.warranty_expires_at := NEW.installed_at + (NEW.warranty_months || ' months')::interval;
  ELSE
    NEW.warranty_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically compute warranty_expires_at
CREATE TRIGGER trigger_compute_warranty_expires_at
BEFORE INSERT OR UPDATE ON installed_products
FOR EACH ROW
EXECUTE FUNCTION compute_warranty_expires_at();

CREATE INDEX idx_installed_products_customer ON installed_products(customer_id);
CREATE INDEX idx_installed_products_order    ON installed_products(order_id);
CREATE INDEX idx_installed_products_phone    ON installed_products(phone_id);
