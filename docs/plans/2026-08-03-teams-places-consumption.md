# Teams + Places + Consumption Plan

**Branch:** `feature/field-inventory-and-consumption`
**Base:** `deploy/warehouse-shipping` (currently `98b555d2`)
**Date:** 2026-08-03
**Status:** Design locked, ready to build

## Problem statement

Today the app tracks inventory in exactly two states:

- **In warehouse** — rows in `fifo_cost_layers`, scoped to `(warehouse_id, sub_container_id)`.
- **Sold / delivered** — rows in `cogs_entries` when a delivery posts.

There's no intermediate state for physical stock that has *left the warehouse but hasn't been sold yet*:

- **Team custody** — stock riding with a field team (repair van, install crew).
- **Off-site custody** — stock pre-positioned at a client's premises, in an office storage room, at a satellite location coded like `F004`, etc.

Operators need to answer three questions we can't answer now:

1. "How much QAR-value of stock is currently with Team 3?"
2. "What's sitting at client site F004 that hasn't been consumed yet?"
3. "When Team 3 consumed those parts on a job, what did it cost us?" — i.e. a lightweight COGS-generating flow that isn't a full sale order.

## Design principle: reuse D.6.b

The Repair-vendor consolidation (D.6.b, 2026-08-01) established a pattern: **one shared virtual warehouse per off-site category**, with individual off-site locations as **sub-containers** inside it. Every existing FIFO / movements / sub-container-scoping / division-scoping machinery works untouched.

We apply the same pattern twice:

```
warehouses
├── Birkat Alawamer              (kind='general')     ← real WH
├── Industrial Area Accom.       (kind='general')     ← real WH
├── Repair                       (kind='repair')      ← existing
│   ├── _test repair                                  ← vendor sub
│   └── ...
├── Teams                        (kind='teams')       ← NEW, shared
│   ├── [Maintenance] Team 1                          ← division_id = Maintenance
│   ├── [Maintenance] Team 2
│   ├── [Kitchen] Team 3
│   └── ...
└── Places                       (kind='places')      ← NEW, shared
    ├── F004                                          ← name doubles as code for now
    ├── OFFICE-01
    ├── SITE-Q-115
    └── ...
```

**Why not one virtual warehouse per team / per site?** Fewer top-level rows, single-source list per category (like Repair), and the sub-container's `division_id` gives us free per-division grouping in the UI.

**Why not a bespoke `team_stock_layers` table?** Would duplicate every downstream helper (`deduct_fifo_layers`, `recalc_average_cost`, movements ledger, stock overview view, RLS policies, Phase F actions). Duplication is a trap for a feature this size.

## Schema changes

### Migration 1 — warehouse kinds + team FK column

```sql
-- Extend the warehouse_kind enum
ALTER TYPE public.warehouse_kind ADD VALUE IF NOT EXISTS 'teams';
ALTER TYPE public.warehouse_kind ADD VALUE IF NOT EXISTS 'places';

-- Seed the two virtual warehouses (idempotent — ON CONFLICT DO NOTHING)
INSERT INTO public.warehouses (name, warehouse_kind, is_active)
VALUES ('Teams',  'teams',  true),
       ('Places', 'places', true)
ON CONFLICT (name) DO NOTHING;

-- Prepare for future Teams module: nullable team_id on sub-containers
ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN IF NOT EXISTS team_id uuid;
-- FK left off until the teams table exists; enforced application-side for now.

CREATE INDEX IF NOT EXISTS idx_wsc_team_id
  ON public.warehouse_sub_containers (team_id)
  WHERE team_id IS NOT NULL;
```

**Notes:**
- No new columns on `warehouses` — kind enum extension is the whole story.
- Places uses the existing `warehouse_sub_containers.name` as the code (per operator decision — mapping to a proper places table lands later).
- Team assignment link (`team_id`) is nullable and stays unused until the teams module ships. Operator confirmed this shape.

### Migration 2 — transfer + movement enum extensions

```sql
-- warehouse_transfers.transfer_kind CHECK is currently:
--   ('good_stock','damaged_repair_out','damaged_repair_return_good','damaged_repair_return_writeoff')
-- Add two new custody kinds.
ALTER TABLE public.warehouse_transfers
  DROP CONSTRAINT IF EXISTS warehouse_transfers_kind_check;

ALTER TABLE public.warehouse_transfers
  ADD CONSTRAINT warehouse_transfers_kind_check
  CHECK (transfer_kind IN (
    'good_stock',
    'damaged_repair_out',
    'damaged_repair_return_good',
    'damaged_repair_return_writeoff',
    'custody_assign',
    'custody_return'
  ));

-- Repair-shape constraint (see Phase F migration 4) doesn't need to change:
-- custody_* aren't in the CASE and thus land under the ELSE (no rule) which
-- currently makes them unrepresented. Confirm the CASE expression still
-- returns TRUE for kinds not enumerated (Postgres CASE returns NULL for
-- unmatched WHEN → CHECK treats NULL as satisfied). If not, add
-- WHEN 'custody_assign' | 'custody_return' THEN true rows.

-- stock_movement_type enum:
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'consumption';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'custody_assign';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'custody_return';
```

**Verification step** (part of the migration file, in a DO block):

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'stock_movement_type' AND e.enumlabel = 'consumption'
  ) THEN
    RAISE EXCEPTION 'consumption enum value missing';
  END IF;
END $$;
```

### Migration 3 — consumption tables + RPC

```sql
CREATE TABLE public.consumption_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ce_number               text UNIQUE NOT NULL,
  date                    date NOT NULL DEFAULT current_date,

  -- Source of the consumed stock. Any warehouse (real, Teams virtual, Places
  -- virtual) + a sub-container inside it.
  source_warehouse_id     uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  source_sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT,

  -- Who / what consumed the stock. One-of, application-enforced.
  consumer_type           text NOT NULL CHECK (consumer_type IN ('team','customer_site','customer','internal')),
  consumer_team_sub_id    uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,   -- when consumer_type='team'
  consumer_place_sub_id   uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,   -- when consumer_type='customer_site'
  consumer_customer_id    uuid REFERENCES public.customers(id)                ON DELETE SET NULL,   -- when consumer_type='customer'

  notes                   text,
  attachments             text[] NOT NULL DEFAULT '{}',       -- storage URLs; PDF, images

  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  created_by              uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  posted_by               uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  posted_at               timestamptz,
  cancelled_by            uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  cancelled_at            timestamptz,
  division_id             uuid REFERENCES public.company_divisions(id) ON DELETE SET NULL
);

CREATE INDEX idx_consumption_entries_status_date ON public.consumption_entries (status, date DESC);
CREATE INDEX idx_consumption_entries_source_sub  ON public.consumption_entries (source_sub_container_id);
CREATE INDEX idx_consumption_entries_consumer_team  ON public.consumption_entries (consumer_team_sub_id)  WHERE consumer_team_sub_id IS NOT NULL;
CREATE INDEX idx_consumption_entries_consumer_place ON public.consumption_entries (consumer_place_sub_id) WHERE consumer_place_sub_id IS NOT NULL;
CREATE INDEX idx_consumption_entries_consumer_cust  ON public.consumption_entries (consumer_customer_id)  WHERE consumer_customer_id IS NOT NULL;

CREATE TABLE public.consumption_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_id    uuid NOT NULL REFERENCES public.consumption_entries(id) ON DELETE CASCADE,
  brand_variant_id  uuid NOT NULL REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT,
  item_name         text NOT NULL,
  sku               text,
  qty               int  NOT NULL CHECK (qty > 0),
  unit_cost         numeric,                                    -- Weighted at post time, NULL while draft
  total_cost        numeric GENERATED ALWAYS AS (qty * unit_cost) STORED,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consumption_lines_consumption ON public.consumption_lines (consumption_id);
CREATE INDEX idx_consumption_lines_variant     ON public.consumption_lines (brand_variant_id);

-- Number generator (mirrors sale_deliveries etc.)
CREATE OR REPLACE FUNCTION public.generate_consumption_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.consumption_entries;
  RETURN 'CE-' || lpad((v_count + 1)::text, 5, '0');
END;
$$;

-- RLS: same shape as inventory_damaged_movements. Read visible to authenticated;
-- writes via SECURITY DEFINER RPC.
ALTER TABLE public.consumption_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_lines   ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_ce_read  ON public.consumption_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY p_cl_read  ON public.consumption_lines   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY p_ce_write ON public.consumption_entries FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY p_cl_write ON public.consumption_lines   FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
```

### Migration 4 — `rpc_post_consumption`

Fires when the operator confirms the New Consumption dialog. Contract:

```
rpc_post_consumption(
  p_source_warehouse_id      uuid,
  p_source_sub_container_id  uuid,
  p_consumer_type            text,     -- 'team' | 'customer_site' | 'customer' | 'internal'
  p_consumer_team_sub_id     uuid,     -- required if consumer_type='team'
  p_consumer_place_sub_id    uuid,     -- required if consumer_type='customer_site'
  p_consumer_customer_id     uuid,     -- optional even when 'customer'
  p_notes                    text,
  p_attachments              text[],
  p_lines                    jsonb     -- [{brand_variant_id, qty}, ...]
) RETURNS uuid  -- consumption_entries.id
```

Behavior (one transaction):

1. Validate source sub belongs to the source warehouse and is active.
2. Validate consumer_type matches which consumer FK is set.
3. Insert `consumption_entries` row with status='posted', ce_number from generator.
4. For each line:
   - Loop through `deduct_fifo_layers(variant, source_warehouse_id, qty, sub_container_id=source_sub_container_id)`.
   - Insert `consumption_lines` row with weighted unit_cost.
   - Insert `inventory_stock_movements` row `movement_type='consumption'`, `reference_type='consumption'`, `reference_id=consumption_entries.id`.
   - Insert `cogs_entries` row stamped with `consumer_type` + relevant consumer id. `sale_order_id` NULL. New nullable columns on `cogs_entries`:
     ```
     ALTER TABLE public.cogs_entries
       ADD COLUMN IF NOT EXISTS consumption_id uuid REFERENCES public.consumption_entries(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS consumer_type text CHECK (consumer_type IS NULL OR consumer_type IN ('team','customer_site','customer','internal')),
       ADD COLUMN IF NOT EXISTS consumer_team_sub_id  uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS consumer_place_sub_id uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS consumer_customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL;
     ```
     (Sits alongside existing sale_delivery_id / sale_order_id.)
5. `recalc_average_cost(variant)` per touched variant.
6. Return the new consumption id.

**Cancel path** — `rpc_cancel_consumption(p_id)` — reverses each line by inserting compensating FIFO layers (fresh layer per reversed chunk at same unit_cost, tagged source_type='consumption_cancel'), inserts reversing cogs_entries (qty × -1), sets status='cancelled'. Same pattern as `cancel_delivery_inventory`.

### Migration 5 — hide Teams + Places from the main Warehouses page

Currently `/warehouses` shows all warehouses. Add a UI-level filter (no DB change): `useWarehouses` accepts `kinds?: WarehouseKind[]` (default excludes `'repair'`, `'teams'`, `'places'`). The dedicated pages fetch by kind explicitly.

### Migration 6 — responsible person on sub-containers (2026-08-03 addition)

Every Team + Place sub-container gets a nullable `responsible_person_profile_id` (FK to `user_data.id`). This person is the physical custodian of the stock riding in that sub — they accept inbound custody assigns and initiate returns.

```sql
ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN IF NOT EXISTS responsible_person_profile_id uuid
    REFERENCES public.user_data(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wsc_responsible_person
  ON public.warehouse_sub_containers (responsible_person_profile_id)
  WHERE responsible_person_profile_id IS NOT NULL;
```

Extend `rpc_upsert_team_or_place` with `p_responsible_person_profile_id uuid DEFAULT NULL`. Extend `get_teams_master_list` + `get_places_master_list` to return the resolved responsible-person name + phone.

Picker scope: any active user (no division filter). Cardinality: one person per sub (single column, not link table).

### Migration 7 — custody move RPCs (revised 2026-08-03 to a 3-step request flow)

Custody moves between real warehouses and the shared Teams / Places virtual warehouses use a 3-step request → dispatch → accept flow that mirrors the standard `create_transfer_v2` → `dispatch_transfer` → `receive_transfer` shape, but with custody-specific permission gates:

| Step | Called by | Effect | Status transition |
|------|-----------|--------|-------------------|
| Request | Custody sub's responsible person **or** `_has_custody_admin_role` | Insert transfer header + line items. No FIFO movement yet. | `pending` |
| Dispatch | Source WH's field RP (`is_field_rp_of`) **or** `_has_custody_admin_role` | Deduct source FIFO, emit `transfer_out` movements, stamp `dispatched_by_*`. | `pending` → `in_transit` |
| Accept | Destination custody sub's responsible person **or** `_has_custody_admin_role` | Create FIFO layers on destination sub, emit `transfer_in` movements, stamp `received_by_*`. | `in_transit` → `received` |

This gives the warehouse RP a real say in the movement: they physically load the van, then click Dispatch. Only then does stock actually leave their books. Also matches how the app already handles inter-warehouse transfers, keeping mental model consistent.

Return direction (Team/Place → real WH) stays a 2-step create + standard `receive_transfer` — the source side is inside the app's custody surface, not a warehouse team, so a separate "request → dispatch" split adds friction without accountability value.

**`rpc_create_custody_assign`** (revised — request-only, no FIFO). Called by the custody sub's responsible person or an admin.

```
rpc_create_custody_assign(
  p_source_warehouse_id       uuid,
  p_source_sub_container_id   uuid,
  p_dest_sub_container_id     uuid,     -- must belong to a warehouse_kind IN ('teams','places')
  p_items                     jsonb,    -- [{brand_variant_id, qty}, ...]
  p_notes                     text,
  p_created_by_profile_id     uuid,
  p_created_by_name           text
) RETURNS uuid  -- warehouse_transfers.id
```

Effects (one transaction):
1. Validate `p_dest_sub_container_id` belongs to a warehouse with `warehouse_kind IN ('teams','places')` and is active.
2. Insert `warehouse_transfers` with `transfer_kind='custody_assign'`, **`status='pending'`**. `dispatched_*` and `received_*` remain NULL.
3. For each line: insert `warehouse_transfer_items` with `requested_qty` set, `dispatched_qty` NULL, `unit_cost=0` (real cost stamped at dispatch time).
4. Returns transfer id. **No FIFO deduction, no stock movement, no allocation.**

**`rpc_dispatch_custody_assign`** (new — WH RP does the physical load-out). Called by the source warehouse's field RP or an admin.

```
rpc_dispatch_custody_assign(
  p_transfer_id              uuid,
  p_dispatched_by_profile_id uuid,
  p_dispatched_by_name       text
) RETURNS void
```

Effects:
1. Load transfer + FOR UPDATE; must be `kind='custody_assign'` and `status='pending'`.
2. Permission gate: caller must be `is_field_rp_of(from_warehouse_id)` OR `_has_custody_admin_role`. Friendly error if not.
3. For each transfer item: `deduct_fifo_layers` scoped to `from_sub_container_id`. Insert per-layer `inventory_stock_movements` `transfer_out`. Stamp weighted `unit_cost` on the transfer item + set `dispatched_qty = requested_qty`.
4. Flip transfer to `status='in_transit'`, stamp `dispatched_by_*` + `dispatched_at=now()`.

**`rpc_accept_custody_assign`** — Team/Place responsible person confirms receipt.

```
rpc_accept_custody_assign(
  p_transfer_id            uuid,
  p_accepted_by_profile_id uuid,
  p_accepted_by_name       text
) RETURNS void
```

Effects:
1. Load transfer + FOR UPDATE; must be `kind='custody_assign'` and `status='in_transit'`.
2. Permission gate: caller must be the destination sub's `responsible_person_profile_id`, OR have `inventory_manager` role (via `has_inventory_manager_role`).
3. For each `warehouse_transfer_items` row: insert a new `fifo_cost_layers` row on the destination sub (unit_cost = the item's stored unit_cost, source_type = 'custody_assign', source_id = transfer_id); insert `inventory_stock_movements` `transfer_in` on destination.
4. Flip transfer to `status='completed'`, stamp `received_by_*` + `received_at=now()`.

**`rpc_create_custody_return`** — Team/Place → WH. Called by the source custody sub's responsible person (or an inventory manager).

```
rpc_create_custody_return(
  p_source_sub_container_id  uuid,     -- must belong to teams/places virtual WH
  p_dest_warehouse_id        uuid,
  p_dest_sub_container_id    uuid,     -- destination sub in the real WH
  p_items                    jsonb,
  p_notes                    text,
  p_created_by_profile_id    uuid,
  p_created_by_name          text
) RETURNS uuid
```

Effects:
1. Permission gate: `p_created_by_profile_id` must equal source sub's `responsible_person_profile_id` OR have inventory-manager role.
2. Validate source sub belongs to `teams`/`places` warehouse; validate dest sub belongs to `p_dest_warehouse_id`.
3. Insert transfer with `kind='custody_return'`, `status='in_transit'`, dispatched-stamped.
4. For each line: deduct FIFO from source custody sub; insert transfer items; insert `transfer_out` movement.
5. Returns transfer id.

The existing `receive_transfer` RPC handles the receive-on-real-WH step of a return (destination is a real WH so the standard field-RP check applies).

Cancellation of an in-flight custody assign is handled by the existing `cancel_transfer` RPC — no new code needed.

### UI additions for the responsible-person + acceptance flow

- **Master Data → Teams** page: new "Responsible Person" column + picker in the create/edit dialog. Picker shows all active users, searchable by name/phone.
- **Master Data → Places** page: same.
- **`/warehouse/custody` cards**: show responsible person's name + phone under the sub-container name. If the current user IS the responsible person AND there's an `in_transit` `custody_assign` transfer inbound to this sub, show a **"Pending your acceptance"** badge + an **Accept** button that calls `rpc_accept_custody_assign`.

## UI

### `/master-data/teams` (new)

Table of Teams sub-containers grouped by division. Each row: name (e.g. "Team 1"), division, is_active, team_id (empty until Teams module ships). Actions: create, rename, deactivate. Nothing about stock — that's the Custody page.

**Activate/Deactivate confirmation** (2026-08-03 addition): the Activate / Deactivate button opens an `AlertDialog` before firing the mutation. Deactivate copy calls out the consequences ("This team will stop appearing on the Custody page + consumption picker. Existing stock stays on its books until returned or consumed."); Activate copy is friendlier ("This team will start appearing again in Custody + consumption pickers."). No dialog for rename / responsible-person edits — those go through the existing form.

### `/master-data/places` (new)

Table of Places sub-containers. Each row: name (used as the code, e.g. "F004"), division, is_active. Same CRUD shape as Teams, including the same Activate/Deactivate confirmation dialog.

### `/warehouse/custody` (new)

Two tabs: **Teams** / **Places**.

**Teams tab** — one card per Team sub-container, grouped visually by division header. Card shows:
- Team name + division badge
- Total QAR value in this team's sub
- Item count + expand-to-see-items
- Actions row: **Assign** (open assign-to-team dialog picking source WH), **Return** (assign-back-to-warehouse dialog), **Consume** (open New Consumption dialog pre-filled with this team as source).

**Places tab** — same shape but for Place sub-containers.

Both tabs reuse the existing `warehouse_stock_view` / `useWarehouseStock` machinery scoped to the virtual warehouse — no new query for the stock listing.

### `/consumption` (new)

Standard list page: table of consumption entries (CE-##### · date · source · consumer · total). Filters: status, date range, consumer_type.

Top-right button **New Consumption** opens a dialog:

- **Source** section — Warehouse dropdown (all kinds visible here) + sub-container picker (auto-picks single).
- **Consumer** section — segmented control: Team / Customer Site / Customer / Internal. Below it, the matching picker:
  - Team → dropdown of Teams sub-containers.
  - Customer Site → dropdown of Places sub-containers.
  - Customer → customer search.
  - Internal → no picker, free-text reason required.
- **Lines** section — inventory cascade picker + qty column. Shows FIFO cost per line (weighted preview) once the source sub is set.
- **Notes + attachments** — free-text + file uploads (Supabase Storage bucket `consumption-attachments`).
- **Amber warning box**: "Posting a consumption immediately deducts stock and books COGS. This is not reversible without a manual cancellation."
- **Confirm** button — disabled for 3 seconds after the dialog opens or after edits; a small countdown chip on the button shows the remaining seconds.

### Wiring `warehouse_kind` filter

`useWarehouses` and every warehouse picker on the app gets a `visibleKinds` guard. Default behavior mirrors D.6.b's approach for Repair: pickers used for real receiving / delivery only see `general`; the new Custody page sees `teams` + `places`; the Consumption dialog's source picker sees all four; Master Data → Warehouses sees `general` only.

## Task ordering

1. **[DB]** Migration 1 — warehouse_kind values + seed rows + `team_id` column.
2. **[DB]** Migration 2 — transfer_kind + stock_movement_type enum extensions.
3. **[DB]** Migration 3 — `consumption_entries` + `consumption_lines` tables + `cogs_entries` new nullable columns + RLS.
4. **[DB]** Migration 4 — `rpc_post_consumption` + `rpc_cancel_consumption`.
5. **[types]** Regenerate types, re-append helper aliases.
6. **[UI]** `useWarehouses({ kinds })` filter parameter + audit callers to pass the right kinds.
7. **[UI]** Master Data → Teams page.
8. **[UI]** Master Data → Places page.
9. **[UI]** `/warehouse/custody` page — Teams tab + Places tab, Assign/Return/Consume dialogs. Reuse existing WarehouseStockTree machinery.
10. **[UI]** `/consumption` page — list + New Consumption dialog with 3-second cooldown.
11. **[nav]** Nav-config updates: new "Teams" + "Places" under Master Data, "Custody" + "Consumption" under Purchase & Sales (or Operations).
12. **[verify]** Manual smoke on staging: create a team, create a place, assign 5 units from Birkat/Maintenance → Team 1, verify stock moved, consume 3 units from Team 1, verify COGS booked + FIFO deducted + 2 units remain.

Commit protocol: DB commit → PROGRESS.md commit → UI commit → PROGRESS.md commit, per each numbered task.

## Security audit checklist (module completion)

Run before the final PR:

- [ ] **Secrets** — grep session for `sk_ / Bearer / apiKey` on new files (should be empty).
- [ ] **RLS** — new tables have RLS enabled + policies; nullable FKs on `cogs_entries` don't leak sensitive fields.
- [ ] **Auth gate** — no new API routes bypass middleware; consumption RPC uses SECURITY DEFINER + `auth.role()`-gated policies.
- [ ] **Error handling** — RPC raises with clear messages; no silent failures on FIFO underflow.
- [ ] **Layout stability** — Custody card sub-container hover / expand doesn't shift the grid; New Consumption dialog footer sticky.

## Open questions to revisit

- **Physical loss / audit at customer sites** — should the Custody page grow a "Reconcile" action that opens an inventory-check-like flow? Deferred to a follow-up phase.
- **Cross-division consumption** — can a Maintenance team consume Kitchen stock? For now, treat consumer team's division as authoritative and let the source sub decide separately. Consumption RPC does NOT enforce a same-division rule (matches the D.12 sharing model).
- **Aging report** — "stock at customer site older than N days" — deferred to a reporting phase.

## Rollback plan

Each migration is self-contained. `warehouse_kind` enum can't have values dropped without a table rebuild — the values `'teams'` and `'places'` are additive-only. Seeded rows can be soft-deleted (`is_active=false`). Consumption tables can be `DROP CASCADE`-d without touching pre-existing data (they only reference tables, not the reverse). If a phase needs to be reverted, revert commit + one down-migration per applied up-migration; the design is intentionally additive to make this easy.
