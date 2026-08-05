-- Phase 8 Sub-task 8.2: Drop the Phase 6→7 write-off compat wrapper.
--
-- rpc_write_off_return_damaged(p_return_id uuid, p_warehouse_id uuid) was
-- reduced to a thin wrapper around rpc_record_inventory_disposition during
-- Phase 7.2. All callers migrated to useRecordInventoryDisposition during
-- Phase 7.5 (`ReplacementDeliveryDialog` / `SoDetailDialog` write-off path).
--
-- 8.1 verification (2026-07-29) confirmed zero live callers:
--   grep 'rpc_write_off_return_damaged' src/ → only the hook definition
--   grep 'useWriteOffDamagedReturn' src/ → only the hook's own definition
-- The hook itself is removed in the accompanying source change to
-- src/hooks/useSaleDeliveries.ts.

drop function if exists public.rpc_write_off_return_damaged(uuid, uuid);
