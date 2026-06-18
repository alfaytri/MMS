-- Make contract_id nullable — quotations use quotation_number instead;
-- contract_id is assigned later when a quotation is approved/activated.
-- Also relax site_name to have a default empty string for safety.

ALTER TABLE public.contracts
  ALTER COLUMN contract_id DROP NOT NULL;

ALTER TABLE public.contracts
  ALTER COLUMN site_name SET DEFAULT '';
