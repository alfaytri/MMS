# Permission Layout — MMS

**Purpose.** A complete, reviewable map of the whole app's navigation → pages →
in-page tabs, with the permission **tiers** each node should carry. It exists so
the operator can decide, per node, **who can see it, who can change it, and who
can see the money on it**.

**Status:** IMPLEMENTED 2026-08-19 — all five phases wired (see
[Implementation plan](#implementation-plan)). `tsc`/`eslint` clean; committed in
logical chunks; **held for operator smoke, not pushed.** Hide-by-default: grant
the new `*.cost.view` / `inventory.pricing.view` keys to the roles that should
see money.

---

## How permissions actually work here (3 layers)

A single grantable permission key flows through three files. To add or change a
permission you usually touch all three:

| Layer | File | Role |
|---|---|---|
| **Grantable catalog** | [`PermissionTree.tsx`](../../src/components/master-data/PermissionTree.tsx) → `NAV_TREE` | The list of tickable permissions shown in the **Role editor**. This is the source of truth for what a role *can be granted*. Written to `custom_roles.permissions`. |
| **Nav visibility** | [`nav-config.ts`](../../src/components/layout/nav-config.ts) → `NAV_ITEMS` | Which top-nav entries/pages a user *sees*. Each item's `permission` hides/shows it. Hiding only — it never blocks a typed URL. |
| **Route enforcement** | [`route-permissions.ts`](../../src/lib/route-permissions.ts) → `ROUTE_PERMISSIONS` | The real gate. `RoutePermissionGuard` blocks direct navigation to a path unless the user holds the mapped permission. |

> `src/lib/permissions.ts` (`PERMISSION_GROUPS`) is **vestigial** — consumed only
> by tests. Editing it changes nothing in the UI. Ignore it.

**Cost gating is different.** Hiding *money* is not a route gate — the page still
opens, but QAR figures are suppressed. That needs (1) a grantable `*.cost.view`
key in `NAV_TREE`, and (2) a `canSeeCost` check in the page component that hides
every money surface when the user lacks it. **Consumption already does exactly
this** (`consumption.cost.view` → `canSeeCost` hides unit cost / COGS / totals) —
it is the reference implementation for every other operational page.

---

## The three tiers

Every leaf node (a page or an in-page tab) is described with up to three tiers:

- **View** — open the page/tab and see its non-financial content (lists,
  quantities, statuses, names).
- **Manage** — create / edit / act (the write actions on that surface). Some
  areas split this into `.create` / `.edit` / `.record` / `.approve`; those are
  noted per node.
- **Show costs** — see the money on that surface (QAR values, unit/avg cost,
  COGS, totals, stock value). **Operational pages only** (operator decision,
  2026-08-19). A user with *View* but not *Show costs* sees the page with money
  suppressed.

`nav > page > page-tab` is the layout shape — exactly like the **Warehouses**
node in `NAV_TREE` today, where each in-page tab (Stock Overview, Transfers,
Adjustments, Inv. Checks, Stock Value, Movements, Receivals …) is its own child
with its own View/Manage keys. That pattern is the template for the whole tree.

---

## "Show costs" — scope decision (locked 2026-08-19)

Applied to **operational pages only**. Purchase & Sales and Reports keep their
current model (view = see everything; they are inherently financial). Picture
Transfer shows no money at all, so it needs no cost gate.

| Operational page | Money surface | Cost gate today | Proposed |
|---|---|---|---|
| **Consumption** | unit cost, COGS, line/total | ✅ `consumption.cost.view` | **reuse** (reference impl) |
| **Custody** | team QAR totals, held-item values | ❌ none | **new `custody.cost.view`** |
| **Damaged Stock** | weighted unit cost, "Weighted Cost" | ❌ none | **new `damaged_stock.cost.view`** |
| **Tools & Assets** | minimal today (scrap → P&L is downstream) | ❌ none | **new `tools.assets.cost.view`** (consistency + future) |
| **Warehouse** (Master Data) | stock value, unit costs, movements | ⚠️ partial (`warehouse.stock_value.view` = valuation tab only) | **see [01-master-data](01-master-data.md)** — extend cost coverage across the cost-bearing tabs |
| **Transfer** (Picture) | none | n/a | none needed |

The default posture: a field user gets `custody.view` (+ their per-warehouse
custody access) and posts/consumes normally, **without** `*.cost.view`, so they
never see the money. Accounting/managers get the `*.cost.view` keys.

---

## Cross-cutting gaps found during the audit

These are surfaced here and detailed in the section files:

1. **Ungated report pages.** Financial Dashboard (`/reports/dashboard`) and
   Product Profitability (`/reports/product-profitability`) render revenue /
   COGS / margin / cash **with no permission check at all** — anyone who can
   reach the URL sees them. (Route map does gate `/reports/*`, but these two
   pages hold no per-report key of their own beyond the broad `reports.view`.)
   See [04-reports](04-reports.md).
2. **Dead payment routes.** `purchase.payments.view` and `sales.payments.view`
   exist as keys but **gate nothing** — there is no Supplier/Customer Payments
   page; payments live only inside PO/Bill/SO/Invoice dialogs (edit/delete gated
   by `*.payments.manage`, record by `*.payments.record`). The `.view` keys are
   inert.
3. **Pages missing from the grantable catalog.** Purchase **Aging Report**,
   Sales **Aging Report**, and **Customer Statement** are live pages but have no
   dedicated `NAV_TREE` key — they piggyback on `purchase.bills.view` /
   `sales.invoices.view`.
4. **Cost leak on Sales Approvals.** `/sales/approvals` shows avg cost on
   below-cost lines ("unit QAR X < avg cost QAR Y") to anyone who can open the
   page. In-scope only if the P&S cost decision changes later — noted for
   awareness.
5. **Nav access is not mobile-specific.** The mobile drawer (`MobileNavDrawer`)
   and desktop (`NavDropdown`) render from the SAME `NAV_ITEMS` with identical
   permission logic. The real "missing access" cause: a top-nav dropdown shows
   only when the user holds its `*.access` key **AND** has ≥1 visible child — so
   granting a page key (e.g. `custody.view`) WITHOUT the dropdown key
   (`operations.access`) hides the whole dropdown on both surfaces. Plus several
   real pages aren't in `NAV_ITEMS` at all (the dead/uncatalogued routes).
   Proposed fix: show a dropdown when the user holds the `*.access` key **or**
   any accessible child.

---

## Section files

The layout, laid out `nav → page → in-page tab` with the tiers per node:

- [01-master-data.md](01-master-data.md) — Inventory, Warehouses (+ its tabs), Users & Roles, Audit, Admin
- [02-purchase-and-sales.md](02-purchase-and-sales.md) — Vendors & Clients, Purchase, Sales, Logistics & Reports
- [03-operations.md](03-operations.md) — Custody, Consumption, Damaged Stock, Tools & Assets ← **cost-gate focus**
- [04-reports.md](04-reports.md) — the 9 report pages
- [05-transfer.md](05-transfer.md) — Picture Transfer

---

## Implementation plan (doc → then implement)

**Scope (confirmed 2026-08-19): all four tracks + completeness + nav.** Operator
asked for: (1) operational cost gates, (2) wire the inventory pricing gate,
(3) gate the two ungated report pages, (4) fix the admin/catalog gaps — PLUS
**every node carries View + Manage (+ Show costs where money shows)**, PLUS the
nav-access fix (gap 5 above).

> **⚠️ Rollout caveat.** Turning on a cost gate *hides* money from everyone who
> lacks the new `*.cost.view` key. Roles that see cost today will lose it until
> re-granted — except `system.admin` (Owner), which bypasses every check. So the
> wiring phase needs a backfill-vs-hide-by-default decision.

Phasing (each phase verified `tsc`/`eslint`, held for smoke, no push without ask):

- **Phase 1 — catalog (safe, inert):** add all new grantable keys to `NAV_TREE`
  (the `*.cost.view` keys; `warehouse.item_requests.view`; dedicated keys for
  Aging ×2 / Customer Statement / Custody Locations / Repair Vendors) and fill
  in missing `.manage` keys so every node has View + Manage (+ Show costs). Keys
  are inert until wired → breaks nothing.
- **Phase 2 — cost wiring:** `canSeeCost` suppression on Custody → Damaged Stock
  → Tools → Warehouse (Stock Overview/Movements) → Inventory pricing. (Needs the
  rollout decision.)
- **Phase 3 — report gates:** gate `/reports/dashboard` + `/reports/product-profitability`.
- **Phase 4 — admin enforcement:** per-sub-page route guards for `/master-data/admin/*`.
- **Phase 5 — nav-access fix:** show a dropdown when the user holds its `*.access`
  key OR any accessible child (fixes the mobile/desktop "missing access" trap).

Once this layout is approved, the steps in detail:

1. **New grantable keys** in `NAV_TREE` — the operational `*.cost.view` keys
   (`custody.cost.view`, `damaged_stock.cost.view`, `tools.assets.cost.view`)
   under their respective nodes, plus catalog rows for the un-cataloged pages
   (Aging ×2, Customer Statement) so they're grantable.
2. **Wire `canSeeCost`** in each operational page — mirror the Consumption
   pattern: `const canSeeCost = useHasPermission('<area>.cost.view')`, then hide
   every QAR surface behind it. Custody first (biggest gap), then Damaged Stock,
   then Tools, then the Warehouse cost tabs.
3. **Close the report gaps** — gate `/reports/dashboard` +
   `/reports/product-profitability` on their own keys.
4. Migrations only if a server RPC must stop returning cost to non-holders;
   most of this is client-side suppression + the catalog keys.

Nothing ships without operator smoke + an explicit push, per the standing rule.
