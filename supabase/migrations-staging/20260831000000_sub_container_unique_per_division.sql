-- Custody / project sub-containers: allow the same location name in different
-- divisions of one warehouse (e.g. "Team 1" under both Maintenance and Kitchen).
--
-- Was: UNIQUE (warehouse_id, name) — a name could exist only ONCE per warehouse
-- regardless of division, so creating "Team 1" for a second division failed and
-- surfaced the (misleading) "already exists in this warehouse and division"
-- toast. Now scope uniqueness to (warehouse_id, division_id, name).
--
-- NULLS NOT DISTINCT: division_id is nullable (repair vendors / a few legacy
-- rows). The old constraint kept null-division names unique per warehouse; NULLS
-- NOT DISTINCT preserves that (two (wh, NULL, 'X') rows still collide) while
-- allowing (wh, div-A, 'X') alongside (wh, div-B, 'X'). Requires PG 15+ (staging
-- is 17.6).
--
-- Strictly MORE permissive than the old constraint, so no existing row can
-- violate the new one — dropping the stricter constraint and adding the looser
-- one is safe. The custody upsert RPC (rpc_upsert_warehouse_sub_container) uses a
-- plain INSERT (no ON CONFLICT on this constraint), and nothing references the
-- old constraint name at runtime.
ALTER TABLE public.warehouse_sub_containers
  DROP CONSTRAINT warehouse_sub_containers_warehouse_name_uniq,
  ADD CONSTRAINT warehouse_sub_containers_warehouse_division_name_uniq
    UNIQUE NULLS NOT DISTINCT (warehouse_id, division_id, name);

NOTIFY pgrst, 'reload schema';
