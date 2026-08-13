-- Warehouse item requests: the persisted "item needed" (buy-new) request.
-- Source of truth for the Requested Items tab. Writes go only through
-- rpc_request_warehouse_item / rpc_resolve_item_request (SECURITY DEFINER);
-- authenticated gets read-only, scoped to the warehouse's RP(s) + super-viewers/admin.
create table if not exists public.warehouse_item_requests (
  id                    uuid primary key default gen_random_uuid(),
  warehouse_id          uuid not null references public.warehouses(id) on delete cascade,
  requested_by          uuid references public.user_data(id) on delete set null,
  requester_name        text,
  dest_sub_container_id uuid references public.warehouse_sub_containers(id) on delete set null,
  dest_name             text,
  item_name             text not null,
  qty                   numeric not null check (qty > 0),
  notes                 text,
  status                text not null default 'pending'
                          check (status in ('pending','fulfilled','dismissed')),
  resolved_by           uuid references public.user_data(id) on delete set null,
  resolved_at           timestamptz,
  resolution_note       text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_wir_warehouse_status on public.warehouse_item_requests (warehouse_id, status);
create index if not exists idx_wir_created_at        on public.warehouse_item_requests (created_at desc);

alter table public.warehouse_item_requests enable row level security;

-- Read: RP of the request's warehouse, or a super-viewer (owner/accountant), or a system admin.
-- No INSERT/UPDATE/DELETE policies for authenticated: all writes go through the
-- SECURITY DEFINER RPCs (rpc_request_warehouse_item / rpc_resolve_item_request).
create policy "wir_select_rp_or_superviewer"
  on public.warehouse_item_requests for select to authenticated
  using (
    exists (
      select 1 from public.warehouse_responsible_persons wrp
      where wrp.warehouse_id = warehouse_item_requests.warehouse_id
        and wrp.profile_id   = public._current_user_data_id()
    )
    or (auth.jwt() ->> 'user_type') in ('owner','accountant')
    or public._auth_user_has_permission('system.admin')
  );
