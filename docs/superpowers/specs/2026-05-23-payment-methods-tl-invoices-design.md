# Payment Methods + TL Invoice Payment Flow — Design Spec
**Date:** 2026-05-23  
**Branch:** feature/team-leader  
**Status:** Approved

---

## Overview

Two connected features:
1. A `payment_methods` master-data table managed from Admin Settings, used globally wherever payment method selection appears.
2. A revised Team Leader invoice flow that uses fixed-amount discounts, loads payment methods from DB, marks Cash invoices as paid immediately, and sends a Dibsy payment link + Wati notification for all other methods.

---

## Section 1 — Database

### `payment_methods` table

```sql
CREATE TABLE payment_methods (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

Seeded with (in order):

| name | slug |
|---|---|
| Cash | cash |
| Online Payment | online_payment |
| Bank Transfer | bank_transfer |
| PDC | pdc |
| CDC | cdc |
| POS | pos |
| Pay Later | pay_later |

**RLS:** `SELECT` for all authenticated users. `INSERT/UPDATE/DELETE` for admin role only.

### `tl_invoices` table

```sql
CREATE TABLE tl_invoices (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number      text        NOT NULL,           -- TL-2026-0001
  visit_id            uuid        NOT NULL REFERENCES visits(id),
  order_id            text,                           -- ORD-2026-0010 display string
  customer_name       text        NOT NULL,
  customer_phone      text,                           -- for Wati notification
  items               jsonb       NOT NULL DEFAULT '[]', -- [{name,qty,unit_price,total}]
  subtotal            numeric     NOT NULL DEFAULT 0,
  discount_amount     numeric     NOT NULL DEFAULT 0,
  total_amount        numeric     NOT NULL DEFAULT 0, -- subtotal - discount_amount
  payment_method_id   uuid        REFERENCES payment_methods(id),
  payment_status      text        NOT NULL DEFAULT 'unpaid', -- 'unpaid' | 'paid'
  dibsy_payment_id    text,
  dibsy_checkout_url  text,
  notes               text,
  created_by          uuid        REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

Auto-increment for `invoice_number` via a DB sequence `tl_invoice_seq` and a trigger that generates `TL-` + `EXTRACT(year FROM now())` + `-` + `LPAD(nextval('tl_invoice_seq')::text, 4, '0')` on insert.

**RLS:**
- `SELECT/INSERT/UPDATE` for the `created_by` profile (team leader) and admin.
- No public access.

---

## Section 2 — Admin: Payment Methods Page

### Sidebar
File: `src/components/master-data/AdminSidebar.tsx`  
Add entry to the **Operations** section between "Reason Lists" and "Approval Settings":
```
{ label: 'Payment Methods', href: '/master-data/admin/payment-methods', icon: CreditCard }
```

### Page
File: `src/app/(dashboard)/master-data/admin/payment-methods/page.tsx`  
Client component: `src/components/master-data/PaymentMethodsAdmin.tsx`

**List panel:**
- Renders all payment methods ordered by `sort_order`.
- Each row shows: name, slug badge, active/inactive toggle (optimistic update, instant `UPDATE` to DB).
- Inactive methods are dimmed but remain visible for re-activation.
- No delete — only deactivate, to preserve `tl_invoices.payment_method_id` references.

**Add form:**
- Name input. Slug auto-derives from name on type (lowercase, spaces → underscores).
- Submit inserts with `sort_order = max(sort_order) + 1`.
- Validates uniqueness of slug before submit (client-side check against loaded list).

---

## Section 3 — TlInvoiceDialog: UI Changes

File: `src/components/team-leader/TlInvoiceDialog.tsx`

### Removed
- `contractDiscount` / `ccDiscount` percentage `<Select>` dropdowns and all associated percentage math.
- Hardcoded `['cash', 'card', 'pending']` button row.

### Added / Changed

**Discount input:**  
Single `<Input type="number" min={0}>` labeled "Discount (QAR)", defaulting to `0`.

**Totals block:**
```
Subtotal             XXX.XX QAR
Discount           − XXX.XX QAR    ← hidden when 0
──────────────────────────────────
Amount Due           XXX.XX QAR    ← bold, highlighted
```

**Payment method select:**  
`<Select>` populated from `payment_methods` (active only, ordered by `sort_order`). Displays `name`, value is `id`. Loaded on dialog mount via Supabase client.

**Invoice Notes:**  
Optional `<Textarea>` labeled "Invoice Notes (Optional)".

**Submit button:**
- Cash (`slug === 'cash'`): label "Confirm & Mark Paid"
- All others: label "Confirm & Send Payment Link"

### Submit logic

**Step 1 — Insert `tl_invoices`:**
```ts
{
  invoice_number,       // from sequence RPC
  visit_id,
  order_id,
  customer_name,
  customer_phone,
  items,                // allServices (original + added) mapped to {name, qty, unit_price, total}
  subtotal,
  discount_amount,
  total_amount,         // subtotal - discount_amount
  payment_method_id,
  payment_status: isCash ? 'paid' : 'unpaid',
  notes,
  created_by: profileId,
}
```

**Step 2 (Cash only):** Mark visit as completed, toast "Invoice created — marked as paid.", call `onDone`.

**Step 3 (non-Cash):** Mark visit as completed, then `POST /api/payments/dibsy/create-tl-invoice`. On success toast "Invoice created — payment link sent." On failure toast error but still call `onDone` (invoice already created).

The existing optimistic-lock visit update (`.not('status', 'in', '("completed","customer-unavailable")')`) is preserved.

---

## Section 4 — Backend

### New route: `POST /api/payments/dibsy/create-tl-invoice`

**Input:**
```ts
{ invoice_id: string, amount: number, order_id: string, customer_phone: string }
```

**Steps:**
1. Validate all fields present.
2. Call `createDibsyPayment` with:
   - `amount: { value: amount.toFixed(2), currency: 'QAR' }`
   - `redirectUrl: https://mms.alfaytri.com/pay/${invoice_id}`
   - `webhookUrl: ${APP_URL}/api/payments/dibsy/webhook`
   - `metadata: { tl_invoice_id: invoice_id }`
3. Update `tl_invoices` with `dibsy_payment_id` and `dibsy_checkout_url`.
4. Send Wati template `mms_tl_invoice_payment` to `customer_phone` via existing `POST /api/wati/send-message`. If `customer_phone` is null/empty, skip Wati silently (log a warning):
   - `bookingnumber` = order_id
   - `total_amount` = `${amount.toFixed(2)} QAR`
   - `due_amount` = `${amount.toFixed(2)} QAR`
   - `url` = `${invoice_id}` (button suffix — template button URL is `https://mms.alfaytri.com/pay/{{url}}`)
5. Return `{ ok: true, checkoutUrl }`.

**Error handling:** Dibsy failure → 502. DB update failure → log and continue (don't block). Wati failure → log and continue (don't block; Wati is best-effort).

### Extended webhook: `/api/payments/dibsy/webhook`

After the existing `subscriptionId` branch, add:

```ts
const tlInvoiceId = payment.metadata?.tl_invoice_id
if (tlInvoiceId && payment.status === 'paid') {
  await supabase
    .from('tl_invoices')
    .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', tlInvoiceId)
}
```

The existing subscription logic is not modified.

### New public page: `/pay/[invoiceId]`

File: `src/app/pay/[invoiceId]/page.tsx`  
**No auth required** (customer-facing).

Logic:
1. Fetch `tl_invoices` by `id` (using admin client — public has no direct access).
2. If not found → render 404 card: "Payment link not found."
3. If `payment_status === 'paid'` → render "Invoice already settled" card with order number.
4. If `dibsy_checkout_url` exists → `redirect(dibsy_checkout_url)`.
5. Fallback → render "Payment link not ready yet" card.

---

## Files Created / Modified

| File | Change |
|---|---|
| `supabase/migrations/20260523210000_payment_methods.sql` | New: `payment_methods` table + seed |
| `supabase/migrations/20260523220000_tl_invoices.sql` | New: `tl_invoices` table + sequence + RLS |
| `src/components/master-data/AdminSidebar.tsx` | Add Payment Methods entry |
| `src/components/master-data/PaymentMethodsAdmin.tsx` | New component |
| `src/app/(dashboard)/master-data/admin/payment-methods/page.tsx` | New page |
| `src/components/team-leader/TlInvoiceDialog.tsx` | Revise discount + payment method + submit |
| `src/app/api/payments/dibsy/create-tl-invoice/route.ts` | New route |
| `src/app/api/payments/dibsy/webhook/route.ts` | Extend for `tl_invoice_id` |
| `src/app/pay/[invoiceId]/page.tsx` | New public redirect page |
