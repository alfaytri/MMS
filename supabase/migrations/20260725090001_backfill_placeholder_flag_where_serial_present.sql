-- Backfill: any tool_asset_units row with a real serial but is_placeholder=true
-- (side effect of the earlier auto_generate RPC that didn't flip the flag).
BEGIN;

UPDATE tool_asset_units
   SET is_placeholder = false
 WHERE is_placeholder = true
   AND serial_number IS NOT NULL;

COMMIT;
