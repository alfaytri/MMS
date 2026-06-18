-- Fix customer_addresses to match TypeScript types, and add RLS to customer_phones.
--
-- Original schema used different column names and an enum with hyphens.
-- TypeScript types expect: address_type, unit_no/building_no/street_no/zone_no, lat/lng,
-- is_primary, blue_plate_no, nullable label.

-- ── 1. customer_phones: enable RLS (was missing) ──────────────────────────────
ALTER TABLE customer_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users can manage customer_phones" ON customer_phones;
CREATE POLICY "Internal users can manage customer_phones"
  ON customer_phones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. customer_addresses: rename columns to match TS interface ────────────────

-- Convert enum column to varchar with new value names
ALTER TABLE customer_addresses
  ALTER COLUMN type TYPE varchar(20) USING (
    CASE type::text
      WHEN 'blue-plate'   THEN 'blue_plate'
      WHEN 'google-coords' THEN 'coordinates'
      ELSE type::text
    END
  );

ALTER TABLE customer_addresses RENAME COLUMN type TO address_type;

-- Rename blue plate sub-fields
ALTER TABLE customer_addresses RENAME COLUMN blue_plate_unit     TO unit_no;
ALTER TABLE customer_addresses RENAME COLUMN blue_plate_building TO building_no;
ALTER TABLE customer_addresses RENAME COLUMN blue_plate_street   TO street_no;
ALTER TABLE customer_addresses RENAME COLUMN blue_plate_zone     TO zone_no;

-- Rename coordinate columns
ALTER TABLE customer_addresses RENAME COLUMN coords_lat TO lat;
ALTER TABLE customer_addresses RENAME COLUMN coords_lng TO lng;

-- Add missing columns
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS is_primary   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blue_plate_no varchar;

-- Make label nullable (was NOT NULL)
ALTER TABLE customer_addresses ALTER COLUMN label DROP NOT NULL;

-- Drop legacy columns no longer in TS type
ALTER TABLE customer_addresses
  DROP COLUMN IF EXISTS line,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS updated_at;
