-- Drop the legacy 7-arg overload of create_and_approve_receival left behind
-- after the D.2 CREATE OR REPLACE added a new 8-arg signature. Postgres treats
-- differing arg counts as separate functions, so REPLACE only touched one.
-- Callers must go through the new 8-arg version (p_sub_container_id may be
-- NULL to preserve the legacy auto-derive path).

DROP FUNCTION IF EXISTS public.create_and_approve_receival(
  uuid, uuid, date, text, text, text, jsonb
);
