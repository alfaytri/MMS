-- Change services.division from a rigid Postgres ENUM to plain text.
-- The divisions table (with its slug column) is the source of truth;
-- the enum constraint creates an out-of-sync fragility.
ALTER TABLE services
  ALTER COLUMN division TYPE text USING division::text;
