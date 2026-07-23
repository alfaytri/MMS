-- Idempotent: re-align country_codes.id sequence to MAX(id).
-- Needed on environments where rows were inserted with explicit IDs (e.g. fresh staging
-- seed) so the SERIAL sequence doesn't collide with existing primary keys.

SELECT setval(
  pg_get_serial_sequence('public.country_codes', 'id'),
  COALESCE((SELECT MAX(id) FROM public.country_codes), 1),
  true
);
