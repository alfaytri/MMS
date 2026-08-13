# Warehouse Item Requests + Notification Routing — Design

- **Date:** 2026-08-13
- **Branch:** `feature/item-requests-and-notifications`
- **Status:** Draft for review

## 1. Problem

The custody **"Request stock"** dialog (`CustodyAssignDialog`) has two paths:

1. **Request in-stock items** → `useCreateCustodyAssign` → a custody assign that already has a visible dispatch/accept queue.
2. **"Need an item that isn't stocked here?"** → free-text name + qty → `rpc_request_warehouse_item`, which **only inserts one `notifications` row per warehouse responsible person**. No request record is stored anywhere.

Consequences of path 2:
- Buy-new requests vanish into the notification bell (64 pending on the reporting account), duplicated once per RP, with no dedicated view and no way to resolve them.
- The request is free-typed text (`item_name`) with no catalog link — by nature it is an item the warehouse does **not** carry.

Separately: **all other notifications are created client-side** (`src/lib/notify.ts` + hooks in `usePurchaseOrders`, `useSalesApprovals`, `useReceivals`, `usePoEditRequests`, warehouse ops, transfer dialogs). Only `item_request` is created in the DB. Recipient logic is ad-hoc per feature; the only targeting primitive today is `user_custom_roles.approval_scopes`. The operator wants recipients reviewed and tightened across **every** notification type.

## 2. Goals

- Persist each item request as a first-class row.
- Give warehouse RPs a dedicated **Requested Items** page (tab) to see and resolve requests for the warehouse(s) they are responsible for.
- Fold the request action into the dialog's main submit (remove the standalone "Send request" button).
- Produce a permission-classified map of every notification type, then move notification routing to a permission-driven model.

## 3. Non-goals

- **No catalog link** on requests. A free-typed "R410A gauge set" has no category/variant to attach; every listed request is by definition a not-stocked item.
- Phase 2 (routing rework of every notification type) is planned here but **sequenced after Phase 1** and after the operator signs off on the classification table.

---

## 4. Phase 1 — Requested Items

### 4.1 Data model — `warehouse_item_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `warehouse_id` | `uuid` NOT NULL | FK → `warehouses(id)`; the warehouse the request was sent to |
| `requested_by` | `uuid` | FK → `user_data(id)`; the requester |
| `requester_name` | `text` | Snapshot of requester `full_name` for display without a join |
| `dest_sub_container_id` | `uuid` NULL | FK → `warehouse_sub_containers(id)`; the team/custody the item is for |
| `dest_name` | `text` NULL | Snapshot of the destination name |
| `item_name` | `text` NOT NULL | Free-typed item |
| `qty` | `numeric` NOT NULL | `check (qty > 0)` |
| `notes` | `text` NULL | Requester note |
| `status` | `text` NOT NULL | `default 'pending'`, `check (status in ('pending','fulfilled','dismissed'))` |
| `resolved_by` | `uuid` NULL | FK → `user_data(id)` |
| `resolved_at` | `timestamptz` NULL | |
| `resolution_note` | `text` NULL | Optional note when fulfilling/dismissing |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

Indexes: `(warehouse_id, status)`, `(created_at desc)`.

**RLS** (enabled):
- **SELECT** — a user may read a request if they are a responsible person of `warehouse_id` (`warehouse_responsible_persons`) **or** a super-viewer/admin. Owners/accountants (super-viewers) and `is_system_admin` see all.
- **INSERT** — none for `authenticated`; rows are created only by `rpc_request_warehouse_item` (SECURITY DEFINER).
- **UPDATE** — none for `authenticated`; resolution goes through `rpc_resolve_item_request` (SECURITY DEFINER) so state changes stay guarded.

### 4.2 RPC — `rpc_request_warehouse_item` (rewrite)

Keep the signature `(p_warehouse_id, p_item_name, p_qty, p_dest_sub_container_id, p_notes)`. New body:

1. Validate (unchanged): signed-in, item name present, qty > 0, warehouse exists.
2. **Insert a `warehouse_item_requests` row** (snapshotting requester + dest names). This is the source of truth.
3. Insert **one actionable notification per current recipient** with `type = 'item_request'`, `related_id = <request id>`, `related_type = 'item_request'` (so it deep-links to the new tab).
4. Return the new request `id` (was: recipient count). The client hook is updated accordingly.

Phase-1 recipient rule: **warehouse RP(s) of `p_warehouse_id`** (unchanged audience, but now actionable + backed by a record). Broadening/narrowing is decided in Phase 2's classification.

### 4.3 RPC — `rpc_resolve_item_request` (new)

`(p_request_id uuid, p_status text, p_note text default null) returns void`, SECURITY DEFINER:
- Caller must be an RP of the request's warehouse or an admin/super-viewer, else raise.
- `p_status` ∈ `('fulfilled','dismissed')`.
- Set `status`, `resolved_by = current user`, `resolved_at = now()`, `resolution_note = p_note`.
- Mark the related `item_request` notifications `actioned_at = now()` so they leave everyone's Pending tab.

### 4.4 Page — Requested Items tab

- **Location:** a new tab on **Master Data → Warehouses**, alongside Overview / Transfers / Movements / Stock Value / Inventory Checks.
- **Scope:** a warehouse RP sees requests for the warehouse(s) they are RP of; owners/admins/super-viewers see all (enforced by RLS; the tab also honors the view permission).
- **Columns:** Item · Qty · Requested by · For (destination team) · Warehouse · Note · Requested (date) · Status · Actions.
- **Actions:** on `pending` rows — **Fulfill** and **Dismiss** (both call `rpc_resolve_item_request`, optional note). Resolved rows drop off the default (Pending) view but remain visible under the status filter as history.
- **Filters:** Warehouse (multi-select) · Status (Pending / Fulfilled / Dismissed / All, default Pending) · search box (item name / requester).
- **Responsive:** desktop table + mobile card list, consistent with the recent warehouse card pass.
- **Empty state:** "No requests" copy.

### 4.5 Dialog change — `CustodyAssignDialog`

- **Remove** the standalone **"Send request"** button in the "Need an item that isn't stocked here?" section.
- The dialog's **primary submit** now handles whatever is filled:
  - a selected in-stock item + qty → create the custody assign (existing path);
  - the item-needed name + qty → create the item request (`rpc_request_warehouse_item`);
  - both may be submitted in one action.
- Validation: the submit is enabled when **at least one** of the two is validly filled. Combined success toast reflects what was sent.

### 4.6 Permissions

- New keys: **`warehouse.item_requests.view`** (see the tab) and **`warehouse.item_requests.manage`** (resolve). Added to the permissions catalog under the Warehouse group and to `ACTIVE_PERMISSION_GROUPS` (warehouse module is branch-enabled).
- Backfill migration: grant `.view` + `.manage` to roles that already hold `warehouse.access` (and `is_system_admin` roles bypass anyway).

### 4.7 Migrations (mirrored to `supabase/migrations/` **and** `supabase/migrations-staging/`)

1. `…_warehouse_item_requests_table.sql` — table + indexes + RLS policies.
2. `…_rpc_request_warehouse_item_persist.sql` — RPC rewrite (insert row + actionable notification; return id).
3. `…_rpc_resolve_item_request.sql` — resolve RPC.
4. `…_warehouse_item_requests_permissions.sql` — permission keys + role backfill.

Apply to **staging** (`mwvblpgbgxipvrevkeff`) and **new-prod** (`optishfnnctrhffpoywg`), matching the current dual-target practice for this branch. Re-append the DB type helpers after `gen types`.

---

## 5. Phase 2 — Notification permission map + routing

### 5.1 Classification (draft — to be finalized with the operator)

Every type gets a **group** and a **required permission / recipient rule**. `*` = actionable (stays Pending until the workflow action is done).

| Group | Types | Recipient rule |
|---|---|---|
| **Purchase** | `po_approval_requested`*, `po_edit_request_pending`*, `receival_edit_request`* | users with the relevant approval permission |
| | `po_approved`, `po_rejected`, `po_edit_request_approved`, `po_edit_request_declined`, `receival_edit_response` | original requester only |
| **Sales** | `so_approved`, `so_rejected` | SO creator only |
| **Warehouse / Stock** | `transfer_pending`*, `transfer_dispatched`*, `stock_adj_pending`*, `inv_check_pending`* | RP(s) of the relevant warehouse |
| | `transfer_received`, `transfer_received_shrinkage`, `stock_adj_approved`, `stock_adj_rejected`, `inv_check_approved`, `inv_check_rejected` | the initiator |
| | `low_stock_alert` | warehouse RP / purchasing |
| **Operations** | `item_request`* | warehouse RP(s) (Phase 1) |
| **Master Data / Services** | `service_change_pending`* | service approvers |
| | `service_change_approved`, `service_change_rejected` | requester |
| **Finance / Credit** | `credit_group_pending`* | credit approvers |
| | `credit_group_approved`, `credit_group_rejected` | requester |

**Rule of thumb:** pending/approval requests → everyone holding the relevant permission; approved/rejected/received outcomes → the original requester only.

### 5.2 Routing model

- A single source of truth: `type → { group, feature_permission(s) }` (extend `notification-routes.ts` or a sibling map).
- **Recipients are derived from the feature permission, never a separate toggle.** A user receives a notification type **iff** their role holds the mapped feature permission — e.g. anyone with `purchase.orders.create` / `.edit` gets PO notifications; grant that permission and PO notifications turn on automatically, remove it and they turn off. There is **no** standalone "PO notifications" permission to manage. This holds uniformly for every group (Purchase, Sales, Warehouse, Operations, …), so routing stays clean and self-maintaining as roles change.
- A helper `getRecipientsForPermission(permission)` resolves profile ids from `user_custom_roles` / role permissions, replacing the ad-hoc recipient queries at each creation site.
- Migrate each of the ~8 client creation sites to route through the map. Longer-term (out of scope here): move notification creation into RPCs/triggers for consistency.

### 5.3 Deliverable

A finalized per-type table (exact permission key + recipients) the operator edits and signs off, **before** any routing code changes.

---

## 6. Testing

**Silent (agent-verified):** `tsc --noEmit`; `supabase db push --dry-run` per target; RLS present on the new table; RPC signatures + single overload; caller grep for the changed RPC return type.

**Operator smoke:**
- Create a request through the merged dialog submit (item-needed only; assign only; both together).
- As the warehouse RP, see it on the Requested Items tab; filter by warehouse/status/search.
- Fulfill and Dismiss; confirm it leaves Pending and the related bell notification auto-completes.
- Permission gating: a non-RP without `warehouse.item_requests.view` doesn't see the tab; RLS hides other warehouses' rows.
- Mobile card layout.

## 7. Decisions (resolved 2026-08-13)

1. **Phase-1 item-request recipients** — **keep the warehouse RP(s)**, now actionable and backed by a request record. Phase 2 may retarget via the permission map.
2. **Permission keys** — **`warehouse.item_requests.view`** (see the tab) and **`warehouse.item_requests.manage`** (resolve).
3. **Resolve mechanism** — **guarded `rpc_resolve_item_request`** (SECURITY DEFINER), not a direct RLS UPDATE policy.
