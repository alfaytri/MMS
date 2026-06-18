-- Backfill inventory for returns that were set to status='restocked'
-- before rpc_process_return_restock existed (restocked_at IS NULL).
-- The RPC is idempotent: it stamps restocked_at on success, so a
-- second run on any row is a no-op.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM   returns
    WHERE  status       = 'restocked'
      AND  restocked_at IS NULL
  LOOP
    PERFORM rpc_process_return_restock(r.id);
  END LOOP;
END;
$$;
