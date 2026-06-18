-- Add V2 contract-type metadata to contract_services line items
-- Mirrors columns on the services master-data table so quotation
-- line items preserve the service's type context.

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS contract_type text
    DEFAULT 'preventive'
    CHECK (contract_type IN ('preventive', 'area', 'general'));

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS item_kind text
    DEFAULT 'service'
    CHECK (item_kind IN ('service', 'product'));

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS pricing_mode text
    DEFAULT 'by_condition'
    CHECK (pricing_mode IN ('fixed', 'by_condition'));

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS discount numeric
    DEFAULT 0
    CHECK (discount >= 0);

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS discount_scope text
    DEFAULT 'services_only'
    CHECK (discount_scope IN ('services_only', 'services_and_products'));

ALTER TABLE contract_services
  ADD COLUMN IF NOT EXISTS price_unit text;
