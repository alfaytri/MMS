# Shipments — Multi-PO, Item-Level Contents, Schedule Revisions & Freeform Events

**Date:** 2026-09-08
**Status:** Design approved (brainstorm) — pending spec review → implementation plan
**Module:** `purchase/shipments`
**Owner:** Mohamed Ismail

---

## 1. Background — current state

The shipments feature (`src/app/(dashboard)/purchase/shipments/page.tsx`, `src/hooks/useShipments.ts`) tracks in-transit purchase orders and optionally auto-syncs carrier events via 17track.

Current `shipments` table (live new-prod, **7 rows**):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tracking_number` | text **NOT NULL** | the *only* human identifier today |
| `po_id` | uuid **NOT NULL** | **single** PO per shipment |
| `receival_id` | uuid null | optional link to a receival |
| `mode` | enum `shipment_mode` | air / sea / land / manual |
| `carrier`, `carrier_code` | text null | |
| `status` | enum `shipment_status` | booked / in_transit / customs / delivered / delayed |
| `origin`, `destination` | text null | |
| `etd`, `eta` | date null | **currently unused by the UI** — the detail dialog shows the PO's `expected_delivery` as ETD and *derives* ETA from a "delivered" event |
| `events` | jsonb `[]` | array of `{ date, location, status?, notes?, normalizedTimestamp?, hash? }`; `location` **required** in the add-event form |
| `archived`, `is_syncing`, `last_synced_at`, `sync_error` | | 17track sync bookkeeping |
| `created_at`, `updated_at` | timestamptz | |

PO lines live in **`po_line_items`** (`id, po_id, item_name, sku, qty, received_qty, unit, unit_price, total_price, brand_variant_id, division_id, free_qty, …`).

17track: `useCreateShipment` POSTs `/api/shipments/register-tracking`; a webhook (`/api/webhooks/17track`) appends events; delete POSTs `/api/shipments/deregister-tracking`.

---

## 2. Goals (the 5 requirements)

1. **A single shipment can carry multiple POs** — and, since the operator confirmed "mostly whole, sometimes partial," at the **line-item** level (a shipment carries specific PO lines + quantities).
2. **Opening a shipment shows each PO and its items.**
3. **Tracking number is optional** — not every shipment has one.
4. **ETD (and ETA) carry a full revision history** — original → updated(s) → actual.
5. **Events can be recorded without a port/location** — freeform milestones/notes.

## 3. Non-goals (YAGNI — explicitly out of scope)

- Reconciling shipment quantities against **actual receivals** (the receival flow already handles receiving). The shipment↔PO qty check is *soft* only (see §5.2).
- A carrier master-data table (carrier stays free text, as today).
- Document/file attachments on shipments.
- Splitting a single 17track feed across multiple shipments (a tracking number maps to at most one shipment, as today).

---

## 4. Data model

### 4.1 `shipments` — column changes
- **Add** `shipment_number text NOT NULL UNIQUE` — the primary human identifier, auto-generated `SHP-00001`, `SHP-00002`, … using the **same mechanism the project already uses for `po_number`** (a Postgres sequence + `BEFORE INSERT` trigger that formats the value). Confirm the exact existing pattern at implementation and mirror it.
- **Change** `tracking_number` → **nullable**.
- **Keep** `etd` / `eta` as **cached "current planned" dates** — trigger-maintained from the latest non-`actual` revision (see §4.3) so the list stays a single fast query. (These stop being sourced from the PO's `expected_delivery`.)
- **Add** `etd_actual date null`, `eta_actual date null` — cached from the `actual` revision, for list/badge display.
- **Drop** `po_id` — **after** backfilling its data into `shipment_line_items` (§5). `receival_id` is unchanged.

### 4.2 `shipment_line_items` (new) — item-level contents
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `shipment_id` | uuid NOT NULL | FK → `shipments(id)` **ON DELETE CASCADE** |
| `po_line_item_id` | uuid NOT NULL | FK → `po_line_items(id)` **ON DELETE CASCADE** |
| `qty` | integer NOT NULL `CHECK (qty > 0)` | quantity of that PO line carried in this shipment |
| `created_at` | timestamptz default now() | |

- **Unique** `(shipment_id, po_line_item_id)` — a PO line appears at most once per shipment (its whole qty in that shipment).
- The shipment's **POs** = `SELECT DISTINCT po_id FROM po_line_items WHERE id IN (this shipment's line item ids)`.
- "Add whole PO" = insert one row per PO line at the line's not-yet-shipped remainder (§5.2). Partial = edit `qty` / omit lines.
- Indexes: `(shipment_id)`, `(po_line_item_id)`.

### 4.3 `shipment_schedule_revisions` (new) — ETD/ETA history
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `shipment_id` | uuid NOT NULL | FK → `shipments(id)` **ON DELETE CASCADE** |
| `leg` | enum `shipment_schedule_leg` | `'etd'` \| `'eta'` |
| `revision_type` | enum `shipment_schedule_revision_type` | `'original'` \| `'updated'` \| `'actual'` |
| `date_value` | date NOT NULL | the (re)scheduled or actual date |
| `reason` | text null | why it changed (free text) |
| `created_by` | uuid null | FK → `user_data(id)` (nullable for system/backfill rows) |
| `created_at` | timestamptz default now() | |

- **Partial unique indexes:** at most one `original` and at most one `actual` per `(shipment_id, leg)`; unlimited `updated`.
- **Derived values:** *current planned* `leg` date = the newest row for that leg where `revision_type IN ('original','updated')` (by `created_at`); *actual* = the `actual` row.
- A trigger keeps `shipments.etd/eta` (current planned) and `etd_actual/eta_actual` in sync on insert/delete of these rows.
- Index: `(shipment_id, leg, created_at)`.

### 4.4 `events` JSONB — decouple from location
New `ShipmentEvent` shape:
```ts
type ShipmentEvent = {
  date: string
  title: string          // NEW — short label, required for manual events ("Documents submitted")
  location?: string      // was required; now OPTIONAL
  status?: string
  notes?: string
  normalizedTimestamp?: string  // 17track
  hash?: string                 // 17track
}
```
- 17track-synced events continue to populate `location` (and can set `title` from the carrier status text).
- The add-event form: **`title` required**; `location`, `status`, `notes` optional. Timeline renders `title` as the headline and `location` as a secondary line only when present.
- Backfill note: existing events have no `title` — the renderer falls back to `location || status || '—'` when `title` is absent, so old events stay readable without a data migration.

### 4.5 New enums
- `shipment_schedule_leg` = (`etd`, `eta`)
- `shipment_schedule_revision_type` = (`original`, `updated`, `actual`)

### 4.6 RLS & grants (Security checklist item)
- Enable RLS on both new tables and add policies **mirroring the existing `shipments` table's policies** (confirm and copy shipments' policy shape at implementation — authenticated access, plus any division scoping shipments already applies). Never ship a new table without RLS + at least one policy.
- Grants: revoke from `anon`, grant the needed CRUD to `authenticated` consistent with shipments.

---

## 5. Migration & backfill (single migration; 7 existing rows → low risk)

Ordered steps in one `supabase/migrations/YYYYMMDDHHMMSS_shipments_multi_po_schedule.sql` (mirrored to `migrations-staging/`):

1. Create the two enums.
2. `ALTER TABLE shipments ADD COLUMN shipment_number text` + sequence/trigger; **backfill** existing 7 rows `SHP-00001…` in `created_at` order; then `SET NOT NULL` + `UNIQUE`.
3. `ALTER TABLE shipments ALTER COLUMN tracking_number DROP NOT NULL`.
4. `ALTER TABLE shipments ADD COLUMN etd_actual date, ADD COLUMN eta_actual date`.
5. Create `shipment_line_items` (+ FKs, unique, indexes, RLS, policies, grants).
6. Create `shipment_schedule_revisions` (+ enums used, partial-unique indexes, index, RLS, policies, grants).
7. **Backfill lines:** for each existing shipment, `INSERT INTO shipment_line_items (shipment_id, po_line_item_id, qty) SELECT s.id, pli.id, pli.qty FROM po_line_items pli WHERE pli.po_id = s.po_id` (whole PO).
8. **Backfill schedule:** for each existing shipment with a PO `expected_delivery` (or existing `etd`), insert one `('etd','original', that_date)` revision; the sync trigger sets `shipments.etd`.
9. The current/actual sync trigger + its initial reconciliation.
10. `ALTER TABLE shipments DROP COLUMN po_id` (its data now lives in `shipment_line_items`).

### 5.2 Soft reconciliation (approved)
- When adding a PO to a shipment, each line's default qty = `po_line_items.qty − (already shipped elsewhere)`, i.e. the not-yet-shipped remainder (computed across all `shipment_line_items` for that `po_line_item_id`).
- The UI **warns** ("This exceeds the PO's remaining quantity") if the operator raises a line above the remainder, but **does not block** — no DB constraint enforces it. This keeps "mostly whole, sometimes partial" flexible.

---

## 6. Backend (hooks + RPCs)

- **`create_shipment` RPC** (SECURITY DEFINER, authenticated) — one atomic call that inserts the shipment (number via trigger), its `shipment_line_items`, and the ETD `original` revision. A multi-step client insert would risk partial state; an RPC keeps it transactional. Returns the new shipment row.
- **`useShipments`** — list query joins in: the distinct PO numbers/suppliers (via `shipment_line_items → po_line_items → purchase_orders`), a line/PO count, current planned `etd`, and `etd_actual`. Prefer a read view or a `get_shipments` RPC over a deep nested `select` to keep it one round-trip.
- **`useShipmentDetail(id)`** — lines grouped by PO (item_name, sku, qty-in-shipment, PO qty, remaining) + the schedule revisions (both legs) + events.
- **Mutations:** `useAddShipmentLines` / `useUpdateShipmentLineQty` / `useRemoveShipmentLine`; `useAddScheduleRevision({ leg, revision_type, date_value, reason })`; `useAddShipmentEvent` (new `title`, optional `location`); existing `useUpdateShipmentStatus` / `useDeleteShipment` kept.
- **Query invalidation:** follow `src/lib/queryInvalidation.ts` helpers; every mutation invalidates what the list + detail read (see the stale-after-save memory).
- **Repoint `po_id` consumers before the drop:** audit every reader of `shipments.po_id` — the delay/customs notify (§9), and any references in `ReceivalFormDialog` / SO / receival code (grep `shipments` + `po_id`) — and switch them to `shipment_line_items` (or the derived PO set). The column drops only after all consumers are migrated.

## 7. UI

**Create dialog** — shipment # is auto (shown read-only once created); mode; **tracking optional**; a **multi-PO picker**: pick a PO → its lines appear with editable qty pre-filled to the remainder + a "whole PO / clear" toggle; add more POs; ETD original date (+ optional reason). Register 17track only if a tracking number was entered.

**List** — columns: **Shipment #** (+ tracking mono if present), **PO(s)** ("PO-123 +2" with supplier of the first), Mode, Status, **ETD** (current planned, with a slip badge if `etd_actual`/updated differs), Events count. Search matches shipment #, tracking #, carrier, and PO number.

**Detail dialog** — sections:
- **Header:** shipment #, tracking (if any), mode, carrier, status; sync bar only when a tracking number exists.
- **Purchase Orders:** one group per linked PO → its items (name, sku, qty-in-shipment vs PO qty, and remaining **un-shipped** = PO qty − qty shipped across all shipments); "Add PO" / edit-qty / remove-line respecting soft reconciliation.
- **Schedule:** ETD and ETA each shown as original → updated(s) → actual with dates and reasons; an "Add revision" action (pick leg, type, date, reason). "Actual" is entered when it departs/arrives.
- **Timeline:** events newest-first; `title` headline, `location` shown only when present; "Add Event" (title required); 17track "Sync Now".
- **Footer:** Update Status, Delete (deregisters tracking if present).

Apply the standard responsive + layout-stability rules (min-heights on the dynamic PO/schedule sections; dialog full-screen on mobile).

## 8. 17track integration
- Register/sync/deregister **only when `tracking_number` is present**. A tracking-less shipment simply has no sync bar and relies on manual events + schedule revisions.
- Webhook unchanged; incoming events keep populating `location` and now also set `title` from the carrier status.

## 9. Notifications
- On `delayed` / `customs`, notify the owner of **every** linked PO (was the single `po_id` owner) via `notifyOwnerAndKey` / `notify.purchase.shipment_delayed` — dedupe recipients.

## 10. Flow registry
- Update `docs/flows-registry.md` in the same commit as the code: revise/extend the shipment entries — `Create Shipment (multi-PO)`, `Add/Update Shipment Schedule Revision`, `Add Shipment Event`, and note the retired single-PO path.

## 11. Security checklist (to record in PROGRESS `## 🔒 Security Audit Log`)
- **Secrets:** none added.
- **RLS:** both new tables get RLS + policies mirroring `shipments` (§4.6).
- **Auth gate:** all new mutations go through the authenticated Supabase client / SECURITY DEFINER RPCs; no new external webhook routes.
- **Error handling:** surface raw DB errors (`humanizeDbError`); the 17track calls stay best-effort with explicit failure states (already the case).
- **Layout stability:** reserve space on the PO/schedule/event sections so adding rows doesn't shift the header/footer.

## 12. Test plan (what must pass before "done")
- **Silent (agent):** `tsc` + eslint clean; migration applies to staging (`db push` / `psql`) and is idempotent; RLS present on both tables; `create_shipment` RPC proven via a rolled-back `DO` block (shipment + lines + revision all land, or none).
- **Operator smoke (staging):** create a multi-PO shipment (whole + one partial PO); tracking-less shipment gets a `SHP-` number and no sync bar; add an ETD "updated" then "actual" and confirm the list ETD + slip badge; add a location-less event; delete deregisters tracking; the 7 backfilled shipments show their PO's items + an ETD original.

## 13. Rollout
- Staging first (migrations → `migrations-staging/`), operator smoke, then new-prod via the established `psql`/`db push` path, then push `deploy/warehouse-shipping` (one Vercel build) — **ask before the prod push** per the batch-push rule.

---

## Open items resolved in brainstorm
- PO↔items granularity → **item-level** (`shipment_line_items`), with whole-PO quick-add. ✔
- ETD/ETA → **full revision history**, both legs. ✔
- Optional tracking → **`shipment_number`** as primary ID. ✔
- Reconciliation → **soft** (warn, don't block). ✔
- Delay/customs notifications → **all** linked PO owners. ✔
