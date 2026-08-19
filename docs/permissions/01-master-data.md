# 01 · Master Data

Top nav: **Master Data** — dropdown gated by `master_data.access`.

Legend: **View** / **Manage** / **Show costs** as in [README](README.md).
`🆕` proposed · `✅` exists+works · `⚠️` exists but dead/gap · `—` n/a.

> **Cost-gate note:** Master Data is **not** in the operator's operational
> Show-costs scope. But two Master-Data surfaces show money and one already has a
> (dead) cost key — flagged below so you can decide whether to fold them into the
> cost-gating work.

---

## Inventory — `/master-data/inventory`
Route guard: `inventory.catalog.view`. (Thin wrapper → `InventoryTab.tsx`.)

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Inventory page** | `inventory.catalog.view` | `inventory.catalog.manage` | ⚠️ `inventory.pricing.view` | **Key exists but is DEAD** — never consumed; avg cost + selling price render unconditionally. Wire it to gate cost, or drop it. |
| ↳ Products / Spare Parts / Consumables / Tools & Assets | inherits | inherits | ⚠️ inherits | Item-**type** sub-tabs (a filter), not separately permissioned. |
| ↳ Inventory Pricing | `inventory.pricing.view` ⚠️ | `inventory.pricing.manage` ⚠️ | — | Both keys defined in `NAV_TREE`; **neither is read anywhere**. This is the natural home for the inventory cost gate. |
| ↳ Category Attributes | `master_data.inventory.attributes.view` ✅ | `master_data.inventory.attributes.manage` ✅ | — | Wired (gates the Attributes tab + editing). |

**Money surfaces:** variant `average_cost` + `selling_price` (QAR), item weighted
avg cost, FIFO cost layers. **Recommendation:** if you want inventory cost hidden
too, wire the existing `inventory.pricing.view` (no new key needed).

---

## Warehouses — `/master-data/warehouses`
Route guard: `warehouse.access`. Page-level keys also: `purchase.warehouses.view`
/ `.manage` (legacy aliases), `warehouse.responsible_person` (assignable RP).
**This is the `nav > page > tab` template** — each tab is its own child key.

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Warehouses page** | `warehouse.access` | — | see per-tab | Tabs computed from `TAB_PERMISSIONS` (any-of, no admin bypass). |
| ↳ Warehouses | `warehouse.warehouses.view` | `warehouse.settings.manage` | — | Physical warehouse list; edit, assign RPs, reorder points. |
| ↳ Stock Overview | `warehouse.stock.view` | — | 🆕 `warehouse.cost.view` | **Money:** `avgCost`, `totalValue`. Inner item-type filter (All/Products/…). |
| ↳ Transfers | `warehouse.transfers.view` | `warehouse.transfer.create` · `.dispatch` · `.receive` · `.approve` · `.simple` | — | The picture-transfer key `.simple` also drives the top-level Transfer nav. |
| ↳ Adjustments | `warehouse.adjustments.view` | `warehouse.adjustment.request` | — | — |
| ↳ Inv. Checks | `warehouse.checks.view` | `warehouse.check.count` · `warehouse.check.create` | — | — |
| ↳ Stock Value | `warehouse.stock_value.view` ✅ | — | ✅ *is* the cost gate | **Money:** value, avgCost, COGS, unit_cost, landed_cost/unit + COGS dialogs. This tab is inherently financial — its view key already acts as its cost gate. |
| ↳ Movements | `warehouse.movements.view` | — | 🆕 `warehouse.cost.view` | **Money:** movement cost/value columns. |
| ↳ Receivals & Deliveries | `warehouse.receivals.view` | — | — | Summary; qty-oriented. |
| ↳ Requested Items | `warehouse.item_requests.view` ⚠️ | — | — | **Tab key NOT in `NAV_TREE`** — not grantable in the role editor. Add it. |
| ↳ Projects | `warehouse.projects.view` | `warehouse.projects.manage` | — | Custody projects → discipline buckets + milestones. |

**Warehouse cost proposal:** add `🆕 warehouse.cost.view` to hide the cost/value
columns on **Stock Overview + Movements** (so a user can see quantities without
avg cost/value). The **Stock Value** tab stays gated by its own
`warehouse.stock_value.view` (it *is* the valuation surface).

---

## Users & Roles — `/master-data/users`
Page wrapped in `PermissionGate` any-of `master_data.users.view` / `.roles.view`.

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Users & Roles page** | `master_data.users.view` OR `master_data.roles.view` | — | — | No money anywhere. |
| ↳ Permissions | inherits | — | — | Renders the `PermissionTree` (this catalog). |
| ↳ Roles | `master_data.roles.view` | `master_data.roles.create` · `master_data.roles.manage` | — | **Gap:** New/Edit/Delete-role buttons aren't individually permission-gated in-page. |
| ↳ Users | `master_data.users.view` | `master_data.users.create` · `master_data.users.manage` | — | **Gap:** Add/Edit/Reset controls not individually gated in-page. |

---

## Audit Trail — `/master-data/audit-trail`
Route guard: `master_data.audit.view`. No tabs, no money. (No in-page
`PermissionGate` wrapper — relies on the route guard only.)

| Node | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Audit Trail** | `master_data.audit.view` | — | — | Filter bar (search / date / module) → timeline. |

---

## Admin — `/master-data/admin`
Route guard: **`master_data.admin.view` covers the ENTIRE subtree.** Left-sidebar
sub-pages (`AdminSidebar`); each sidebar link has a finer nav permission that
**only hides the link** — a user with `master_data.admin.view` can still reach
every sub-page by direct URL. **This is the main Admin gap.**

| Node (page → sub-page) | View (should-be) | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Admin shell** | `master_data.admin.view` | `master_data.admin.manage` | — | Redirects to Companies. |
| ↳ Companies & Divisions | `master_data.companies.view` | `master_data.companies.create` · `.manage` · `master_data.divisions.*` | — | Route only checks `admin.view`. |
| ↳ Warehouses (setup) | `master_data.warehouses.view` | `master_data.warehouses.create` · `.manage` | — | Sidebar-gated `…warehouses.manage`; **URL-reachable with only admin.view**. |
| ↳ Custody Locations | (uses `master_data.warehouses.manage`) | same | — | **No own grantable key** — add one. URL-reachable with admin.view. |
| ↳ Repair Vendors | (uses `master_data.warehouses.manage`) | same | — | **No own grantable key** — add one. |
| ↳ Credit Groups | `master_data.admin.view` | — | 🆕 (money) | **Money:** credit limit (QAR). |
| ↳ Credit Group Approvals | `master_data.customers.view` (nav) | — | 🆕 (money) | **Money:** requested credit limit. URL-reachable with admin.view. |
| ↳ Reason Lists | `master_data.admin.view` | — | — | Config CRUD. |
| ↳ Warranty Policies | `master_data.admin.view` | — | — | Config CRUD. |
| ↳ Payment Methods | `master_data.admin.view` | — | — | Config CRUD. |
| ↳ Currencies | `master_data.admin.view` | — | — | Exchange-rate config. |
| ↳ Country Codes | `master_data.admin.view` | — | — | Config CRUD. |
| ↳ PO Approval Bands | `purchase.approvals.chain.manage` (nav) | same | — | **Money:** amount-tier thresholds. URL-reachable with admin.view. |
| ↳ Approval Workflows | `master_data.admin.view` | — | — | Role-per-step config (PO / inv-check / stock-adj / sales). |

**Also within Master Data but no page (dead route guards):** `/master-data/services`,
`/master-data/services/approvals`, `/master-data/service-customers`, top-level
`/master-data/credit-groups` — guards exist in `route-permissions.ts` with no
implemented page (only `/master-data/admin/credit-groups` exists). Their catalog
keys (`master_data.services.*`, `master_data.service_customers.*`) are grantable
but lead nowhere.

---

## Section gaps & proposed keys

- ⚠️ **`inventory.pricing.view/.manage` are dead** — wire or drop.
- 🆕 **`warehouse.cost.view`** — hide cost/value on Stock Overview + Movements.
- ⚠️ **`warehouse.item_requests.view`** — used by the Requested Items tab but **not in `NAV_TREE`**; add it so it's grantable.
- ⚠️ **Admin enforcement gap** — the `/master-data/admin/*` subtree needs
  per-sub-page route guards (not one blanket `master_data.admin.view`), and
  Custody Locations + Repair Vendors need their own grantable keys.
- ⚠️ **Dead Master-Data routes** — services / service-customers / top-level
  credit-groups guards without pages.
