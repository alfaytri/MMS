# Warehouse Item Requests — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the free-text "item needed" (buy-new) request as a first-class row and give warehouse RPs a dedicated **Requested Items** tab to see and resolve them, replacing the fire-and-forget notification.

**Architecture:** New `warehouse_item_requests` table is the source of truth. `rpc_request_warehouse_item` (SECURITY DEFINER) is rewritten to insert a request row **and** an actionable notification pointing at it; `rpc_resolve_item_request` (new) marks a request fulfilled/dismissed and clears its notifications. A new RP-scoped tab on Master Data → Warehouses lists and resolves requests; the custody dialog's standalone "Send request" button is folded into its main submit.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres 17, RLS, SECURITY DEFINER RPCs), TanStack Query v5, shadcn/ui + Tailwind.

**Design:** [`design.md`](./design.md) — sibling in this feature's folder.

## Global Constraints

- **Feature folder:** every doc for this feature — this plan (`plan.md`), the design (`design.md`), and the operator test-matrix (`test-matrix.xlsx`) — lives in `docs/plans/2026-08-13-warehouse-item-requests/`. Never scatter them into `docs/testing/` or other loose locations.
- **Migrations mirrored:** every new `.sql` is written to **both** `supabase/migrations/` and `supabase/migrations-staging/` (byte-identical) in the same commit.
- **Migration targets:** apply to **staging** (`mwvblpgbgxipvrevkeff`, the linked default) **and new-prod** (`optishfnnctrhffpoywg`, via `--db-url "$NEW_DB_URL"` from `supabase/.temp/migrate.env`). Dev DB is frozen — do NOT push there.
- **Migration timestamps** must be greater than the current max in `supabase/migrations/` (last applied `20260820001300`). This plan uses the `20260821…` series — confirm none already exist before creating.
- **Live-source RPC bodies:** before rewriting `rpc_request_warehouse_item`, fetch the LIVE body (`select pg_get_functiondef('public.rpc_request_warehouse_item(uuid,text,numeric,uuid,text)'::regprocedure)`); the baseline is stale. Return-type change (int→uuid) requires **DROP then CREATE** + re-`GRANT`. Confirm a single overload (`\df rpc_request_warehouse_item`) so the DROP is unambiguous.
- **Confirm helper names against the live DB before writing RLS/RPCs:** `public._current_user_data_id()`, the super-viewer expression `(auth.jwt() ->> 'user_type') in ('owner','accountant')`, and the admin helper (`public._auth_user_has_permission('system.admin')` — verify exact name/signature; fall back to the pattern used by an existing `warehouse_*` policy).
- **Prove every write path** via a rolled-back `DO` block against the pushed function before claiming done (insert-request path, resolve-as-RP, resolve-as-non-RP rejection).
- **After `supabase gen types` re-append** the four `DBTable`/`DBInsert`/`DBUpdate`/`AllTables` helper aliases to `src/types/database.types.ts` (the CLI wipes them).
- **Dropdowns show human-readable labels, never UUIDs.** The warehouse filter renders `warehouse.name`; resolve to a label via `.find()`.
- **Responsive:** desktop table (`hidden md:block`) + mobile card list (`md:hidden`); tap targets ≥44px (`min-h-11 md:min-h-0`); the page body never scrolls sideways.
- **Supabase budget:** every list read carries `.limit(N)`; no unfiltered realtime channels.
- **Surface raw DB errors:** wrap any `PostgrestError` into a real `Error` concatenating `code/message/details/hint` (it is not an `Error` subclass) — never render a generic "Failed to…".
- **Commits:** HEREDOC with both trailers (`Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` and `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`). **Per project rule, code is committed only after the operator confirms it works** — the `Commit` steps below are the intended commit points but wait for that confirmation. DB migration files are committed when applied (they are the record of what ran).
- **Flow registry:** add the item-request flow to `docs/flows-registry.md` in the same commit as the code.
- **Docs:** update `PROGRESS.md` + `EOD/EOD-2026-08-13.md` per task; add a `## 🔒 Security Audit Log` row on completion.

## File Structure

- `supabase/migrations{,-staging}/20260821000000_warehouse_item_requests_table.sql` — table + indexes + RLS.
- `supabase/migrations{,-staging}/20260821000100_rpc_request_warehouse_item_persist.sql` — RPC rewrite.
- `supabase/migrations{,-staging}/20260821000200_rpc_resolve_item_request.sql` — resolve RPC.
- `supabase/migrations{,-staging}/20260821000300_warehouse_item_requests_permissions.sql` — permission backfill.
- `src/lib/permissions.ts` — add the two permission keys (Warehouse group).
- `src/lib/permissions.test.ts` — assert the keys exist + are active.
- `src/types/database.types.ts` — regenerated (+ re-appended helpers).
- `src/hooks/useWarehouseItemRequests.ts` — new: list hook + resolve mutation.
- `src/hooks/useCustodyMoves.ts:229-248` — update `useRequestWarehouseItem` return type + error wrap.
- `src/components/purchase/wh/WhItemRequestsTab.tsx` — new tab component (table + cards + filters + actions).
- `src/app/(dashboard)/master-data/warehouses/page.tsx` — register the new tab (gated on `warehouse.item_requests.view`).
- `src/lib/notification-routes.ts` — add `item_request` → actionable, routes to the tab.
- `src/components/warehouse/custody/CustodyAssignDialog.tsx` — fold item-needed into the main submit; drop the standalone button.
- `docs/flows-registry.md` — new flow entry.

---

## Task 1: DB — `warehouse_item_requests` table + RLS

**Files:**
- Create: `supabase/migrations/20260821000000_warehouse_item_requests_table.sql`
- Create (mirror): `supabase/migrations-staging/20260821000000_warehouse_item_requests_table.sql`

**Interfaces:**
- Produces: table `public.warehouse_item_requests` with columns `(id uuid, warehouse_id uuid, requested_by uuid, requester_name text, dest_sub_container_id uuid, dest_name text, item_name text, qty numeric, notes text, status text, resolved_by uuid, resolved_at timestamptz, resolution_note text, created_at timestamptz)`; SELECT-only RLS for authenticated (RP / super-viewer / admin).

- [ ] **Step 1: Confirm helpers + no name clash.** Run:
```bash
npx supabase db query --linked "select proname from pg_proc where proname in ('_current_user_data_id','_auth_user_has_permission'); select to_regclass('public.warehouse_item_requests');"
```
Expected: both helpers listed; `warehouse_item_requests` is `NULL` (does not exist yet). If a helper name differs, adjust the RLS in Step 2 to match an existing `warehouse_*` policy.

- [ ] **Step 2: Write the migration.** Create both files with identical content:
```sql
-- Warehouse item requests: the persisted "item needed" (buy-new) request.
-- Source of truth for the Requested Items tab. Writes go only through
-- rpc_request_warehouse_item / rpc_resolve_item_request (SECURITY DEFINER);
-- authenticated gets read-only, scoped to the warehouse's RP(s) + super-viewers.
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
-- No INSERT/UPDATE/DELETE policies: all writes go through the DEFINER RPCs below.
```

- [ ] **Step 3: Apply to staging + verify.** Run:
```bash
npx supabase db push --yes
npx supabase db query --linked "select to_regclass('public.warehouse_item_requests') as tbl, relrowsecurity from pg_class where relname='warehouse_item_requests';"
```
Expected: `tbl = public.warehouse_item_requests`, `relrowsecurity = t`.

- [ ] **Step 4: Verify no direct write is possible** (RLS has no write policy). Run a rolled-back probe as `authenticated`:
```bash
npx supabase db query --linked "do \$\$ begin
  begin
    insert into public.warehouse_item_requests(warehouse_id,item_name,qty) values (gen_random_uuid(),'probe',1);
    raise notice 'UNEXPECTED_INSERT_OK';
  exception when insufficient_privilege then raise notice 'PROBE_OK_insert_blocked';
  end;
  rollback;
end \$\$;"
```
Expected: `PROBE_OK_insert_blocked` (as the migration runs as owner it may insert; the real gate is the missing `for insert`/`for update` policy — confirm via `select polcmd from pg_policy where polrelid='public.warehouse_item_requests'::regclass;` returns only `r`).

- [ ] **Step 5: Apply to new-prod.** Run:
```bash
set -a; . supabase/.temp/migrate.env; set +a
npx supabase db push --db-url "$NEW_DB_URL" --yes
```
Expected: applies `20260821000000`; "Remote database is up to date" on a second dry-run.

- [ ] **Step 6: Commit the migration** (record of what ran):
```bash
git add "supabase/migrations/20260821000000_warehouse_item_requests_table.sql" "supabase/migrations-staging/20260821000000_warehouse_item_requests_table.sql"
git commit -m "$(printf 'feat(db): warehouse_item_requests table + RLS\n\nCo-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>')"
```

---

## Task 2: DB — rewrite `rpc_request_warehouse_item` to persist + notify

**Files:**
- Create: `supabase/migrations/20260821000100_rpc_request_warehouse_item_persist.sql` (+ staging mirror)

**Interfaces:**
- Consumes: `warehouse_item_requests` (Task 1).
- Produces: `public.rpc_request_warehouse_item(p_warehouse_id uuid, p_item_name text, p_qty numeric, p_dest_sub_container_id uuid default null, p_notes text default null) returns uuid` — inserts one request row (returned) + one `notifications` row per warehouse RP with `type='item_request'`, `related_id=<request id>`, `related_type='item_request'`.

- [ ] **Step 1: Fetch the live body + confirm single overload.** Run:
```bash
npx supabase db query --linked "\df public.rpc_request_warehouse_item"
npx supabase db query --linked "select pg_get_functiondef('public.rpc_request_warehouse_item(uuid,text,numeric,uuid,text)'::regprocedure);"
```
Expected: exactly one overload; body matches the archived `20260820000600` (per-RP notification insert, returns integer). Base the rewrite on the LIVE body.

- [ ] **Step 2: Write the migration** (both files, identical):
```sql
-- Persist the request as a row AND drop an actionable notification per RP.
-- Return type changes int -> uuid, so DROP + CREATE + re-GRANT.
drop function if exists public.rpc_request_warehouse_item(uuid, text, numeric, uuid, text);

create function public.rpc_request_warehouse_item(
  p_warehouse_id          uuid,
  p_item_name             text,
  p_qty                   numeric,
  p_dest_sub_container_id uuid default null,
  p_notes                 text default null
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid        uuid := public._current_user_data_id();
  v_requester  text;
  v_wh_name    text;
  v_dest_name  text;
  v_title      text;
  v_body       text;
  v_request_id uuid;
  v_rp         record;
begin
  if v_uid is null then raise exception 'You need to be signed in to request an item.'; end if;
  if p_item_name is null or btrim(p_item_name) = '' then raise exception 'Item name is required.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;

  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  if v_wh_name is null then raise exception 'Warehouse not found.'; end if;

  select full_name into v_requester from public.user_data where id = v_uid;
  if p_dest_sub_container_id is not null then
    select name into v_dest_name from public.warehouse_sub_containers where id = p_dest_sub_container_id;
  end if;

  insert into public.warehouse_item_requests
    (warehouse_id, requested_by, requester_name, dest_sub_container_id, dest_name, item_name, qty, notes)
  values
    (p_warehouse_id, v_uid, v_requester, p_dest_sub_container_id, v_dest_name,
     btrim(p_item_name), p_qty, nullif(btrim(coalesce(p_notes,'')), ''))
  returning id into v_request_id;

  v_title := 'Item needed: ' || btrim(p_item_name);
  v_body  := format(
    '%s needs %s x %s (not in stock at %s)%s%s',
    coalesce(v_requester, 'A user'), p_qty, btrim(p_item_name), v_wh_name,
    case when v_dest_name is not null then ' - for ' || v_dest_name else '' end,
    case when coalesce(btrim(p_notes), '') <> '' then '. Note: ' || btrim(p_notes) else '' end
  );

  for v_rp in
    select distinct profile_id from public.warehouse_responsible_persons
    where warehouse_id = p_warehouse_id and profile_id is not null
  loop
    insert into public.notifications (profile_id, type, title, body, related_id, related_type)
    values (v_rp.profile_id, 'item_request', v_title, v_body, v_request_id, 'item_request');
  end loop;

  -- No RP configured is no longer fatal: the request is recorded and visible to
  -- super-viewers/admins on the Requested Items tab.
  return v_request_id;
end;
$function$;

grant execute on function public.rpc_request_warehouse_item(uuid, text, numeric, uuid, text)
  to authenticated, service_role;
```

- [ ] **Step 3: Apply to staging.** Run: `npx supabase db push --yes`. Expected: applies `20260821000100`.

- [ ] **Step 4: Prove the write path** (rolled-back DO block impersonating a real requester + warehouse with RPs — pick live ids first):
```bash
npx supabase db query --linked "select w.id wh, (select profile_id from warehouse_responsible_persons r where r.warehouse_id=w.id limit 1) rp from warehouses w where exists(select 1 from warehouse_responsible_persons r where r.warehouse_id=w.id) limit 1;"
```
Then run a `do $$ … set local role authenticated; set local request.jwt.claim.sub = <auth uid of a requester>; perform rpc_request_warehouse_item(<wh>, 'PROBE gauge', 3, null, 'note'); … rollback $$;` and assert one `warehouse_item_requests` row + N notifications with `related_type='item_request'` and matching `related_id`. Expected: `PROBE_OK request=1 notifications=N`.

- [ ] **Step 5: Apply to new-prod.**
```bash
set -a; . supabase/.temp/migrate.env; set +a
npx supabase db push --db-url "$NEW_DB_URL" --yes
```

- [ ] **Step 6: Commit** (HEREDOC, both trailers): `feat(db): rpc_request_warehouse_item persists a request row + actionable notification`.

---

## Task 3: DB — `rpc_resolve_item_request`

**Files:**
- Create: `supabase/migrations/20260821000200_rpc_resolve_item_request.sql` (+ staging mirror)

**Interfaces:**
- Consumes: `warehouse_item_requests` (Task 1).
- Produces: `public.rpc_resolve_item_request(p_request_id uuid, p_status text, p_note text default null) returns void` — sets status/resolved_by/resolved_at/resolution_note (only from `pending`), clears related `item_request` notifications; RP-of-warehouse / super-viewer / admin only.

- [ ] **Step 1: Write the migration** (both files):
```sql
create or replace function public.rpc_resolve_item_request(
  p_request_id uuid,
  p_status     text,
  p_note       text default null
) returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid   uuid    := public._current_user_data_id();
  v_wh    uuid;
  v_is_rp boolean;
  v_super boolean := (auth.jwt() ->> 'user_type') in ('owner','accountant');
  v_admin boolean := public._auth_user_has_permission('system.admin');
begin
  if v_uid is null then raise exception 'You need to be signed in.'; end if;
  if p_status not in ('fulfilled','dismissed') then raise exception 'Invalid status: %', p_status; end if;

  select warehouse_id into v_wh from public.warehouse_item_requests where id = p_request_id;
  if v_wh is null then raise exception 'Request not found.'; end if;

  select exists (
    select 1 from public.warehouse_responsible_persons
    where warehouse_id = v_wh and profile_id = v_uid
  ) into v_is_rp;

  if not (v_is_rp or v_super or v_admin) then
    raise exception 'You are not allowed to resolve this request.';
  end if;

  update public.warehouse_item_requests
     set status = p_status, resolved_by = v_uid, resolved_at = now(),
         resolution_note = nullif(btrim(coalesce(p_note,'')), '')
   where id = p_request_id and status = 'pending';

  update public.notifications
     set actioned_at = now(), read_at = coalesce(read_at, now())
   where related_type = 'item_request' and related_id = p_request_id and actioned_at is null;
end;
$function$;

grant execute on function public.rpc_resolve_item_request(uuid, text, text) to authenticated, service_role;
```

- [ ] **Step 2: Apply to staging.** `npx supabase db push --yes`.

- [ ] **Step 3: Prove both paths** (rolled-back): resolve as the warehouse RP → row `status='fulfilled'` + its notifications `actioned_at` set; resolve as a non-RP non-admin → raises `not allowed`. Expected: `PROBE_OK resolve_as_rp` + `PROBE_OK non_rp_blocked`.

- [ ] **Step 4: Apply to new-prod** (`--db-url "$NEW_DB_URL"`).

- [ ] **Step 5: Commit:** `feat(db): rpc_resolve_item_request (fulfill/dismiss + clear notifications)`.

---

## Task 4: DB + catalog — `warehouse.item_requests` permissions

**Files:**
- Create: `supabase/migrations/20260821000300_warehouse_item_requests_permissions.sql` (+ staging mirror)
- Modify: `src/lib/permissions.ts` (Warehouse group)
- Modify: `src/lib/permissions.test.ts`

**Interfaces:**
- Produces: permission keys `warehouse.item_requests.view`, `warehouse.item_requests.manage`, granted to every role holding `warehouse.access`.

- [ ] **Step 1: Confirm the roles table shape.** Run:
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_name='custom_roles' and column_name in ('permissions','deleted_at');"
```
Expected: `permissions` present; note whether `deleted_at` exists (guard the backfill accordingly — mirror `20260819470000_reports_finer_permissions_backfill.sql`).

- [ ] **Step 2: Write the backfill migration** (both files; adjust the `deleted_at` guard to match Step 1):
```sql
-- Grant the two Requested-Items keys to every role that can already reach the
-- warehouse module. Idempotent (NOT-ANY guard); owner/system-admin bypass anyway.
update public.custom_roles
   set permissions = array(
         select distinct e from unnest(
           permissions || array['warehouse.item_requests.view','warehouse.item_requests.manage']
         ) e
       )
 where 'warehouse.access' = any(permissions)
   and not (permissions @> array['warehouse.item_requests.view','warehouse.item_requests.manage']);
```

- [ ] **Step 3: Add the keys to the catalog.** In `src/lib/permissions.ts`, add to the Warehouse `PERMISSION_GROUPS` entry (match the existing key/label shape):
```ts
{ key: 'warehouse.item_requests.view',   label: 'View item requests' },
{ key: 'warehouse.item_requests.manage', label: 'Resolve item requests' },
```
Ensure the Warehouse group is in `BRANCH_ENABLED_MODULES` (it already is: `warehouse`).

- [ ] **Step 4: Add a test.** In `src/lib/permissions.test.ts`, assert both keys are present in the active catalog:
```ts
it('exposes the warehouse item-request permissions', () => {
  const keys = ACTIVE_PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key))
  expect(keys).toContain('warehouse.item_requests.view')
  expect(keys).toContain('warehouse.item_requests.manage')
})
```

- [ ] **Step 5: Run the test.** `npx vitest run src/lib/permissions.test.ts` (or the project's runner). Expected: PASS.

- [ ] **Step 6: Apply the migration to staging + new-prod; verify** a report-capable warehouse role now holds both keys. Then **commit** (migration + catalog + test): `feat(perms): warehouse.item_requests view/manage + backfill`.

---

## Task 5: Frontend — types + data hooks

**Files:**
- Regenerate: `src/types/database.types.ts` (+ re-append the 4 helper aliases)
- Create: `src/hooks/useWarehouseItemRequests.ts`
- Modify: `src/hooks/useCustodyMoves.ts:229-248`

**Interfaces:**
- Consumes: `warehouse_item_requests` table + both RPCs.
- Produces: `useWarehouseItemRequests(filters: { status?: 'pending'|'fulfilled'|'dismissed'|'all'; warehouseIds?: string[] })` → `WarehouseItemRequest[]`; `useResolveItemRequest()` → mutation `({ id: string; status: 'fulfilled'|'dismissed'; note?: string })`; `useRequestWarehouseItem()` now returns the new request `id` (uuid string).

- [ ] **Step 1: Regenerate types** (after Tasks 1-4 are applied):
```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```
Then re-append the four `DBTable`/`DBInsert`/`DBUpdate`/`AllTables` helper aliases (copy from git history of the file). Run `npx tsc --noEmit` → clean.

- [ ] **Step 2: Write the list + resolve hooks** in `src/hooks/useWarehouseItemRequests.ts`:
```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseItemRequest = {
  id: string; warehouse_id: string; requested_by: string | null; requester_name: string | null
  dest_sub_container_id: string | null; dest_name: string | null; item_name: string; qty: number
  notes: string | null; status: 'pending' | 'fulfilled' | 'dismissed'
  resolved_by: string | null; resolved_at: string | null; resolution_note: string | null; created_at: string
}
type Filters = { status?: WarehouseItemRequest['status'] | 'all'; warehouseIds?: string[] }

function asError(e: { code?: string; message?: string; details?: string; hint?: string } | null, fallback: string) {
  if (!e) return new Error(fallback)
  return new Error([e.code, e.message, e.details, e.hint].filter(Boolean).join(' — ') || fallback)
}

export function useWarehouseItemRequests(filters: Filters = {}) {
  return useQuery({
    queryKey: queryKeys.warehouseItemRequests.list(filters),
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase.from('warehouse_item_requests').select('*')
        .order('created_at', { ascending: false }).limit(300)
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.warehouseIds?.length) q = q.in('warehouse_id', filters.warehouseIds)
      const { data, error } = await q
      if (error) throw asError(error, 'Failed to load item requests')
      return (data ?? []) as WarehouseItemRequest[]
    },
  })
}

export function useResolveItemRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: 'fulfilled' | 'dismissed'; note?: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_resolve_item_request', {
        p_request_id: v.id, p_status: v.status, p_note: v.note ?? null,
      })
      if (error) throw asError(error, 'Failed to resolve the request')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseItemRequests.all }),
  })
}
```

- [ ] **Step 3: Add the query keys.** In `src/lib/queryKeys.ts` add a `warehouseItemRequests` group (`all`, `list(filters)`), matching the existing key style.

- [ ] **Step 4: Update `useRequestWarehouseItem`** (`useCustodyMoves.ts`): change the cast/return to `Promise<string>` (returns the request id); keep the payload; wrap the error via the same `asError` shape. Invalidate `queryKeys.warehouseItemRequests.all` on success.

- [ ] **Step 5:** `npx tsc --noEmit` → clean. **Commit** after the UI tasks (this hook has no UI yet).

---

## Task 6: Frontend — Requested Items tab + notification route

**Files:**
- Create: `src/components/purchase/wh/WhItemRequestsTab.tsx`
- Modify: `src/app/(dashboard)/master-data/warehouses/page.tsx`
- Modify: `src/lib/notification-routes.ts`

**Interfaces:**
- Consumes: `useWarehouseItemRequests`, `useResolveItemRequest` (Task 5); `useWarehouses` (labels); `useHasPermission`.

- [ ] **Step 1: Read the existing tab wiring.** Open `src/app/(dashboard)/master-data/warehouses/page.tsx` and an existing tab (e.g. `WhTransfersTab`) to copy the tab registration + shell pattern (permission-gated `TabsTrigger`/`TabsContent`, header spacing).

- [ ] **Step 2: Build the tab** `WhItemRequestsTab.tsx`:
  - Filters row: **Warehouse** multi-select (render `warehouse.name`, never id), **Status** select (Pending default / Fulfilled / Dismissed / All), **search** input (client-side filter on `item_name` + `requester_name`).
  - Desktop (`hidden md:block`) table: Item · Qty · Requested by · For (`dest_name ?? '—'`) · Warehouse (name lookup) · Note · Requested (`created_at` formatted) · Status badge · Actions.
  - Mobile (`md:hidden space-y-2`) card list mirroring the columns; action buttons full-width `min-h-11`.
  - Actions on `pending` rows: **Fulfill** and **Dismiss** → `useResolveItemRequest`; optional note via a small prompt/dialog; disable while pending; toast the raw error on failure.
  - Loading + empty states ("No requests").
  - Gate the whole tab body on `useHasPermission('warehouse.item_requests.view')`.

- [ ] **Step 3: Register the tab** in the warehouses page — add a `Requested Items` trigger + content, shown only when `useHasPermission('warehouse.item_requests.view')`.

- [ ] **Step 4: Route the notification.** In `notification-routes.ts` add:
```ts
item_request: { route: '/master-data/warehouses', actionable: true, icon: 'stock' },
```
(Deep-linking to the specific tab is optional; landing on Warehouses is acceptable for v1.)

- [ ] **Step 5:** `npx tsc --noEmit` → clean; lint clean. Hold the commit for the operator smoke (Task 8).

---

## Task 7: Frontend — fold the request into `CustodyAssignDialog`'s submit

**Files:**
- Modify: `src/components/warehouse/custody/CustodyAssignDialog.tsx` (`handleRequestItem`/`canRequestItem` ~L190-205, the primary submit `handleSubmit`, the "Need an item…" section, and `canSubmit`).

- [ ] **Step 1: Remove the standalone "Send request" button** in the "Need an item that isn't stocked here?" section; keep the item-name + qty inputs.

- [ ] **Step 2: Merge into the primary submit.** In the dialog's main submit handler, after (or alongside) the custody-assign path, if `itemReqName.trim()` and `parseInt(itemReqQty,10) > 0`, `await requestItem.mutateAsync({ warehouse_id: fromWhId, item_name: itemReqName.trim(), qty: parseInt(itemReqQty,10), dest_sub_container_id: destSubId, notes: notes.trim() || null })`. Both the assign and the item-request may run in one submit; build one combined success toast reflecting what was sent (e.g. "Request sent · item-needed recorded").

- [ ] **Step 3: Update validation.** The primary submit is enabled when **either** a valid custody-assign (existing rule) **or** a valid item-needed (`fromWhId` + name + qty>0) is present. Keep the existing per-path guards inside the handler.

- [ ] **Step 4:** `npx tsc --noEmit` → clean. Hold the commit for Task 8.

---

## Task 8: Flow registry + verification + docs + operator smoke

**Files:**
- Modify: `docs/flows-registry.md`
- Modify: `PROGRESS.md`, `EOD/EOD-2026-08-13.md`

- [ ] **Step 1: Add the flow-registry entry** — Module: Warehouse/Operations; Trigger: CustodyAssignDialog item-needed submit; Primary hook: `useRequestWarehouseItem` / `useResolveItemRequest`; RPCs: `rpc_request_warehouse_item`, `rpc_resolve_item_request`; Ledger writes: none (notifications only); Component: `WhItemRequestsTab`; Guards: RP/super-viewer/admin (RLS + resolve RPC); Related: `[[Custody assign]]`.

- [ ] **Step 2: Final silent verification.** `npx tsc --noEmit` clean; `npx supabase db push --dry-run` (staging) + `--db-url "$NEW_DB_URL" --dry-run` (new-prod) both report up-to-date; `\df` shows single overloads of both RPCs; grep confirms no caller still expects the old integer return from `rpc_request_warehouse_item`.

- [ ] **Step 3: Build the operator test matrix (Excel).** Using the `anthropic-skills:xlsx` skill, create `docs/plans/2026-08-13-warehouse-item-requests/test-matrix.xlsx` — one row per case, columns: **# · Area · Steps · Expected · Result (Pass/Fail) · Notes** (Result left blank for the operator; freeze the header row, autofilter, sensible column widths). Cases:
  1. Custody dialog — submit an item-needed only → success toast + request recorded.
  2. Custody dialog — submit an in-stock assign only → works exactly as before.
  3. Custody dialog — submit both together → the assign **and** the item request both happen.
  4. Requested Items tab — as the warehouse RP the request appears; the bell notification is actionable and opens Warehouses.
  5. Filters — Warehouse / Status / search each narrow the list correctly (Warehouse shows names, not ids).
  6. Fulfill → row leaves Pending; related bell notifications auto-complete for every RP.
  7. Dismiss → row leaves Pending; related bell notifications auto-complete.
  8. Permission/scope — a non-RP without `warehouse.item_requests.view` doesn't see the tab; RLS hides other warehouses' rows.
  9. Responsive — mobile card layout + ≥44px actions; page never scrolls sideways.

  Deliver the Excel to the operator (`SendUserFile`) and wait for their Pass/Fail before committing the frontend.

- [ ] **Step 4: On operator "working" — commit the frontend** (hooks + tab + dialog + notification route + flow registry) in coherent commits (HEREDOC, both trailers). Then update `PROGRESS.md` (move to Completed; add a `## 🔒 Security Audit Log` row) + `EOD` in a separate docs commit. Optionally push the branch / open the merge decision.

## Self-Review

- **Spec coverage:** persist table (T1) · RPC rewrite persist+notify (T2) · resolve RPC (T3) · permissions (T4) · data hooks + return-type change (T5) · RP-scoped tab + filters + resolve + notification route (T6) · dialog merge / button removal (T7) · flow registry + smoke (T8). Phase 2 (notification classification/routing) intentionally deferred to its own plan. ✅ all Phase-1 spec sections mapped.
- **Placeholder scan:** none — every SQL body and hook is spelled out; the two spots that require live confirmation (helper names in T1/T4) are explicit verification steps, not TODOs.
- **Type consistency:** `rpc_request_warehouse_item` → `uuid` (T2) matches the hook return (T5) and the dialog (T7); `rpc_resolve_item_request(uuid,text,text)` signature matches `useResolveItemRequest` (T5) and the tab actions (T6); `WarehouseItemRequest` fields match the T1 table columns.
