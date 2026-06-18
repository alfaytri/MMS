-- supabase/migrations/20260428200002_fix_backfill_division_id.sql
-- Re-run backfill with deterministic tie-breaking (earliest assignment wins).
-- Rows already backfilled (division_id IS NOT NULL) are untouched.

UPDATE purchase_orders
SET    division_id = (
  SELECT ud.division_id
  FROM   user_divisions ud
  WHERE  ud.profile_id = purchase_orders.created_by
  ORDER BY ud.created_at
  LIMIT 1
)
WHERE  division_id IS NULL
  AND  created_by IS NOT NULL;

UPDATE sale_orders
SET    division_id = (
  SELECT ud.division_id
  FROM   user_divisions ud
  WHERE  ud.profile_id = sale_orders.created_by
  ORDER BY ud.created_at
  LIMIT 1
)
WHERE  division_id IS NULL
  AND  created_by IS NOT NULL;
