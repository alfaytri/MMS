# Picture Transfer (v2) — Implementation Plan

> **For agentic workers:** Execute task-by-task. Each task ends with an independently verifiable deliverable and uses checkbox (`- [ ]`) steps. Source of truth: [design.md](../../superpowers/specs/2026-08-17-picture-transfer/design.md) (approved 2026-08-17) + [mockup.html](../../superpowers/specs/2026-08-17-picture-transfer/mockup.html) (exact visual markup — reuse its class structure).

**Goal:** A picture-first, permission-gated transfer surface for a low-literacy warehouse worker — tap a photo, tap a quantity, tap a Team/Van/Project — that Sends (creates a pending transfer) and Receives, writing through the existing `create_transfer_v2` / `receive_transfer` RPCs.

**Architecture:** A new dedicated route (`/warehouse/picture-transfer`) gated by a new permission `warehouse.transfer.simple`, rendering a full-screen Send/Receive UI. Source warehouse is derived from `warehouse_responsible_persons` (never chosen). Destinations are custody locations only, reusing the consumption Type→Division→pick cascade rendered as tiles. Two small SECURITY DEFINER read RPCs (`get_my_responsible_warehouses`, `get_often_moved_variants`) are the only new backend; the classic `WhTransferDialog` / `WhTransfersTab` are untouched (coexistence via permission).

**Tech Stack:** Next.js 15 App Router + TypeScript, TanStack Query v5, Supabase Postgres (RLS + SECURITY DEFINER RPCs), Base UI + Tailwind. No new dependencies for P1/P2 (barcode decoder is P3 only).

## Global Constraints

- **Migrations:** author in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, apply to **staging** (`mwvblpgbgxipvrevkeff`) with `npx supabase db push`, and **mirror the identical file into `supabase/migrations-staging/`** in the same commit. Apply to **new-prod** (`optishfnnctrhffpoywg`) with `npx supabase db query --linked` ONLY (never `db push`) at ship time, wrapped in the guarded link→verify→apply→re-link flow; never store the new-prod password.
- **Fetch live function bodies with `pg_get_functiondef` before ANY `CREATE OR REPLACE` and before assuming a caller's authorization** (baseline SQL + `database.types.ts` are stale — only `db query --linked` is authoritative). **Prove every write/read path with a rolled-back `DO $$ … $$` probe** before claiming done.
- **New SECURITY DEFINER RPCs:** `SET search_path TO 'public'`; `REVOKE ALL ON FUNCTION … FROM public;` then `GRANT EXECUTE … TO authenticated, service_role;` (no anon).
- **Every Supabase `.select(...)` carries `.limit(N)`**; prefer explicit columns over `select('*')` for list reads (Supabase budget rule).
- **`tsc --noEmit` + `eslint` clean after every code task. NEVER run `next build`** unless the operator asks.
- **Dropdown/label rules:** human-readable labels only, never raw UUIDs; hierarchical choices side-by-side (here: tiles); fixed heights for layout stability; when exactly one option exists, pre-select it (auto), don't force a pick.
- **Touch/responsive:** every tap target ≥ 44px (this UI targets ~72–88px); responsive across the 4 breakpoints; no layout shift on selection (steppers/tiles reserve height).
- **Commits:** one logical change each; **commit only after the operator confirms the golden-path smoke works** (project commit policy). HEREDOC message with BOTH trailers:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Flow registry:** add/adjust entries in `docs/flows-registry.md` in the same commit as the code that ships each flow.
- **PROGRESS.md + EOD** updated per the mandatory protocols after each task. Do not commit the untracked `docs/inventory-reorg/reorg_apply.py` or `skill-observations/` (not ours).

## File Structure

**New migrations** (each mirrored into `supabase/migrations-staging/`):
- `…_rpc_get_my_responsible_warehouses.sql` — warehouses the caller is RP of (Task 3).
- `…_rpc_get_often_moved_variants.sql` — top transferred variants from a warehouse (Task 5).

**New route + components** (all under `src/components/warehouse/picture-transfer/`):
- `src/app/(dashboard)/warehouse/picture-transfer/page.tsx` — route shell, permission gate, Send/Receive mode switch.
- `PictureTransferHome.tsx` — the two big mode buttons (mockup screen 1).
- `PictureSendFlow.tsx` — owns cart + step state; orchestrates Find → Where → Confirm.
- `PictureItemFind.tsx` — search + ⭐ often-moved + 🗂️ groups + in-group grid + stepper (screens 2–3).
- `PictureWhere.tsx` — custody Type→Division→pick tiles (screen 4).
- `PictureConfirm.tsx` — confirm cards + SEND (screen 5).
- `PictureReceive.tsx` — incoming list + Receive (screen 6) [P2].
- `PicturePhoto.tsx` — big photo with strong fallback (initials + icon + tint).
- `QtyStepper.tsx` — big `− N +` stepper.

**New hooks:**
- `src/hooks/useMyResponsibleWarehouses.ts` (Task 3), `src/hooks/useOftenMovedVariants.ts` (Task 5), `src/hooks/useVariantImages.ts` (Task 10, P2).

**Modified:** `src/components/master-data/PermissionTree.tsx` (perm key, Task 2), `src/components/layout/nav-config.ts` (nav entry, Task 2), `docs/flows-registry.md` (Tasks 9, 12).

**Reused unchanged:** `useWarehouseStock`, `useCreateTransfer`, `useReceiveTransfer`, `useWarehouseTransfers` (`useWarehouseOperations.ts`); `useCustodyLocations` (`useCustodyLocations.ts`); `useWarehouseSubContainers`; `useHasPermission`, `useCurrentUserProfile`.

---

# Task 1 — Verify RPC authorization + lock the simple role's permission set (no code)

**Why first:** The whole design hinges on the Picture worker's `warehouse.transfer.simple` role being *allowed* to call `create_transfer_v2` and `receive_transfer`. If those RPCs internally require `warehouse.transfer.create` / `warehouse.transfer.receive` (or a specific role), the simple role must also carry them. Decide this before building any UI.

- [ ] **Step 1 — Dump the live authorization bodies** (staging, linked):
  ```bash
  npx supabase db query --linked "select pg_get_functiondef('public.create_transfer_v2'::regproc);"
  npx supabase db query --linked "select pg_get_functiondef('public.receive_transfer'::regproc);"
  ```
  Read each body: does it call `_user_has_permission(...)` / check a permission key / check `warehouse_responsible_persons` membership / rely only on table RLS?
- [ ] **Step 2 — Check RLS on `warehouse_responsible_persons`** (decides whether Task 3 needs an RPC or a direct select):
  ```bash
  npx supabase db query --linked "select polname, cmd, qual from pg_policies where tablename='warehouse_responsible_persons';"
  ```
- [ ] **Step 3 — Record the decision** in PROGRESS.md and at the top of this plan's Task 2:
  - If the RPCs gate on **RP membership** → the simple role needs only `warehouse.transfer.simple` (he is the RP). 
  - If they gate on a **permission key** → the simple role bundles `warehouse.transfer.simple` **+** `warehouse.transfer.create` (Send) **+** `warehouse.transfer.receive` (Receive). Note this exact set; the operator grants it when creating the role.
- [ ] **Step 4 — No commit** (investigation only; the finding is written into PROGRESS + Task 2/8/10 notes).

---

# PHASE 1 — SEND (headline value)

*A worker with `warehouse.transfer.simple` gets a full-screen page that lets him pick items from his warehouse by photo and send a pending transfer to a Team/Van/Project. Receive + scan come in P2/P3.*

## Task 2 — Permission key, nav entry, route shell + Home

**Files:**
- Modify: `src/components/master-data/PermissionTree.tsx:104-114` (add PermEntry to the `md-wh-transfers` node).
- Modify: `src/components/layout/nav-config.ts:23` (add a top-level NavEntry).
- Create: `src/app/(dashboard)/warehouse/picture-transfer/page.tsx`.
- Create: `src/components/warehouse/picture-transfer/PictureTransferHome.tsx`.

**Interfaces — Produces:** permission key `'warehouse.transfer.simple'`; route `/warehouse/picture-transfer`; `PictureTransferHome({ mode, onMode, receiveCount })` where `mode: 'send' | 'receive'`.

- [ ] **Step 1 — Add the permission key.** In `PermissionTree.tsx`, append to the `md-wh-transfers` node's `permissions` array:
  ```ts
  { key: 'warehouse.transfer.simple', label: 'Picture Transfer (simple)', description: 'Use the picture-first Transfer page (send + receive) instead of the classic transfers surface. For low-literacy warehouse staff.' },
  ```
- [ ] **Step 2 — Add the nav entry.** In `nav-config.ts`, add a top-level `NavEntry` after Operations:
  ```ts
  {
    label: 'Transfer',
    icon: 'ArrowRightLeft',
    permission: 'warehouse.transfer.simple',
    groups: [
      { items: [
        { label: 'Picture Transfer', href: '/warehouse/picture-transfer', icon: 'ArrowRightLeft', permission: 'warehouse.transfer.simple' },
      ] },
    ],
  },
  ```
  Confirm `'ArrowRightLeft'` is in the nav icon map used by `TopNav`/`MobileNavDrawer` (it is used elsewhere, e.g. warehouses tab). If the icon map is a fixed record, add `ArrowRightLeft` to it.
- [ ] **Step 3 — Route shell + gate.** `page.tsx` (client): read `useHasPermission('warehouse.transfer.simple')`; if false, render a neutral "You don't have access to Picture Transfer" panel (no redirect loop). If true, hold `const [mode, setMode] = useState<'send'|'receive'>('send')` and render `PictureTransferHome` when no sub-flow is active. Full-screen: `className="flex flex-col h-[100dvh]"`.
  ```tsx
  'use client'
  import { useState } from 'react'
  import { useHasPermission } from '@/hooks/usePermissions'
  import { PictureTransferHome } from '@/components/warehouse/picture-transfer/PictureTransferHome'
  // P2 adds PictureReceive; P1 shows a "Receive — coming soon" placeholder button state.
  export default function PictureTransferPage() {
    const canUse = useHasPermission('warehouse.transfer.simple')
    const [mode, setMode] = useState<'send' | 'receive'>('send')
    if (!canUse) return <div className="grid place-items-center h-[60vh] text-muted-foreground text-sm">You don’t have access to Picture Transfer.</div>
    return (
      <div className="flex flex-col h-[100dvh] bg-background">
        <PictureTransferHome mode={mode} onMode={setMode} receiveCount={0} />
      </div>
    )
  }
  ```
- [ ] **Step 4 — `PictureTransferHome`.** Two big mode buttons per mockup screen 1 (reuse `.mode.send` / `.mode.recv` visual — big icon, big label, sub-line; red count badge on Receive). Buttons ≥ 88px tall, full width, `rounded-3xl`. In P1, Receive shows "Coming soon" and is disabled; Send routes into the flow (wired in Task 8 — for now it can render a stub "Send" panel).
- [ ] **Step 5 — `tsc --noEmit` + `eslint` clean.**
- [ ] **Step 6 — Operator smoke (needs login + a test role):** create a role holding ONLY `warehouse.transfer.simple` (+ the create/receive keys if Task 1 found they're needed), assign to a test user → that user sees exactly one nav entry "Transfer", lands on the Home screen, and a user WITHOUT the permission sees neither the nav entry nor the page. Classic Warehouses → Transfers is unchanged for existing roles.
- [ ] **Step 7 — Commit** after operator confirms (perm key + nav + route shell + Home).

## Task 3 — `get_my_responsible_warehouses` RPC + hook + source resolution

**Files:**
- Create: `supabase/migrations/…_rpc_get_my_responsible_warehouses.sql` (+ mirror).
- Create: `src/hooks/useMyResponsibleWarehouses.ts`.
- Modify: `src/app/(dashboard)/warehouse/picture-transfer/page.tsx` (resolve source, pass down).

**Interfaces — Produces:** `useMyResponsibleWarehouses()` → `{ id: string; name: string; warehouse_kind: string }[]`; a resolved `{ warehouseId, subContainerId }` source passed into the Send flow.

- [ ] **Step 1 — Migration** (adapt to the Task 1 finding — this version resolves the caller's profile id the same way the codebase does elsewhere; confirm the helper name via `pg_get_functiondef` of a known RPC first):
  ```sql
  -- …_rpc_get_my_responsible_warehouses.sql
  BEGIN;
  CREATE OR REPLACE FUNCTION public.get_my_responsible_warehouses()
  RETURNS TABLE (id uuid, name text, warehouse_kind text)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT w.id, w.name, w.warehouse_kind
    FROM public.warehouse_responsible_persons wrp
    JOIN public.warehouses w ON w.id = wrp.warehouse_id
    WHERE wrp.profile_id = public._current_user_data_id()   -- verify this helper name in Step 0
      AND COALESCE(w.is_virtual, false) = false
    ORDER BY w.name;
  $$;
  REVOKE ALL ON FUNCTION public.get_my_responsible_warehouses() FROM public;
  GRANT EXECUTE ON FUNCTION public.get_my_responsible_warehouses() TO authenticated, service_role;
  NOTIFY pgrst, 'reload schema';
  COMMIT;
  ```
  > **Step 0 (before writing):** confirm the current-user helper (`_current_user_data_id()` vs `auth.uid()`→`user_data` lookup) by dumping an existing SECURITY DEFINER RPC that resolves the caller (e.g. one of the damaged-stock RPCs). Use whatever the codebase actually uses.
- [ ] **Step 2 — Apply + mirror.** `npx supabase db push`; copy the file verbatim into `supabase/migrations-staging/`. Confirm single overload + `prosecdef=true`: `select count(*), bool_and(prosecdef) from pg_proc where proname='get_my_responsible_warehouses';`.
- [ ] **Step 3 — Rolled-back probe** (as a known RP user's claims, forged in-txn): set `request.jwt.claims` to a profile that IS an RP of ≥1 warehouse, call the fn, assert it returns exactly that user's warehouses; then a profile with none → 0 rows. `RAISE EXCEPTION 'probe'` to unwind.
- [ ] **Step 4 — Hook** `useMyResponsibleWarehouses.ts`:
  ```ts
  import { useQuery } from '@tanstack/react-query'
  import { createClient } from '@/lib/supabase/client'
  export type MyWarehouse = { id: string; name: string; warehouse_kind: string }
  export function useMyResponsibleWarehouses() {
    return useQuery({
      queryKey: ['my-responsible-warehouses'],
      staleTime: 5 * 60 * 1000,
      queryFn: async (): Promise<MyWarehouse[]> => {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('get_my_responsible_warehouses' as never)
        if (error) throw new Error(error.message)
        return (data ?? []) as MyWarehouse[]
      },
    })
  }
  ```
- [ ] **Step 5 — Source resolution in `page.tsx`:** `const { data: myWhs = [], isLoading } = useMyResponsibleWarehouses()`. If `isLoading` → skeleton. If `myWhs.length === 0` → friendly "You're not assigned to a warehouse yet — ask an admin." If `=== 1` → that warehouse; if `> 1` → a big warehouse-tile chooser (reuse `.type`/tile styles) storing `selectedWarehouseId`. Then resolve the source sub-container via `useWarehouseSubContainers(selectedWarehouseId)`: exactly one active → auto; else a big-tile "area" pick (Open confirm #2 — default to the area pick until the operator narrows the rule). Pass `{ warehouseId, subContainerId }` down.
- [ ] **Step 6 — `tsc` + `eslint` clean. Commit** after operator confirms his warehouse resolves (single → auto; if he has one warehouse with one sub, he sees no source controls at all).

## Task 4 — `PicturePhoto` + `QtyStepper` primitives

**Files:** Create `src/components/warehouse/picture-transfer/PicturePhoto.tsx`, `QtyStepper.tsx`.

**Interfaces — Produces:** `PicturePhoto({ url, name, size?, className? })`; `QtyStepper({ value, min?, max?, onChange })`.

- [ ] **Step 1 — `PicturePhoto`.** Renders `<img>` when `url` is non-null (object-cover, rounded); otherwise the fallback: tinted square + big initials (first two letters of `name`, uppercased) + a small 📦 corner glyph. Never a blank box. Mirror the mockup `.photo` / `.photo.fallback` classes.
  ```tsx
  export function PicturePhoto({ url, name, size = 96, className = '' }: { url: string | null; name: string; size?: number; className?: string }) {
    const initials = name.replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?'
    return (
      <div className={`relative grid place-items-center rounded-2xl overflow-hidden bg-muted ${className}`} style={{ width: size, height: size }}>
        {url ? <img src={url} alt={name} className="w-full h-full object-cover" loading="lazy" />
             : (<><span className="font-extrabold text-muted-foreground" style={{ fontSize: size*0.28 }}>{initials}</span>
                  <span className="absolute bottom-1 right-1 opacity-50 text-sm">📦</span></>)}
      </div>
    )
  }
  ```
- [ ] **Step 2 — `QtyStepper`.** Big `−`/`+` buttons (≥44px) + large number; clamps to `[min ?? 1, max ?? Infinity]`; `onChange(next)`. Layout-stable (fixed height). Mirror mockup `.stepper`.
- [ ] **Step 3 — `tsc` + `eslint` clean. Commit** (primitives; no operator smoke needed — exercised in Task 6).

## Task 5 — `get_often_moved_variants` RPC + hook

**Files:** Create `supabase/migrations/…_rpc_get_often_moved_variants.sql` (+ mirror); `src/hooks/useOftenMovedVariants.ts`.

**Interfaces — Produces:** `useOftenMovedVariants(fromWarehouseId, limit?)` → `{ brand_variant_id: string; move_count: number }[]`.

- [ ] **Step 1 — Confirm the transfer-items table + FK columns first:** `npx supabase db query --linked "select column_name from information_schema.columns where table_name='warehouse_transfer_items';"` and the header table `warehouse_transfers(from_warehouse_id, created_at, status)`. Adjust the SQL below to the real column names.
- [ ] **Step 2 — Migration:**
  ```sql
  -- …_rpc_get_often_moved_variants.sql
  BEGIN;
  CREATE OR REPLACE FUNCTION public.get_often_moved_variants(
    p_from_warehouse_id uuid,
    p_limit int DEFAULT 8
  )
  RETURNS TABLE (brand_variant_id uuid, move_count bigint)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT ti.brand_variant_id, count(*) AS move_count
    FROM public.warehouse_transfers t
    JOIN public.warehouse_transfer_items ti ON ti.transfer_id = t.id
    WHERE t.from_warehouse_id = p_from_warehouse_id
      AND t.created_at >= (now() - interval '90 days')
      AND EXISTS (                                   -- caller must be RP of that warehouse
        SELECT 1 FROM public.warehouse_responsible_persons wrp
        WHERE wrp.warehouse_id = p_from_warehouse_id
          AND wrp.profile_id = public._current_user_data_id())
    GROUP BY ti.brand_variant_id
    ORDER BY move_count DESC, ti.brand_variant_id
    LIMIT GREATEST(p_limit, 1);
  $$;
  REVOKE ALL ON FUNCTION public.get_often_moved_variants(uuid, int) FROM public;
  GRANT EXECUTE ON FUNCTION public.get_often_moved_variants(uuid, int) TO authenticated, service_role;
  NOTIFY pgrst, 'reload schema';
  COMMIT;
  ```
- [ ] **Step 3 — Apply + mirror. Rolled-back probe:** as an RP of a warehouse with transfer history → returns ranked variants; as a non-RP → 0 rows (the EXISTS guard). Confirm single overload + `prosecdef`.
- [ ] **Step 4 — Hook** `useOftenMovedVariants.ts` (enabled only when `fromWarehouseId` set; `.rpc('get_often_moved_variants' as never, { p_from_warehouse_id, p_limit } as never)`).
- [ ] **Step 5 — `tsc` + `eslint` clean. Commit.**

## Task 6 — `PictureItemFind` (search + often-moved + groups + grid + stepper)

**Files:** Create `src/components/warehouse/picture-transfer/PictureItemFind.tsx`.

**Interfaces — Consumes:** source `{ warehouseId, subContainerId }`; `useWarehouseStock(warehouseId, subContainerId)` → `WarehouseStockItem[]`; `useOftenMovedVariants(warehouseId)`; `PicturePhoto`, `QtyStepper`. **Produces:** `PictureItemFind({ source, cart, onCartChange })` where `cart: Map<brand_variant_id, { qty, item: WarehouseStockItem }>`.

- [ ] **Step 1 — Load + shape stock.** `const { data: stock = [] } = useWarehouseStock(source.warehouseId, source.subContainerId)`. Keep only `available_qty > 0`. Build `groups = Map<category_name, WarehouseStockItem[]>` (fallback bucket `'Other'` when `category_name` null). Build `oftenItems` = the `useOftenMovedVariants` ids intersected with `stock` rows (preserve rank order).
- [ ] **Step 2 — View state.** `const [view, setView] = useState<{ kind:'browse' } | { kind:'group', name:string } | { kind:'search', q:string }>({kind:'browse'})`. Browse shows the search bar + ⭐ often strip + 🗂️ group tiles (mockup screen 2). A group or a non-empty search shows the grid (screen 3) with a "‹ All groups" crumb.
- [ ] **Step 3 — Search filter (text).** On query, filter `stock` by `item_name` OR `sku` (case-insensitive `includes`); render matches as the grid. (📷 scan button rendered but inert until P3 — `title="Scan (coming soon)"`, disabled.)
- [ ] **Step 4 — Grid + selection.** Each card = `PicturePhoto` + name + `available_qty` pill. Tapping toggles cart membership; a selected card shows `QtyStepper` (min 1, max `available_qty`) writing `onCartChange`. Reuse mockup `.grid`/`.card`/`.card.sel` markup. Fallback photo handled by `PicturePhoto`.
- [ ] **Step 5 — Often strip + groups** per mockup (`.often` horizontal scroll; `.groups` 2-col tiles). Tapping an often chip adds to cart at qty 1 (then adjustable in Confirm or on re-tap). Tapping a group → `setView({kind:'group', name})`.
- [ ] **Step 6 — `tsc` + `eslint` clean. Commit** (no isolated smoke — exercised end-to-end in Task 8).

## Task 7 — `PictureWhere` (custody Type → Division → pick, as tiles)

**Files:** Create `src/components/warehouse/picture-transfer/PictureWhere.tsx`.

**Interfaces — Consumes:** `useCustodyLocations()` → `CustodyLocationRow[]`. **Produces:** `PictureWhere({ value, onChange })` where `value: { toWarehouseId, toSubContainerId, label } | null`.

- [ ] **Step 1 — Cascade state** mirroring `NewConsumptionDialog`'s custody logic, but as tiles: `custodyWhId` (Type = custody warehouse) → `custodyDivId` (only when the chosen warehouse's locations span 2+ distinct `division_id`) → the location `id`. Auto-select when exactly one option at a level (Global Constraint: single option pre-selected).
  ```ts
  const { data: locations = [] } = useCustodyLocations()
  const active = locations.filter(l => l.is_active)
  const types = uniqueBy(active, l => l.warehouse_id).map(l => ({ id: l.warehouse_id, name: l.warehouse_name }))
  const divisions = uniqueBy(active.filter(l => l.warehouse_id === custodyWhId), l => l.division_id ?? '__nodiv__')
  const needsDivisionStep = divisions.length > 1
  const locsForSel = active.filter(l => l.warehouse_id === custodyWhId && (!needsDivisionStep || (l.division_id ?? '__nodiv__') === custodyDivId))
  ```
- [ ] **Step 2 — Tiles.** Type row (icons 👷/🚐/🏗️ — map by warehouse name/kind, default a generic icon), Division row (only when `needsDivisionStep`), then location tiles (mockup `.types` / `.dests`). Selecting a location calls `onChange({ toWarehouseId: l.warehouse_id, toSubContainerId: l.id, label: l.name })`. Labels are human-readable (`l.name`), never UUIDs.
- [ ] **Step 3 — `tsc` + `eslint` clean. Commit.**

## Task 8 — `PictureConfirm` + `PictureSendFlow` → `create_transfer_v2`

**Files:** Create `PictureConfirm.tsx`, `PictureSendFlow.tsx`; modify `page.tsx` (render the flow when `mode==='send'`).

**Interfaces — Consumes:** `useCreateTransfer()`; `useCurrentUserProfile()`; cart from Task 6; destination from Task 7. **Produces:** the wired Send golden path.

- [ ] **Step 1 — `PictureSendFlow`** holds `cart` + `dest` + `step: 'find'|'where'|'confirm'` and a step header (dots + back). `find` → `PictureItemFind`; `where` → `PictureWhere`; `confirm` → `PictureConfirm`. Next is enabled only when the step is satisfied (cart non-empty / dest chosen).
- [ ] **Step 2 — `PictureConfirm`** renders one card per cart line — `PicturePhoto` + name + `→ {dest.label}` chip + big qty (mockup `.cfm`). One giant `✓ SEND` (green, ≥64px).
- [ ] **Step 3 — Submit.** On SEND, build the payload from cart + dest and call `useCreateTransfer`:
  ```ts
  await createTransfer.mutateAsync({
    from_warehouse_id: source.warehouseId,
    to_warehouse_id: dest.toWarehouseId,
    from_sub_container_id: source.subContainerId,
    to_sub_container_id: dest.toSubContainerId,
    date: new Date().toISOString().split('T')[0],
    items: [...cart.values()].map(({ qty, item }) => ({
      brand_variant_id: item.brand_variant_id,
      item_name: item.item_name,
      sku: item.sku ?? null,
      qty,
      unit_cost: item.avg_cost ?? 0,      // same source as the classic dialog
    })),
    notes: null,
    created_by_profile_id: currentProfile?.id ?? null,
    created_by_name: currentProfile?.full_name ?? null,
  })
  ```
  On success: a big "Sent ✓" confirmation, reset cart+dest, back to Home. Surface the raw DB error message on failure (per the surface-raw-db-errors rule) — never a generic "Failed".
- [ ] **Step 4 — Wire Home → flow.** Home's SEND button sets an internal `started` flag rendering `PictureSendFlow`; its top-left back returns to Home.
- [ ] **Step 5 — `tsc` + `eslint` clean.**
- [ ] **Step 6 — Operator smoke (golden path, needs login):** as the simple-role worker on his warehouse — pick 2 items (one via ⭐ often, one via a group), set quantities, choose Team 1, SEND → a transfer is created with `status='pending'`, `from` = his warehouse/sub, `to` = the custody warehouse/sub, correct items+qty; it appears on the classic Transfers tab as pending; the source dispatch RP gets the `transfer_pending` notification (unchanged). Verify a fallback (no-photo) item is selectable and sends correctly. Verify no layout shift when selecting/adjusting.
- [ ] **Step 7 — Commit** after operator confirms.

## Task 9 — P1 verification, security checklist, flow registry, ship

- [ ] **Security checklist** row in `PROGRESS.md` `## 🔒 Security Audit Log`: Secrets (none); RLS (both new RPCs SECURITY DEFINER `SET search_path`, `revoke … from public`, RP-guarded; no new table); Auth gate (route + nav gated by `warehouse.transfer.simple`; `create_transfer_v2` authorization confirmed in Task 1); Error handling (raw DB errors surfaced on SEND); Layout stability (steppers/tiles reserve height, ≥44px targets).
- [ ] **Flow registry:** add **"Picture Transfer — Send (create pending)"** under Warehouse Transfers; fields: trigger `/warehouse/picture-transfer`, hook `useCreateTransfer`, RPC `create_transfer_v2`, guards `warehouse.transfer.simple` + RP-of-source, related `[[Create Warehouse Transfer]]` (same RPC, classic UI), `[[Dispatch Warehouse Transfer (issue)]]` (downstream). Same commit as code.
- [ ] **Ship P1:** on operator "working" — apply both migrations to **new-prod** via the guarded `db query --linked` flow (link→verify ref==optishfnnctrhffpoywg→apply→verify→re-link staging), push the frontend to `deploy/warehouse-shipping`, update PROGRESS + EOD.

---

# PHASE 2 — RECEIVE

*The worker accepts stock that has been dispatched to his warehouse. Reuses the existing `receive_transfer` + RP-of-destination gate.*

## Task 10 — `useVariantImages` + `PictureReceive`

**Files:** Create `src/hooks/useVariantImages.ts`, `src/components/warehouse/picture-transfer/PictureReceive.tsx`; modify `page.tsx` (render on `mode==='receive'`, wire the count).

**Interfaces — Consumes:** `useWarehouseTransfers({ status:'in_transit' })`; `useMyResponsibleWarehouses()`; `useReceiveTransfer()`; `useCurrentUserProfile()`. **Produces:** `useVariantImages(ids)` → `Map<brand_variant_id, string|null>`; `PictureReceive({ myWarehouseIds })`.

- [ ] **Step 1 — `useVariantImages`** — one bounded query `inventory_item_brand_variants` → `inventory_items(image_url)` for the given ids (`.in('id', ids).limit(500)`), returns a Map. (Transfer items carry no image.)
- [ ] **Step 2 — Incoming list.** `const { data: inTransit = [] } = useWarehouseTransfers({ status: 'in_transit' })`; keep `to_warehouse_id ∈ myWarehouseIds`. Each transfer → a card group: header ("from {from_warehouse_name}"), then per-item `PicturePhoto` + name + big `dispatched_qty` (mockup screen 6). Feed the count badge back to Home.
- [ ] **Step 3 — Accept-all.** Big `✓ Receive` calls `useReceiveTransfer` with `receivedItems = transfer_items.map(i => ({ transfer_item_id: i.id, received_qty: i.dispatched_qty ?? 0 }))`.
- [ ] **Step 4 — "I got fewer".** A small secondary link reveals per-item `QtyStepper` (max `dispatched_qty`); a reduced qty sets `received_qty < dispatched_qty` (the RPC records the shrinkage). Surface raw DB errors.
- [ ] **Step 5 — `tsc` + `eslint` clean.**
- [ ] **Step 6 — Operator smoke:** dispatch a transfer TO his warehouse from the classic surface → it appears in his Picture Receive with photos + counts; `✓ Receive` lands the stock (status→`received`), quantities correct; "I got fewer" records shrinkage. A transfer to a DIFFERENT warehouse does NOT appear.
- [ ] **Step 7 — Commit** after operator confirms.

## Task 11 — "Needs photo" surface

**Files:** Modify `PictureItemFind.tsx` (or a small `NeedsPhotoHint.tsx`).

- [ ] **Step 1 —** A small, dismissible hint on the Find screen: "N items have no picture" (count of his in-stock items with `image_url IS NULL`). It is informational for the worker and actionable for management (who set images in `ItemEditDialog`). No new write path. Keep it layout-stable (reserve height).
- [ ] **Step 2 — `tsc` + `eslint` clean. Commit.**

## Task 12 — P2 verification, security, flow registry, ship

- [ ] **Security checklist** row: `useVariantImages` is a bounded read; receive reuses the RP-of-destination gate + `receive_transfer` (verified Task 1); layout stability on the got-fewer reveal.
- [ ] **Flow registry:** add **"Picture Transfer — Receive"** (trigger `/warehouse/picture-transfer` Receive; hook `useReceiveTransfer`; RPC `receive_transfer`; guard `warehouse.transfer.simple` + RP-of-destination; related `[[Receive Warehouse Transfer]]`).
- [ ] **Ship P2** (frontend only — no migrations) on operator "working": push to `deploy/warehouse-shipping`, PROGRESS + EOD.

---

# PHASE 3 — 📷 Barcode / QR scan (isolated, ships last)

*Requires an operator decision (Open confirm #3: scan against existing SKU vs. a new `barcode` column) and a small camera/decoder dependency. Build only after P1/P2 are live and the labeling approach is confirmed.*

## Task 13 — Scan in the search bar

**Files:** Modify `PictureItemFind.tsx`; possibly add `src/components/warehouse/picture-transfer/ScanSheet.tsx`.

- [ ] **Step 1 — Confirm the match key** with the operator: decoded value → `inventory_items.sku` (print SKU barcodes) OR a new `barcode` column (if a column is chosen, that migration + `ItemEditDialog` field is a prerequisite sub-task, mirrored to staging).
- [ ] **Step 2 — Decoder.** Prefer the native `BarcodeDetector` API where available (no dependency); fall back to a small lib (e.g. `@zxing/browser`) behind a dynamic import so the main bundle is unaffected. Camera via `getUserMedia`.
- [ ] **Step 3 — Wire.** The 📷 button opens a camera sheet; on decode, match to a stock row and jump straight to it in the grid (or add to cart at qty 1). Handle no-match ("Not found here") and permission-denied gracefully.
- [ ] **Step 4 — `tsc` + `eslint` clean. Operator smoke** on a real device (camera + a labeled bin). **Commit** after confirm.

## Task 14 — P3 verification + ship

- [ ] **Security checklist** row (camera permission handled; no new writable surface unless a `barcode` column was added — then RLS/label rules apply); **flow registry** note on the scan entry path; ship on operator "working".

---

## Self-Review

- **Spec coverage (design §6–§10):** entry permission + route + nav (Task 2); source-from-RP + resolution (Task 3, §6.2); photo primitive + fallback (Task 4, §6.5); often-moved (Task 5) + groups + search + grid (Task 6, §6.3.1–2); custody Where cascade (Task 7, §6.3.3); Confirm → `create_transfer_v2` pending (Task 8, §6.3.4); Receive (Task 10, §6.4); needs-photo (Task 11, §6.5); scan (Task 13, §8 P3); the two new RPCs (Tasks 3, 5, §6.6). All mapped.
- **Authorization is Task 1 (blocking):** the create/receive RPC permission requirement + the exact simple-role permission set are resolved before any UI, closing design §9's top risk.
- **Coexistence honored:** no task edits `WhTransferDialog` / `WhTransfersTab` / the classic tab; the swap is purely the new permission + nav entry (Task 2).
- **No placeholders:** every migration + hook is complete real SQL/TS; component tasks give real props/state/handlers + reuse the approved mockup markup; the two probes and both RPC bodies are written out.
- **Type consistency:** `create_transfer_v2` params match `CreateTransferPayload`; `receive_transfer` `received_items` shape matches `useReceiveTransfer`; custody dest `{toWarehouseId,toSubContainerId,label}` consumed identically in Tasks 7–8; `WarehouseStockItem` fields (`available_qty`, `avg_cost`, `image_url`) used as defined in `useWarehouseOperations.ts`.
- **Constraints baked in:** staging-only + mirror, `pg_get_functiondef` before assuming auth, rolled-back probes, `revoke … from public`, `.limit(N)`, `tsc`+`eslint` per task, no `next build`, co-author trailers, commit-after-operator-confirms, flow-registry-in-same-commit, PROGRESS/EOD.

## Open confirms (carried from the design — resolve before the relevant task)

1. **Dispatch actor** (before Task 8 ship): confirm a classic dispatch RP/supervisor covers his warehouse (his sends are pending). If he should auto-dispatch his own sends, add a one-tap dispatch to Task 8.
2. **Source sub-container** (Task 3 Step 5): when his warehouse has multiple sub-containers, map him to one division/area vs. the big-tile area pick. Default: area pick.
3. **Barcode source** (Task 13 Step 1): SKU vs. new `barcode` column.
4. **Entry shape** (Task 2): dedicated route + nav (this plan) vs. in-tab swap on the classic Transfers tab.

## Execution options

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks.
2. **Inline** — execute tasks in this session with checkpoints.
