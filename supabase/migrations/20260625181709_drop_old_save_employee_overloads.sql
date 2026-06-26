-- Drop old overloads of save_employee that cause PostgREST 400 ambiguity.
-- Keep only the 9-param version (with p_division_id DEFAULT NULL).

-- 8-param version (no division_id)
DROP FUNCTION IF EXISTS public.save_employee(uuid, text, text, text, date, text, text, uuid[]);

-- 10-param version (with site_visit booleans — superseded)
DROP FUNCTION IF EXISTS public.save_employee(uuid, text, text, text, date, text, boolean, boolean, text, uuid[]);
