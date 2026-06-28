# Credit Note Resolution + Payment Recording Redesign

**Date:** 2026-06-28
**Status:** Approved

---

## Overview

Two interconnected improvements:
1. **Credit Note Resolution Workflow** — three action-driven resolution paths (Refund, Replacement, Store Credit) when a credit note is confirmed
2. **Payment Recording Redesign** — modern dialog with outstanding balance context, overpayment prevention, and live QAR conversion for multi-currency PO payments

---

## Part 1: Credit Note Resolution

### Current State

- Credit notes auto-generated when a sales return is restocked
- `useApplyCreditNote()` only applies credit to invoice outstanding, excess calls `increment_credit_balance` RPC which **does not exist**
- No resolution type tracking
- No replacement delivery workflow
- `customers.credit_balance` column exists but is never read or written

### Resolution Actions (Organic — No Dropdown)

| Action | Where | Trigger | What Happens |
|---|---|---|---|
| Send Replacement | SO Deliveries tab | User clicks "Send Replacement" button | Creates replacement delivery with exact return items, deducts inventory, sets CN `resolution_type = 'replacement'` |
| Refund | CN detail dialog | User clicks "Refund" button | Opens refund form (method + reference), records refund, sets CN `resolution_type = 'refund'` |
| Store Credit | CN detail dialog | User clicks "Store Credit" button | Calls `increment_credit_balance` RPC, sets CN `resolution_type = 'store_credit'` |

### Database Changes

#### 1. `sale_deliveries` — add columns

```sql
ALTER TABLE sale_deliveries
  ADD COLUMN type text NOT NULL DEFAULT 'standard'
    CHECK (type IN ('standard', 'replacement')),
  ADD COLUMN return_id uuid REFERENCES returns(id) ON DELETE SET NULL;
```

#### 2. `credit_notes` — add resolution tracking

```sql
ALTER TABLE credit_notes
  ADD COLUMN resolution_type text
    CHECK (resolution_type IN ('refund', 'replacement', 'store_credit'));
```

`resolution_type` is nullable — null means unresolved.

#### 3. Create `increment_credit_balance` RPC

```sql
CREATE OR REPLACE FUNCTION increment_credit_balance(p_customer_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE customers
  SET credit_balance = COALESCE(credit_balance, 0) + p_amount,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;
```

### Send Replacement Flow

**Visibility rule:** "Send Replacement" button appears in SO Deliveries tab when:
- A return exists for this SO with `status = 'restocked'`
- The return's linked credit note has `resolution_type IS NULL`

**Creation flow:**
1. User clicks "Send Replacement" → confirmation dialog opens
2. Dialog shows return items (read-only table: item name, SKU, quantity) — **not editable**
3. User selects source warehouse (required)
4. User confirms → system:
   a. Creates `sale_delivery` with `type = 'replacement'`, `return_id = <return.id>`
   b. Items JSONB copied from return's items (same item_name, sku, qty as qty_delivered, brand_variant_id)
   c. Calls existing `create_and_confirm_delivery` RPC — inventory deducts normally
   d. Updates linked credit note: `resolution_type = 'replacement'`

**Display in Deliveries tab:**
- Replacement deliveries show a **"Replacement"** badge (orange/amber)
- Subtitle: "For SR-00001" (return reference)
- Otherwise identical to standard delivery display (status, items, warehouse, date)

### Refund Flow

1. User opens CN detail dialog → clicks "Refund" button
2. Small form appears: refund method (dropdown: same payment methods) + reference number
3. Submit → system:
   a. Updates CN: `resolution_type = 'refund'`, `refund_method = <method>`, `refund_reference = <ref>`
   b. Status remains `issued` (or transitions to `redeemed` if applying to invoice too)

### Store Credit Flow

1. User opens CN detail dialog → clicks "Store Credit" button
2. Confirmation prompt: "Add QAR X,XXX.XX to customer's credit balance?"
3. Confirm → system:
   a. Calls `increment_credit_balance(customer_id, total_amount)`
   b. Updates CN: `resolution_type = 'store_credit'`

### CN Detail Dialog Changes

- When `resolution_type IS NULL`: show three action buttons: "Refund" | "Send Replacement" | "Store Credit"
- "Send Replacement" button text: "Go to Deliveries" (navigates/scrolls to SO deliveries tab since the action happens there)
- When `resolution_type IS NOT NULL`: show resolution badge instead of buttons
  - Refund: "Refunded via [method] — Ref: [reference]"
  - Replacement: "Replacement sent — DEL-XXXXX"
  - Store Credit: "Added to customer credit balance"

---

## Part 2: Payment Recording Redesign

### Current Problems

- Amount field starts at 0 with no context
- No outstanding balance shown
- No overpayment validation (amount > 0 is the only check)
- Basic stacked form layout
- PO exchange rate not editable in payment dialog

### New PaymentFormDialog Design

#### Summary Header (always visible at top)

```
┌─────────────────────────────────────────────────┐
│  Total: QAR 35,000    Paid: QAR 10,000    Outstanding: QAR 25,000  │
│  ████████████░░░░░░░░░░░░░░░░░░░░  29%                             │
└─────────────────────────────────────────────────┘
```

- Total = order grand total
- Paid = sum of existing payments (amount_qar for PO, amount for SO)
- Outstanding = Total - Paid
- Progress bar colored: green when < 100%, full green at 100%

#### Form Layout — SO (QAR only)

```
Row 1:  [Amount (QAR) *]        [Date *]
Row 2:  [Payment Method *]      [Reference]
Row 3:  [Notes — full width]
        [Cancel]                [Record Payment]
```

#### Form Layout — PO (multi-currency)

```
Row 1:  [Amount (USD) *]        [Date *]
Row 2:  [Exchange Rate *]       [= QAR 10,950.00]  ← live
Row 3:  [Payment Method *]      [Reference]
Row 4:  [Notes — full width]
        [Cancel]                [Record Payment]
```

#### Smart Amount Field

- **Default value:** outstanding balance (pay-in-full by default)
- **Max:** capped at outstanding — HTML `max` attribute + Zod validation
- **"Pay Full" chip:** small button next to amount that resets to outstanding
- **Live progress bar:** updates as user types the amount

#### Exchange Rate (PO only, when currency != QAR)

- Defaults to PO's saved `exchange_rate`
- Editable — user types current rate
- QAR equivalent shown as read-only: `amount × exchange_rate`
- Updates live on every keystroke

#### Validation Rules

- `amount > 0` — "Amount must be positive"
- `amount <= outstanding` — "Amount exceeds outstanding balance"
- `exchange_rate > 0` — PO only, "Exchange rate must be positive"
- Method required
- Date required
- If outstanding is 0: hide the "+ Record Payment" button entirely

### Props Changes to PaymentFormDialog

```typescript
interface PaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  currency: string
  methods: PaymentMethod[]
  defaultMethod?: string
  isPending: boolean
  onSubmit: (values: PaymentFormValues) => void
  // NEW props:
  totalAmount: number          // order grand total
  paidAmount: number           // sum of existing payments
  exchangeRate?: number        // PO only — default exchange rate
  showExchangeRate?: boolean   // true when currency != 'QAR'
}
```

### Hook Changes

#### `useCreateSOPayment` — add validation

Before insert: fetch SO total and sum of existing payments, reject if `amount > outstanding`.

#### `useCreatePOPayment` — add validation + exchange rate

Before insert: fetch PO total and sum of existing payments, reject if `amount > outstanding`.
Accept `exchange_rate` from form (not from PO record), store on payment.

---

## Files to Create / Modify

### New Files
- `supabase/migrations/YYYYMMDDHHMMSS_credit_note_resolution.sql` — schema changes + RPC
- `src/components/sales/ReplacementDeliveryDialog.tsx` — confirmation dialog for replacement

### Modified Files
- `src/components/sales/CreditDebitNoteDetailDialog.tsx` — add resolution buttons + resolved state display
- `src/components/sales/SoDetailDialog.tsx` — add "Send Replacement" button in Deliveries tab
- `src/components/shared/PaymentFormDialog.tsx` — full redesign with summary header, smart defaults, validation
- `src/components/sales/SoPaymentDialog.tsx` — pass totalAmount, paidAmount props
- `src/components/purchase/PoPaymentDialog.tsx` — pass totalAmount, paidAmount, exchangeRate props
- `src/hooks/useSaleOrders.ts` — add overpayment validation to `useCreateSOPayment`
- `src/hooks/usePurchaseOrders.ts` — add overpayment validation + exchange rate to `useCreatePOPayment`
- `src/hooks/useCreditNotes.ts` — add resolution mutations, fix `useApplyCreditNote`
- `src/hooks/useSaleReturns.ts` — query for unresolved returns (for replacement button visibility)
- `src/hooks/useSaleDeliveries.ts` — support replacement delivery creation

---

## Out of Scope

- Customer credit balance usage at checkout (applying stored credit to new SOs) — separate task
- Debit note resolution workflow (supplier-side) — separate task
- Credit note approval workflow changes — existing flow stays as-is
