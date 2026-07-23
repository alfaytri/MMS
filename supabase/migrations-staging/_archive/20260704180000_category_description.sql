-- Add description column to inventory_categories for internal notes
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS description text;
