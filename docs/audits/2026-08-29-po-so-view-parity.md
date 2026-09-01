# PO / SO Detail-View ↔ Standalone-Page Parity Audit

> 2026-08-29. Read-only audit. Goal: every action available inside the **PO/SO
> detail view** tabs should also be doable on the matching **standalone page**
> (and note the reverse). Nothing changed — this is the "what we need to do" list.

## 0. Your exemplar ("free receive") — actually NOT missing

The standalone **Receivals page can already create free receivals** — same as the
PO Receive tab:
- Per-line free qty (the gift popover): `ReceivalFormDialog.tsx:194-230` → `is_free`.
- Non-PO free item ("Add Free Item"): `ReceivalFormDialog.tsx:668` → `NonPoFreeItemDialog`.
- A purely-free receival (zero paid) is allowed (`:460`, `:770`).

**What actually differs (a UX-discoverability issue, not a missing feature):**
1. In the PO tab the **"+ Free" button is always visible** in the toolbar
   (`PoReceiveTab.tsx:273`). In the standalone form the **"Add Free Item" button
   only appears after you pick a PO with line items** (`ReceivalFormDialog.tsx:660`)
   — so it *looks* missing until a PO is selected.
2. Both require a PO. A PO-less "free receive from scratch" is created from the
   **Inventory** module (`source_type='inventory'`), not either receival surface.

→ **Fix = make the free option visible sooner** in `ReceivalFormDialog` (show the
"Add Free Item" affordance/hint before a PO is chosen), not "add a missing feature."

---

## 1. PURCHASE — PO detail view vs standalone pages

### Real gaps (PO-view action missing from the standalone page)

| # | Action | Where it lives (PO view) | Standalone page | What to do |
|---|---|---|---|---|
| P1 | **Create Debit Note from a return** | `PoReturnsTab.tsx:258` (`useCreateDebitNoteForReturn`) | Returns page ✗ (Debit-Notes page is read-only) | Add a "Create Debit Note" action to `POReturnDetailDialog.tsx` / returns row for `supplier_confirmed`/`closed` returns |
| P2 | **Print receival check-sheet** (blank + per-receival) | `PoDetailDialog.tsx:536,553` (`ReceivalCheckButton`) | Receivals page/detail ✗ | Add `ReceivalCheckButton` to `ReceivalDetailDialog.tsx` footer (+ blank sheet on the list) |
| P3 | **Record / edit / delete supplier payment** | Payments tab (`PaymentSummaryTab.tsx:106`) | ✗ no standalone PO-payment surface | Surface supplier-payment actions on the bill detail page, or accept PO-detail-only |
| P4 | **Adjust booked FX rate** | Exchange tab (`DocumentExchangeTab.tsx:218`) | ✗ | Low priority — inherently per-document; leave PO-scoped |

### Reverse gaps (standalone action missing from the PO view)
- **Edit receival** (request→approve→48h window) — standalone only (`receivals/page.tsx:53`). Could add "Request Edit" to the PO Receivals list.
- **Download receival receipt PDF** — only `ReceivalDetailDialog.tsx:245`; add to the PO Receivals cards.
- **Download return PDF** — only `POReturnDetailDialog.tsx:236`; add to `PoReturnsTab`.
- **Landed Costs & Shipments have no PO surface at all** — standalone-only. **`PoShipmentDialog.tsx` is dead code** (never imported) — either wire it into the PO detail as a Shipments tab, or delete it.

### Behaves differently in both
- Create bill: PO view `CreateBillFromPODialog` (PO locked) vs standalone `BillFormDialog` (PO picker) — two components, equivalent.
- Create receival: PO tab handles **multi-division** POs + defaults date to today; standalone has an explicit **date field** but only the PO's single division → multi-division POs are handled *less* completely standalone.

---

## 2. SALES — SO detail view vs standalone pages

### Real gaps (SO-view action missing from the standalone page)

| # | Action | Where it lives (SO view) | Standalone page | What to do |
|---|---|---|---|---|
| S1 | **Whole delivery lifecycle** — create / edit / mark-delivered / cancel | `SoDetailDialog.tsx:372-397,592` | **Deliveries page is VIEW-ONLY** | Add row/detail actions on `deliveries/page.tsx` + `DeliveryDetailDialog.tsx` reusing `useCreateSaleDelivery`/`useCompleteDelivery`/`useCancelDelivery`/`useUpdateDelivery`; a standalone "Create Delivery" needs an SO picker (mirror the returns page) |
| S2 | **Record / edit / delete customer payment** | Payments tab (`SoPaymentDialog`, `SoDetailDialog.tsx:502`) | ✗ (`invoices/[id]` is a PDF viewer) | Add "Record Payment" to `invoices/[id]/page.tsx` or the invoices list, reusing `SoPaymentDialog` (the orphaned `CustomerPaymentDialog.tsx` was built for this) |
| S3 | **Payment plans** — set up + settle installments | Payments tab (`PaymentPlanDialog`, `SoDetailDialog.tsx:482`) | ✗ | Surface `PaymentPlanSection`+`PaymentPlanDialog` on `invoices/[id]/page.tsx` (gate on credit invoices) |
| S4 | **Complete Inspection** (returns) | `SoReturnsTab.tsx:194` | Returns page ✗ (no `pending_inspection` handler/filter) | Add `CompleteInspectionDialog` trigger + `pending_inspection` filter to `returns/page.tsx` |
| S5 | **Create Credit Note for a return + Resolve Remaining / book dispositions** | `SoReturnsTab.tsx:281,236` | ✗ | Add both to `returns/page.tsx` / `SaleReturnDetailDialog.tsx` |
| S6 | **Send replacement delivery** | `SoReturnsTab.tsx:236` / deliveries banner | ✗ (neither returns nor deliveries page) | Add "Send Replacement" to `returns/page.tsx` rows for `restocked` returns (`ReplacementDeliveryDialog`) |
| S7 | **Generate invoice** (minor) | `SoInvoiceTab.tsx:66` | ✗ (auto-generated) | Optional: a "Generate invoice" action for confirmed SOs missing one |

### Reverse gaps (standalone action missing from the SO view)
- **Delivery PDF + warranty certificate** — `DeliveryDetailDialog.tsx:254,261`; add to the SO Deliveries cards.
- **Cancel return / Close return / Return PDF** — on `returns/page.tsx` + `SaleReturnDetailDialog.tsx` but not `SoReturnsTab`.

### Behaves differently / tech-debt
- **Create Return is implemented twice** — `SoReturnsTab` uses the shared `CreateReturnDialog`, but `returns/page.tsx:453` has its own inline copy of the whole form → **drift risk** (same RPC, two UIs). Worth consolidating onto the shared component.
- **Cancel SO** uses a styled `AlertDialog` in the SO view but native `window.confirm()` in the orders list.
- **Orphaned/dead components** (defined, never rendered anywhere in `src`): `CustomerPaymentDialog`, `InvoiceDetailSidebar`, `SelectInvoiceDialog`, `AttachInvoiceDialog`, `InvoiceDetail` (leftovers from the pruned invoice view) — revive `CustomerPaymentDialog` for S2, or delete.

---

## 3. Recommended order of work

**Tier 1 — biggest workflow holes (a clerk is forced into the SO/PO):**
- **S1** Deliveries page actionable (create/complete/cancel) — the largest gap.
- **S2** Record customer payment from the Invoices side.
- **P1** Create Debit Note from the standalone Returns page.

**Tier 2 — complete the return/credit workflow standalone:**
- **S4** Complete Inspection, **S5** Credit-note-for-return + Resolve Remaining, **S6** Replacement delivery, **S3** payment plans.
- **P2** Receival check-sheet standalone.

**Tier 3 — polish + parity niceties:**
- The **free-item discoverability** tweak (§0), PO-view PDFs (receival/return receipts), delivery PDF + warranty cert in the SO view, P3 supplier-payment surface.

**Tier 4 — tech debt (do alongside):**
- Consolidate the duplicate Create-Return form; delete or wire up dead code (`PoShipmentDialog` + the 5 orphaned sales components); unify the Cancel-SO confirm UX.

## 4. Notes
- The good news: **the money/return RPCs already exist and are shared** — most gaps are *surfacing an existing action/dialog on another page*, not new backend work. Low risk, mostly frontend wiring.
- Out of scope (no counterpart by design): approvals queues, customer statement, aging reports, the standalone Warranties module.
