-- Customer addresses become their own table (many per customer), mirroring
-- customer_phones. Each row is a blue-plate string OR coordinates, plus a
-- Google Maps link (generated from the coordinates, e.g. after a blue-plate
-- verify, or from a pasted pair). The single embedded address on customers
-- (address/latitude/longitude, migration 20261008000000) is backfilled here and
-- then dropped — only the customer form read it (verified: no view/rule deps).

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label       text,
  address     text,
  latitude    numeric,
  longitude   numeric,
  map_link    text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx
  ON public.customer_addresses(customer_id);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (mirrors customer_phones_select_authenticated).
DROP POLICY IF EXISTS customer_addresses_select_authenticated ON public.customer_addresses;
CREATE POLICY customer_addresses_select_authenticated ON public.customer_addresses
  FOR SELECT TO authenticated USING (true);

-- Write: gated by master_data.customers.manage (mirrors customer_phones).
-- (Normal writes go through save_customer_addresses, SECURITY DEFINER, but these
--  keep direct table access consistent with the sibling table.)
DROP POLICY IF EXISTS customer_addresses_insert_manage ON public.customer_addresses;
CREATE POLICY customer_addresses_insert_manage ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

DROP POLICY IF EXISTS customer_addresses_update_manage ON public.customer_addresses;
CREATE POLICY customer_addresses_update_manage ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

DROP POLICY IF EXISTS customer_addresses_delete_manage ON public.customer_addresses;
CREATE POLICY customer_addresses_delete_manage ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated, service_role;

-- ── Atomic multi-address save (mirrors save_customer_phones) ─────────────────
-- p_addresses is a JSON array of {label, address, latitude, longitude, map_link,
-- is_primary}. Unlike phones, addresses are OPTIONAL: NULL/empty clears them all.
-- When any are supplied, exactly one must be primary. Replaces the whole set.
CREATE OR REPLACE FUNCTION public.save_customer_addresses(
  p_customer_id uuid,
  p_addresses   jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_count int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF p_addresses IS NULL OR jsonb_typeof(p_addresses) <> 'array' OR jsonb_array_length(p_addresses) = 0 THEN
    DELETE FROM public.customer_addresses WHERE customer_id = p_customer_id;
    RETURN;
  END IF;

  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_addresses) elem
  WHERE (elem->>'is_primary')::boolean IS TRUE;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one address must be marked primary (got %)', v_primary_count;
  END IF;

  DELETE FROM public.customer_addresses WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_addresses
    (customer_id, label, address, latitude, longitude, map_link, is_primary)
  SELECT p_customer_id,
         NULLIF(BTRIM(COALESCE(elem->>'label', '')), ''),
         NULLIF(BTRIM(COALESCE(elem->>'address', '')), ''),
         NULLIF(elem->>'latitude',  '')::numeric,
         NULLIF(elem->>'longitude', '')::numeric,
         NULLIF(BTRIM(COALESCE(elem->>'map_link', '')), ''),
         (elem->>'is_primary')::boolean
    FROM jsonb_array_elements(p_addresses) elem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_customer_addresses(uuid, jsonb) TO authenticated, service_role;

-- ── Backfill the single embedded address, then drop the columns ──────────────
INSERT INTO public.customer_addresses (customer_id, label, address, latitude, longitude, map_link, is_primary)
SELECT c.id,
       'Primary',
       c.address,
       c.latitude,
       c.longitude,
       CASE WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL
            THEN 'https://www.google.com/maps?q=' || c.latitude || ',' || c.longitude
            ELSE NULL END,
       true
FROM   public.customers c
WHERE  NULLIF(BTRIM(COALESCE(c.address, '')), '') IS NOT NULL
   OR  (c.latitude IS NOT NULL AND c.longitude IS NOT NULL);

ALTER TABLE public.customers DROP COLUMN IF EXISTS address;
ALTER TABLE public.customers DROP COLUMN IF EXISTS latitude;
ALTER TABLE public.customers DROP COLUMN IF EXISTS longitude;
