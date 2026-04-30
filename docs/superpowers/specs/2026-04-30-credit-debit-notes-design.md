# Credit & Debit Notes — Design Spec
**Date:** 2026-04-30  
**Branch:** feature/sale-module  
**Approach:** Extend existing `credit_notes` table (Option A)

---

## 1. Overview

Introduce auto-generated **Credit Notes** (for SO returns) and **Debit Notes** (for PO returns) into a unified central page. Both document types are created automatically when the relevant return reaches its inventory-impacting status, are downloadable as PDFs matching the existing Invoice PDF style, and are browsable from a single page with a type switcher.

---

## 2. Data Model

### 2.1 `credit_notes` table — new columns

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `note_type` | `text` | NO (default `'credit'`) | `'credit'` or `'debit'` |
| `source_return_id` | `uuid` FK → `returns` | YES | The SR or PR that triggered this note |
| `supplier_name` | `text` | YES | Populated for debit notes |
| `original_total` | `numeric` | YES | SO/PO total before the return |
| `new_total` | `numeric` | YES | Total after applying the return |

All existing rows default to `note_type = 'credit'`, `source_return_id = null`.

### 2.2 Debit note numbering

Debit notes use the sequence **DN-00001, DN-00002…** — separate from CN- (credit notes). Sequencing uses the same max-based approach as payment IDs: `SELECT MAX(credit_note_id) WHERE note_type = 'debit'`.

### 2.3 `returns` table — PO return item condition

Each item object in the `items` JSONB for PO returns gains two optional fields:

```json
{
  "item_name": "80 Gallons",
  "sku": "Alfa-001",
  "qty": 2,
  "brand_variant_id": "uuid-or-null",
  "condition": "defective | damaged | other",
  "condition_notes": "free text when condition = other"
}
```

SO return items already have `condition: 'good' | 'damaged'` — no change.

---

## 3. Auto-Creation Logic

### 3.1 Credit Note — triggered on SO return `restocked`

**Where:** `useUpdateReturnStatus` in `src/hooks/useSaleReturns.ts`, after the `rpc_process_return_restock` RPC succeeds.

**Steps:**
1. Fetch the linked invoice via `returns.source_id` → `sale_orders.invoice_id`
2. Fetch invoice lines to resolve unit prices per item
3. Build credit note lines: for each return item, match to invoice line by `brand_variant_id` or sku → use its `unit_price`
4. Insert into `credit_notes`:
   - `note_type = 'credit'`
   - `credit_note_id = CN-XXXXX` (next in sequence)
   - `invoice_id` = linked invoice id
   - `customer_name` = from invoice
   - `source_return_id` = return id
   - `original_total` = invoice `total_amount`
   - `new_total` = original_total − sum of credit note lines
   - `total_amount` = sum of credit note lines
   - `status = 'issued'`
   - `reason` = return reason
   - `line_items` = credit note lines JSON
5. Update `returns.credit_note_id` = new CN id

### 3.2 Debit Note — triggered on PO return `dispatched`

**Where:** `useUpdatePOReturnStatus` in `src/hooks/usePurchaseReturns.ts`, after `rpc_process_po_return_dispatch` RPC succeeds.

**Steps:**
1. Fetch PO line items via `returns.source_id`
2. Build debit note lines: for each return item, match to PO line item by `brand_variant_id` or sku → use its `unit_price`; carry `condition` and `condition_notes` from return item
3. Insert into `credit_notes`:
   - `note_type = 'debit'`
   - `credit_note_id = DN-XXXXX` (next in sequence)
   - `source_return_id` = return id
   - `supplier_name` = PO supplier name
   - `original_total` = PO `total_qar`
   - `new_total` = original_total − sum of debit note lines
   - `total_amount` = sum of debit note lines
   - `status = 'issued'`
   - `reason` = return reason
   - `line_items` = debit note lines JSON (includes condition per line)
4. Update `returns.credit_note_id` = new DN id

---

## 4. PO Return Form — Condition Field

**Where:** "Create PO Return" dialog in `src/components/purchase/PoDetailDialog.tsx`

Each return item row in the create dialog gains:
- A small **Select** dropdown: `Defective | Damaged | Other`
- When `Other` is selected: an inline text `Input` for `condition_notes`
- Default condition: `Defective`

The condition is stored per-item in the `returns.items` JSONB at creation time.

---

## 5. PDF Component

**File:** `src/components/sales/CreditDebitNotePdf.tsx`  
**Style:** Matches `InvoicePdf.tsx` — Cairo font, company header, same colour scheme.

### Structure

```
┌─────────────────────────────────────────┐
│ Company Logo / Name          CN-00001   │
│ Address                      Date       │
│ Party (Customer / Supplier)             │
│ Reference (Invoice # / PO #)            │
│ Return Reference (SR- / PR-)            │
├─────────────────────────────────────────┤
│ ORIGINAL ITEMS                          │
│ Item  SKU  Qty  Unit Price  Total       │
│ ...                                     │
├─────────────────────────────────────────┤
│ RETURNED ITEMS                          │
│ Item  SKU  Qty  Condition*  Value       │
│ ...          (*debit notes only)        │
├─────────────────────────────────────────┤
│              Original Total: QAR x,xxx  │
│              Returned:      -QAR   xxx  │
│              New Total:      QAR x,xxx  │
└─────────────────────────────────────────┘
```

**Props:**
```ts
type CreditDebitNotePdfProps = {
  note: CreditNote              // extended with new fields
  originalLines: NoteLineItem[] // all SO delivery lines or PO lines
  returnedLines: NoteLineItem[] // the returned items (with condition for debit)
  noteType: 'credit' | 'debit'
  partyName: string             // customer or supplier name
  referenceNumber: string       // invoice # or PO #
  returnNumber: string          // SR- or PR-
  companyInfo: CompanyInfo
}
```

A `PDFDownloadLink` wrapper component `CreditDebitNoteDownloadButton` handles the download, filename: `CreditNote-CN-00001.pdf` or `DebitNote-DN-00001.pdf`.

---

## 6. Central Page

**Route:** `/sales/credit-notes` (unchanged URL, updated title)

### Header
- Title: **"Credit & Debit Notes"**
- Subtitle: "Auto-generated notes from customer and supplier returns"
- Right: **Create Credit Note** button (manual, existing — credit only)

### Type Switcher
A `Select` dropdown below the header: **Credit Notes / Debit Notes** — filters the table.

### Table Columns

| Column | Credit Notes | Debit Notes |
|---|---|---|
| # | CN-00001 | DN-00001 |
| Party | Customer name | Supplier name |
| Reference | Invoice # | PO # |
| Return # | SR-00001 | PR-00001 |
| Amount | Credit total | Debit total |
| New Total | New invoice value | New PO value |
| Status | Badge (Issued/Redeemed/Draft) | Badge (Issued) |
| Actions | Download PDF + Apply to Invoice | Download PDF |

The **Apply to Invoice** action remains only for credit notes. Debit notes are informational + downloadable only.

---

## 7. SO Detail Dialog — Credit Note Link

In `SoDetailDialog`, on the **Payments** tab, when a credit note exists for this SO's return, show:
> *Credit note CN-00001 issued — [Download PDF]*

This is a read-only info row, no action required.

---

## 8. Files Touched

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_credit_debit_notes.sql` | Add columns to `credit_notes`; add DN sequence support |
| `src/types/database.types.ts` | Update `credit_notes` Row type |
| `src/hooks/useCreditNotes.ts` | Add `useDebitNotes`, extend `CreditNote` type, add DN creation helper |
| `src/hooks/useSaleReturns.ts` | Auto-create CN after restock |
| `src/hooks/usePurchaseReturns.ts` | Auto-create DN after dispatch; add condition to POReturnItem |
| `src/components/purchase/PoDetailDialog.tsx` | Add condition Select per return item |
| `src/components/sales/CreditDebitNotePdf.tsx` | New PDF component |
| `src/components/sales/CreditDebitNoteDownloadButton.tsx` | New download button wrapper |
| `src/app/(dashboard)/sales/credit-notes/page.tsx` | Add type switcher, debit columns, download action |

---

## 9. Out of Scope

- Manual debit note creation (debit notes are auto-only for now)
- Email sending of PDFs
- Approval workflow for auto-generated notes (they are auto-issued)
- Multi-currency debit notes (QAR only, matching PO currency)
