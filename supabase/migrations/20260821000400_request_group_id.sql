-- Group link so a single custody "Request stock" submit can carry both an
-- in-inventory transfer AND buy-new item requests, shown together as one box
-- on the Requested Items tab. Nullable + additive; existing rows (null) stand
-- alone. Stamped by rpc_create_custody_assign / rpc_request_warehouse_item.
alter table public.warehouse_transfers      add column if not exists request_group_id uuid;
alter table public.warehouse_item_requests  add column if not exists request_group_id uuid;

create index if not exists idx_wt_request_group  on public.warehouse_transfers (request_group_id) where request_group_id is not null;
create index if not exists idx_wir_request_group on public.warehouse_item_requests (request_group_id) where request_group_id is not null;
