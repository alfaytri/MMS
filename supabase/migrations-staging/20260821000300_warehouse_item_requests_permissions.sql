-- Grant the Requested Items keys to every non-deleted role that can already
-- reach the warehouse module (holds warehouse.access). Idempotent via the @>
-- containment guard; owner / system-admin roles bypass permission checks anyway.
update public.custom_roles
   set permissions = array(
         select distinct e
         from unnest(
           permissions || array['warehouse.item_requests.view', 'warehouse.item_requests.manage']
         ) e
       )
 where deleted_at is null
   and 'warehouse.access' = any(permissions)
   and not (permissions @> array['warehouse.item_requests.view', 'warehouse.item_requests.manage']);
