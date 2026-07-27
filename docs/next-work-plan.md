# Next Work — Structured Plan

**Source:** `docs/next work.docx` (Mohamed's brain-dump 2026-07-26)
**Method:** each item below is a discrete problem. We analyze → I ask clarifying questions if needed → we agree the fix → I implement → commit.

Legend: `☐` = not started · `🔍` = needs your input · `⚙️` = ready to implement · `✅` = done

---

## Section 1 — Table cleanup & schema review

Each row here is a table you want us to inspect. For each, we decide: keep / rename / drop / enum-ify.

| # | Table | Question / concern | Status |
|---|---|---|---|
| 1.1 | `activity_log` | ~~`ip_address`~~ dropped — was never populated; `performer_id` already identifies actor (`f6e3c8cb`) | ✅ |
| 1.2 | `approval_workflow_steps` | Both `step_key` (slug id, referenced by child approval rows) and `step_label` (human name, snapshotted for audit trail) are needed. Redundant with `role_id` in theory but the historical-snapshot pattern is intentional — **keep as-is** | ✅ |
| 1.3 | `bill_line_items` | ~~`team_name`~~ dropped — legacy from invoice_line_items, never written on AP bills (`4f7c70d0`). `match_status` + `match_note` are active (three-way-match feature). `match_status` logged for Pass 3 enum conversion | ✅ |
| 1.4 | `bills` | Dropped 5 dead cols (`bill_type`/`source`/`source_id`/`status`/`manually_paid`, `cb7b8bb2`). Follow-up (`4986263a`): dropped `tax` + `updated_at`; kept `pdf_url` + `needs_refresh` and wired real PDF cache (BEFORE-UPDATE invalidation trigger + `set_bill_pdf_url` RPC + generator cache-check). Kept: `source_label`, `receival_id`, `division_id`, `payment_status`, `paid_amount` | ✅ |
| 1.5 | `credit_notes` | `invoice_id` empty is legit (return-before-invoice case). Dropped 5 dead cols (`approved_by`/`phone`/`type`/`notes`/`created_by`) + added 3 FKs (`reason_id`→reason_lists, `customer_id`→customers, `refund_method_id`→payment_methods) with backfill + sync triggers (`5f756722`). PDF now derives phone via customer FK. `refund_method`/`refund_reference` were both active (kept) | ✅ |
| 1.6 | `custom_roles` | ~~`description`~~ dropped from schema + 3 UI touchpoints (RoleFormDialog, UserRoleDialog, users/page) + `add_workflow_step` RPC slimmed (`dff4bd9a`) | ✅ |
| 1.7 | `customer_invoices` (view over `so_invoices`) | Dropped 5 dead cols from `so_invoices`: `tax`, `sale_delivery_id`, `updated_at`, `manually_paid`, `phone_id`. Compat view recreated; `get_customer_pending_balances` RPC rewritten (also fixed stale `invoices` table ref post-rename); phone-grouped UI collapsed to flat list; test reworked (`df35737d`) | ✅ |
| 1.8 | `debit_note_lines` | Column is `unit_price` (supplier-price snapshot), NOT `unit_cost`. Multi-receival FIFO cost is handled correctly on `inventory_stock_movements.unit_cost` via `rpc_process_po_return_dispatch` → `deduct_fifo_layers`. Only dead col was `bill_line_id` (never wired) — dropped (`5a2d9b00`) | ✅ |
| 1.9 | `debit_notes` | `bill_id` empty is legit (return-before-bill). Dropped 5 dead cols (`approved_by`/`phone`/`type`/`notes`/`created_by`) + added 2 FKs (`reason_id`→reason_lists, `supplier_id`→suppliers) with backfill + sync trigger (`e450163f`). PDF now derives phone via `suppliers` join. `debit_notes_invalidate_pdf_cache_fn` also rewritten to drop OLD.notes reference. Mirror of Section 1.5 pattern | ✅ |
| 1.10 | `fifo_cost_layers` | Added polymorphic `source_id` uuid; backfilled from `inventory_stock_movements.reference_id`. `rpc_process_return_restock` + `apply_adjustment` rewritten to set `source_id` on new layers. FifoLayersTable adds `sale_return` + `po_return` cases (`4f6fa59e`) | ✅ |
| 1.11 | `inventory_categories` | ~~`description`~~ dropped — was written by edit dialog but no downstream reader (`021ab56b`). `updated_at` kept for audit trail | ✅ |
| 1.12 | `inventory_check_assignments` | State machine `pending → in_progress → completed` was designed but middle transition was never wired. Extended `save_inventory_check_item_count` RPC to idempotently flip pending → in_progress + stamp `started_at` + insert `user_started` log event on first count-save (`63c9ca62`) | ✅ |
| 1.13 | `inventory_check_items` | Find redundant columns | ☐ |
| 1.14 | `inventory_checks` | Many columns are always empty — audit and remove | ☐ |
| 1.15 | `inventory_check_assignments` | Table clean; activated 2 declared-but-unwired columns instead of dropping. Added set_updated_at trigger; surfaced `started_at` in the 3 assignment-header slots — "Started …" while in_progress, "Completed …" when done (`40591ab9`) | ✅ |
| 1.16 | `inventory_check_approvals` | `step_role` was populated but never checked — Approve/Reject on the check page had no role gate. Added `canActOnStep` mirror of stock-adj dialog; retyped `step_role` from stale enum to string; removed the `unknown` cast in useCompleteAssignment (`f29c0ebc`) | ✅ |
| 1.17 | `inventory_check_log` | Latent 1.12 bug: `event_type` enum missing `user_started` — every counter's first saveCount errored out silently since 1.12 shipped. One-line ALTER TYPE ADD VALUE fix (`39f9269f`) | ✅ |
| 1.18 | `stock_adjustments` | Dropped 3 dead cols (`deleted_at` / `created_by` / `approved_by`) + rewrote `action_stock_adjustment_step` / `create_stock_adjustment_v2` / `apply_inventory_check_adjustments` to stop writing them + deleted unused `useCreateStockAdjustment` hook. `WhAdjustmentsTab` inline Approve/Reject bypass flagged for 1.19 | ✅ |
| 1.19 | `WhAdjustmentsTab` inline Approve/Reject bypass | Tab renders inline Approve/Reject buttons gated only by warehouse-RP membership. They call `approve_stock_adjustment_inventory` / direct `.update({status:'rejected'})` and **skip the entire `stock_adjustment_approvals` chain** — defeating the strict role gating added in `20260726140000`. Decide: keep as intentional chain-less-warehouse fallback, remove entirely, or add a "no chain configured" guard | ☐ |
| 1.20 | *(more tables)* | You'll review the rest and add here later | ☐ |

---

## Section 2 — FIFO & COGS scenario verification

You gave two scenarios. We'll code up test data on staging and verify current behavior matches expected. If it doesn't, we fix the RPCs.

### Scenario A — Sale draws from a single layer

**Setup:**
- Item 1, Receival 1: received 100, remaining 5, price 10
- Item 1, Receival 2: received 100, remaining 100, price 12

**Action:** SO for Item 1 × 10 units, delivered.

**Expected FIFO after:**
- Receival 1: remaining 0, price 10
- Receival 2: remaining 95, price 12

**Expected COGS (2 rows for the SO):**
- Item 1 sold 5, cost 10
- Item 1 sold 5, cost 12

**Task:** run this on staging; confirm `fifo_cost_layers` and `cogs_entries` end up as above.

Status: 🔍 (need your OK to run test data on staging)

---

### Scenario B — Sale return spans two receivals

**Setup:**
- Item 1, Receival 1: received 100, remaining 5, cost 12
- Item 1, Receival 2: received 100, remaining 100, cost 14

**Action:** SO sells Item 1 × 10 units (draws from both receivals). Average sale price given to customer. Then customer returns 8 units.

**Question:** in FIFO, how are the 8 returned units placed back? Which receival gets credit, and at what cost?

**Task:** trace what the return RPC does today, document it, decide if it matches your expectation. If not, propose a fix.

Status: 🔍 (need your rule: proportional split? LIFO into most-recently-consumed layer? Something else?)

---

## Section 3 — Enum conversions (Pass 3 continuation)

- `stock_adjustments.status` → enum
- `stock_adjustments.adjustment_type` → **already done** (`2275e621`, `20260726070000`) ✅
- Full-table scan: run through every remaining text column and flag Pass 3 candidates

Status: ⚙️ `stock_adjustments.status` is ready to do — small.

---

## Section 4 — Feature: Temporary Warehouse

**Requirement:**
- Ability to create a **temp warehouse** where a set of items is transferred (e.g. for a site job).
- When items are installed / consumed on site, user must submit **confirmation images or bills** to close out the temp warehouse.

**Open questions:**
- Is a temp warehouse just a flag on the `warehouses` table (`is_temporary`, `parent_warehouse_id`, `closes_at`), or a separate model?
- Is the "confirmation" a new table like `temp_warehouse_closeout` with photo/bill attachments?
- Does it auto-return unconsumed items to source warehouse when closed?

Status: 🔍 (needs design conversation)

---

## Section 5 — Feature: Multi-division warehouses + containers

**Requirement:**
- A warehouse can span **multiple divisions**.
- Inside each warehouse, we can create a **container per division** and upload the container's data.
- **Access rules:**
  - Warehouse RP (responsible person) can see **all** division containers in their warehouse.
  - A user with only one division's access, when viewing that warehouse, sees **only their division's container**.

**Open questions:**
- Is "container" a new table, or a re-use of `warehouse_zones` / similar?
- Does existing `warehouses` need a `divisions` link table (many-to-many)?
- RLS policy for division-scoped visibility on containers — we'll write this after the schema is agreed.

Status: 🔍 (needs design conversation)

---

## Section 6 — Warehouse Transfers cleanup

- **Remove `unit_cost`** — already recorded on `inventory_stock_movements`, no need to duplicate.
- **Remove "receive less qty"** option — if a transfer is sent, it must be received in full.
- **Add shrinkage tracking:**
  - `shrinkage_qty` column
  - `shrinkage_reason` column (enum? we should decide the list)

Status: ⚙️ (ready to implement — small migration + form change)

---

## Section 7 — Feature: Reorder point v2 (spike-aware)

**Current problem:** the reorder point can be blown through by a sudden spike in sales.

**Requirement:** improve so a sudden spike doesn't leave us short.

**Open questions / options to discuss:**
- Rolling 7-day / 14-day sales rate instead of flat monthly average?
- Lead-time × max-daily-consumption formula (traditional safety stock)?
- Add a "safety multiplier" the user can set per item?

Status: 🔍 (needs design conversation — I'll draft the formula options once you pick one)

---

## Section 8 — MMS Services review

- Review "Services" — are they consuming inventory correctly?
- For each item consumed by a service, check the cost is correct.
- Extract data: **per team**, how much of each item was consumed from inventory?

Status: 🔍 (probably a report/dashboard, not a code change — confirm what the deliverable looks like)

---

## Section 9 — Receival process audit

- How does the receiving team confirm receival quantities today?
- Document the current process.
- Suggest improvements.

Status: 🔍 (I'll trace `useReceivals` + the receival UI and write it up; you review)

---

## Section 10 — Inventory stock movement fix

**Rule:** when a movement pulls from **multiple receivals**, the current single-row movement with one `unit_cost` is wrong. It should create **one movement row per receival** because each has its own cost.

Status: ⚙️ (needs a code change in whatever writes `inventory_stock_movements` for multi-layer draws — I'll investigate and propose)

---

## Section 11 — QuickBooks-style accounting report

**Deliverable:** one report that includes:
- Adjustments
- Scraps
- Exchange rate loss/gain
- Purchase
- Sale orders
- Landed cost
- **Manual item usage** — with: **who** used it, **which division**, **date/time**, **qty**

Status: 🔍 (this is a report page — needs a mockup discussion first)

---

## How we'll work through this

I suggest this order:

1. **Section 1 (table cleanup)** — do these together, table by table. Fast wins, most only need a schema look.
2. **Section 3 (`stock_adjustments.status` enum)** — quick, do it while Section 1 is in flight.
3. **Section 6 (warehouse transfers cleanup)** — small, high value.
4. **Section 10 (multi-receival stock movement fix)** — data correctness bug, prioritize.
5. **Sections 2 (scenarios)** — verify FIFO/COGS. Any bug found here becomes its own fix.
6. **Section 8, 9 (audits)** — read-only, can happen in parallel.
7. **Section 4, 5, 7, 11 (features)** — bigger design conversations, tackle one at a time in that order.

Where do you want to start? My recommendation: **Section 1**, row by row — quickest to close, and it'll surface any hidden landmines before we touch the bigger features.
