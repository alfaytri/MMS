# PO/SO Parity — Remaining Work (backlog)

> Extracted from the full audit [2026-08-29-po-so-view-parity.md](2026-08-29-po-so-view-parity.md).
> **Tier 1 (S1/P1/S2) is SHIPPED** — see below. This file is the open queue for
> the rest. Each item says *what*, *where the working version lives* (reuse it),
> and *where to add it*. Almost all are frontend wiring over existing RPCs/hooks.

## ✅ Tier 1 — SHIPPED to prod 2026-08-29 (pushed `aaccd486..39870223`)
- **S1** Deliveries page actionable — New Delivery (SO picker → `SoDeliveryDialog`), Mark Delivered, Cancel Delivery. Commit `89b36419`.
- **P1** Create Debit Note from standalone return detail. Commits `d5787489` + fix `02f8d1cd` (standalone list now fetches `debit_note`).
- **S2** Record customer payment from the invoice page. Commit `2121616`.
- Smoke-tested end-to-end on staging (real writes). Auto-refresh verified on every surface.

---

## Tier 2 — complete the return/credit workflow standalone (do next)

| # | Action | Working version (reuse) | Add to | Notes |
|---|---|---|---|---|
| S4 | **Complete Inspection** for a sales return | `SoReturnsTab.tsx:194` (`CompleteInspectionDialog`) | `sales/returns/page.tsx` + `SaleReturnDetailDialog.tsx` | Add a `pending_inspection` status filter + the dialog trigger. No `pending_inspection` handler exists standalone today. |
| S5 | **Create Credit Note for a return** + **Resolve Remaining** / book dispositions | `SoReturnsTab.tsx:281,236` | `sales/returns/page.tsx` / `SaleReturnDetailDialog.tsx` | Two actions. Shared RPCs already exist. |
| S6 | **Send replacement delivery** | `SoReturnsTab.tsx:236` / deliveries banner (`ReplacementDeliveryDialog`) | `sales/returns/page.tsx` rows for `restocked` returns | "Send Replacement" action. |
| S3 | **Payment plans** — set up + settle installments | Payments tab (`PaymentPlanSection` + `PaymentPlanDialog`, `SoDetailDialog.tsx:482`) | `sales/invoices/[id]/page.tsx` | Gate on credit invoices. |
| P2 | **Print receival check-sheet** (blank + per-receival) | `PoDetailDialog.tsx:536,553` (`ReceivalCheckButton`) | `ReceivalDetailDialog.tsx` footer + blank sheet on the receivals list | |

## Tier 3 — polish / parity niceties
- **Free-item discoverability** (the original "free receive" ask): the standalone `ReceivalFormDialog` only shows "Add Free Item" *after* a PO with lines is picked (`ReceivalFormDialog.tsx:660`). Show the affordance/hint before a PO is chosen. (Not a missing feature — the standalone page already creates free receivals.)
- **PO-view PDF downloads** — receival receipt (`ReceivalDetailDialog.tsx:245`) + return PDF (`POReturnDetailDialog.tsx:236`) into the PO Receivals/Returns tabs.
- **Delivery PDF + warranty certificate** in the SO view Deliveries cards (`DeliveryDetailDialog.tsx:254,261`).
- **P3** Standalone supplier-payment surface (record/edit/delete) on the bill detail page — or accept PO-detail-only (`PaymentSummaryTab.tsx:106`).
- **S7** (minor) "Generate invoice" action for confirmed SOs missing one (`SoInvoiceTab.tsx:66`).
- **P4** (low) Adjust booked FX rate is inherently per-document — leave PO-scoped (`DocumentExchangeTab.tsx:218`).

## Tier 4 — tech debt (do alongside)
- **Consolidate the duplicate Create-Return form** — `SoReturnsTab` uses the shared `CreateReturnDialog`, but `returns/page.tsx:453` has its own inline copy of the whole form (same RPC, two UIs → drift risk).
- **Dead code** — delete or wire up: `PoShipmentDialog` (never imported), and the 5 orphaned sales components `CustomerPaymentDialog`, `InvoiceDetailSidebar`, `SelectInvoiceDialog`, `AttachInvoiceDialog`, `InvoiceDetail` (leftovers from the pruned invoice view).
- **Unify Cancel-SO confirm** — styled `AlertDialog` in the SO view vs native `window.confirm()` in the orders list.

## Reverse gaps (standalone action missing from the PO/SO detail view)
- SO view Deliveries cards: add Delivery PDF + warranty cert (Tier 3 above).
- SO view: Cancel return / Close return / Return PDF exist standalone but not in `SoReturnsTab`.
- PO view: Edit receival (request→approve→48h), receival receipt PDF, return PDF; Landed Costs & Shipments have no PO surface at all (standalone-only).

## Out of scope (no counterpart by design)
Approvals queues, customer statement, aging reports, the standalone Warranties module.

---

**Separately queued (not parity):** the reorder-point feature — plan written at
[docs/plans/2026-08-29-reorder-point.md](../plans/2026-08-29-reorder-point.md),
waiting for a build go-ahead.
