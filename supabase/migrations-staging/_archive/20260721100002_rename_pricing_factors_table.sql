-- Migration: Rename pricing_factors → contract_pricing_factors
-- Reviewer feedback: "Pricing factor is for contract? We need to make it clear."

ALTER TABLE public.pricing_factors RENAME TO contract_pricing_factors;

-- Rename FK constraints to match new table name
ALTER TABLE public.contract_pricing_factors
  RENAME CONSTRAINT pricing_factors_pkey TO contract_pricing_factors_pkey;

ALTER TABLE public.contract_pricing_factors
  RENAME CONSTRAINT pricing_factors_created_by_fkey TO contract_pricing_factors_created_by_fkey;

-- division FK was originally to divisions; may have been updated to company_divisions
DO $$
BEGIN
  ALTER TABLE public.contract_pricing_factors
    RENAME CONSTRAINT pricing_factors_division_id_fkey TO contract_pricing_factors_division_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Rename the update trigger
DROP TRIGGER IF EXISTS set_pricing_factors_updated_at ON public.contract_pricing_factors;
CREATE TRIGGER set_contract_pricing_factors_updated_at
  BEFORE UPDATE ON public.contract_pricing_factors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rename RLS policies
ALTER POLICY "Internal users can read pricing_factors"   ON public.contract_pricing_factors RENAME TO "Internal users can read contract_pricing_factors";
ALTER POLICY "Internal users can insert pricing_factors" ON public.contract_pricing_factors RENAME TO "Internal users can insert contract_pricing_factors";
ALTER POLICY "Internal users can update pricing_factors" ON public.contract_pricing_factors RENAME TO "Internal users can update contract_pricing_factors";
ALTER POLICY "Internal users can delete pricing_factors" ON public.contract_pricing_factors RENAME TO "Internal users can delete contract_pricing_factors";

-- Create a compatibility view so existing queries don't break during transition
CREATE OR REPLACE VIEW public.pricing_factors AS
  SELECT * FROM public.contract_pricing_factors;
