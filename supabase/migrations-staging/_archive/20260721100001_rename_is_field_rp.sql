-- Migration: Rename is_field_rp → is_warehouse_responsible on custom_roles
-- Reviewer feedback: "What does field_rp mean? Just call it warehouse_responsible_person"

ALTER TABLE public.custom_roles
  RENAME COLUMN is_field_rp TO is_warehouse_responsible;

-- Update the RPC that checks this flag (is_field_rp_of)
CREATE OR REPLACE FUNCTION public.is_field_rp_of(p_profile_id uuid, p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_field_rps wfr
    WHERE  wfr.profile_id   = p_profile_id
      AND  wfr.warehouse_id = p_warehouse_id
  );
$$;
