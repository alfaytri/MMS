-- Contract Services V2: item_kind, pricing_mode, discount_scope
-- NOTE: When the Contracts/Visit Generator module is built,
-- it must filter out item_kind='product' rows from visit scheduling.

-- Add item kind (service vs product) for contract services
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS item_kind text
  DEFAULT 'service'
  CHECK (item_kind IN ('service', 'product'));

-- Add pricing mode for preventive contract services
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS pricing_mode text
  DEFAULT 'by_condition'
  CHECK (pricing_mode IN ('fixed', 'by_condition'));

-- Add discount scope for general contract services
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS discount_scope text
  DEFAULT 'services_only'
  CHECK (discount_scope IN ('services_only', 'services_and_products'));
