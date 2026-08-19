# 02 · Purchase & Sales

Top nav: **Purchase & Sales** — dropdown gated by `purchase_sales.access`.
Four groups: **Vendors & Clients**, **Purchase**, **Sales**, **Logistics & Reports**.

> **Cost-gate scope:** Purchase & Sales is **out** of the operational Show-costs
> scope (operator, 2026-08-19) — these pages are inherently financial, so *View*
> = see the money, as today. The **Show costs** column is therefore `—` here.
> Gaps (missing catalog keys, dead routes, one cost leak) are still flagged.

Almost every "in-page tab" in this section is a **status filter chip row**
(All / Pending / … ), not a permissioned tab — noted as *filter*, not a
permission node. View is enforced at the **route** level; the list pages
themselves mostly don't re-check. Legend as in [README](README.md).

---

## Group: Vendors & Clients

| Page → node | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Suppliers** — `/master-data/suppliers` | `master_data.suppliers.view` | `master_data.suppliers.create` · `.manage` | — (shows credit balance) | No in-page tabs. **Money:** per-currency credit balance. Edit not gated in-page. |
| **Customers** — `/master-data/customers` | `master_data.customers.view` | `master_data.customers.create` · `.manage` · `.change_credit_group` · `.change_type` | — (credit used / we-owe) | No tabs. **Money:** credit used, we-owe balances. Edit button gated by `…customers.manage`. |

---

## Group: Purchase

| Page → node | View | Manage / actions | Show costs | Notes |
|---|---|---|---|---|
| **Purchase Orders** — `/purchase/orders` | `purchase.orders.view` | `purchase.orders.create` · `.manage` (edit) | — | *Filter:* All/RFQ/Draft/Confirmed + status/supplier/date. Sub-routes `/purchase/create-po`, `/purchase/edit-po/[id]`. `PoDetailDialog` has its own **tabs**: Line Items · Receivals · Receive · Payments · Bills · Activity · Returns · Quotes · Exchange. **Money:** totals, unit/line price, receival unit cost, payments. |
| **Approvals** — `/purchase/approvals` | `purchase.approvals.view` | act = server-side role slots; `purchase.approvals.bypass` (Owner force) · `purchase.approvals.chain.manage` (chains → in Admin) | — | Not tabs — Pending / Completed sections. **Money:** PO total, line totals w/ FX. |
| **Receivals** — `/purchase/receivals` | `purchase.receivals.view` | `purchase.receivals.create` · `.manage` | — | *Filters:* Status (All/Approved/Rejected), Source (All/Purchase/Inventory). Edit-approval via approval-slot role. **Money:** total value, unit cost. |
| **Bills** — `/purchase/bills` | `purchase.bills.view` | `purchase.bills.manage` (attachments) | — | *Filter:* payment status. Sub-route `/purchase/bills/[id]` (PDF). **Money:** AP total, amounts. |
| **Returns** — `/purchase/returns` | `purchase.returns.view` | `purchase.returns.create` · `.manage` | — | *Filter:* status. **Money:** none (qty/condition; currency label only). |
| **Debit Notes** — `/purchase/debit-notes` | `purchase.debit_notes.view` | *(no create/edit key — read + detail only)* | — | *Filter:* status. **Money:** debit total, new PO total. |
| **Aging Report** — `/purchase/aging-report` | ⚠️ `purchase.bills.view` (shared) | — | — | **No dedicated key** — piggybacks Bills. **Money:** full AP aging buckets. Add `🆕 purchase.aging.view`? |
| **Supplier Payments** — `/purchase/payments` | ⚠️ `purchase.payments.view` (**inert**) | `purchase.payments.record` · `.manage` (edit/delete) | — | **No page exists** — route reserved, no `page.tsx`, no nav item. Payments live inside PO / Bill dialogs. `…payments.view` gates nothing. |

---

## Group: Sales

> `SoLineItemsEditor` deliberately **never renders unit/avg cost** on a sale
> order (cost kept only for the server-side below-cost margin guard). So Sales
> mostly exposes *selling price* + totals, not cost — except one leak below.

| Page → node | View | Manage / actions | Show costs | Notes |
|---|---|---|---|---|
| **Sale Orders** — `/sales/orders` | `sales.orders.view` | `sales.orders.create` · `.manage` (edit) | — | *Filters:* search/status/customer/date/delivery. Sub-routes `/sales/create-so`, `/sales/edit-so/[id]`. `SoDetailDialog` → line selling price, totals, payments (`SoPaymentDialog`). **Money:** total, paid/outstanding. |
| **Approvals** — `/sales/approvals` | `sales.approvals.view` | `sales.approvals.manage` (act; server-side) · `useIsOwner` (force) | — | ⚠️ **Cost leak:** below-cost lines show "unit QAR X < avg cost QAR Y" — the one place avg **cost** is exposed on the sales side, ungated. |
| **SO Invoices** — `/sales/invoices` | `sales.invoices.view` | `sales.invoices.create` · `.manage` | — | *Filter:* payment status. Sub-route `/sales/invoices/[id]` (PDF). **Money:** amount, AR total. |
| **Returns** — `/sales/returns` | `sales.returns.view` | `sales.returns.create` · `.manage` | — | *Filter:* status. **Money:** none (qty/condition). |
| **Deliveries** — `/sales/deliveries` | `sales.deliveries.view` | `sales.deliveries.create` · `.manage` | — | *Filter:* status. **Money:** none. |
| **Credit Notes** — `/sales/credit-notes` | `sales.credit_notes.view` | `sales.credit_notes.create` · `.manage` | — | *Filter:* status. **Money:** amount, new total. |
| **Customer Statement** — `/sales/customer-statement` | ⚠️ `sales.invoices.view` (shared) | — | — | **Real tabs:** Open Orders / All Orders. **No dedicated key.** **Money:** order value / paid / outstanding. Add `🆕 sales.customer_statement.view`? |
| **Aging Report** — `/sales/aging-report` | ⚠️ `sales.invoices.view` (shared) | — | — | **No dedicated key.** **Money:** AR aging buckets. Add `🆕 sales.aging.view`? |
| **Customer Payments** — `/sales/payments` | ⚠️ `sales.payments.view` (**inert**) | `sales.payments.record` · `.manage` | — | **No page** — dialog-only (from SO / Invoice detail). `…payments.view` gates nothing. |

---

## Group: Logistics & Reports

| Page → node | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Shipments** — `/purchase/shipments` | `purchase.shipments.view` | `purchase.shipments.create` · `.manage` | — | *Filter:* Active / Archived. **Money:** none (tracking only). |
| **Landed Costs** — `/purchase/landed-costs` | `purchase.landed_costs.view` | `purchase.landed_costs.create` · `.manage` | — | No tabs. **Money:** heavy — LC totals, cost lines w/ FX, per-unit allocations, apply-to-inventory preview. |
| **Dead Stock Report** — `/purchase/dead-stock` | `purchase.dead_stock.view` | — | — | *Filter:* All/Slow/At-Risk/Dead (stat cards are filters). **Money:** stock value per item. |

---

## Section gaps & proposed keys

- ⚠️ **Missing catalog keys** (pages piggyback on another key): Purchase Aging
  (`purchase.bills.view`), Sales Aging + Customer Statement (`sales.invoices.view`).
  Add dedicated grantable keys if you want to grant them independently.
- ⚠️ **Inert payment `.view` keys** — `purchase.payments.view` /
  `sales.payments.view` gate nothing (no page). Either build the pages or drop
  the keys; keep `.record` / `.manage` (they gate the dialog actions).
- ⚠️ **Debit Notes** has no create/edit key (read-only surface by design).
- ⚠️ **Sales Approvals avg-cost leak** — the only sales-side cost exposure; in
  scope only if the P&S cost decision changes.
- **Action gating is thin** — most create/edit buttons rely on route guards +
  presence, not in-page `PermissionGate`; the `.create`/`.manage` keys mainly
  gate the create/edit *routes* and a few dialog actions.
