-- Add direct FK from replacement deliveries back to the credit note that triggered them.
-- The existing `return_id` links to the return, which links to the credit note indirectly.
-- This FK provides a direct link for faster queries and data integrity.

ALTER TABLE sale_deliveries
  ADD COLUMN IF NOT EXISTS source_credit_note_id uuid
  REFERENCES credit_notes(id);

CREATE INDEX IF NOT EXISTS idx_sale_deliveries_credit_note_id
  ON sale_deliveries(source_credit_note_id)
  WHERE source_credit_note_id IS NOT NULL;
