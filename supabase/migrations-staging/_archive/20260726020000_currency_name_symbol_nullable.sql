-- Currency schema simplification.
--
-- The UI now shows `code` + optional `symbol` only (name is redundant with
-- code for user-facing display). Existing rows keep their name / symbol
-- values; new rows can omit them.

BEGIN;

ALTER TABLE public.currencies ALTER COLUMN name   DROP NOT NULL;
ALTER TABLE public.currencies ALTER COLUMN symbol DROP NOT NULL;

COMMIT;
