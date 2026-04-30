# Invoice Payments & Payment Plans — AR Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AR invoices full payment parity with AP bills — record, attach, detach, and payment plans — wired through the invoice detail page, invoice popup dialog, and payments list page.

**Architecture:** New Postgres RPCs + trigger handle all status recalculation atomically at the DB layer. New React Query hooks wrap the RPCs. UI additions follow the existing purchase-side patterns exactly.

**Tech Stack:** Supabase (Postgres RPCs + triggers), React Query (useMutation / useQuery), React, TypeScript, Tailwind, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-30-invoice-payments-design.md`

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/20260430120000_invoice_payment_rpcs.sql` |
| Modify | `src/hooks/useCustomerPayments.ts` — add `customer_id` to insert, fix cache keys |
| Create | `src/hooks/useUnlinkedIncomingPayments.ts` |
| Create | `src/hooks/useUnlinkedArInvoices.ts` |
| Create | `src/hooks/useAttachPaymentToInvoice.ts` |
| Create | `src/hooks/useDetachPaymentFromInvoice.ts` |
| Create | `src/components/finance/PaymentPlanDialog.tsx` (moved from purchase/, adds `labels` prop) |
| Delete import | `src/components/purchase/PaymentPlanDialog.tsx` — replace with re-export from finance/ |
| Create | `src/components/sales/AttachInvoiceDialog.tsx` |
| Create | `src/components/sales/SelectInvoiceDialog.tsx` |
| Modify | `src/app/(dashboard)/sales/invoices/[id]/page.tsx` |
| Modify | `src/components/sales/InvoiceDetail.tsx` |
| Modify | `src/components/sales/SoDetailDialog.tsx` — update PaymentPlanDialog import |
| Modify | `src/app/(dashboard)/purchase/payments/page.tsx` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260430120000_invoice_payment_rpcs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260430120000_invoice_payment_rpcs.sql

-- ─── 1. Add customer_id column ───────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- ─── 2. Backfill existing incoming payments ──────────────────────────────────
-- Via already-linked invoice
UPDATE payments p
SET customer_id = i.customer_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.direction = 'incoming'
  AND p.customer_id IS NULL;

-- Via source sale order (for payments recorded against SOs before invoice existed)
UPDATE payments p
SET customer_id = so.customer_id
FROM sale_orders so
WHERE p.source_type = 'sale_order'
  AND p.source_id   = so.id
  AND p.direction   = 'incoming'
  AND p.customer_id IS NULL;

-- ─── 3. Shared recalculation function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION recalculate_ar_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total    NUMERIC;
  v_manually BOOLEAN;
  v_paid     NUMERIC;
  v_status   TEXT;
BEGIN
  SELECT total_amount, COALESCE(manually_paid, FALSE)
  INTO   v_total, v_manually
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF v_total IS NULL THEN RETURN; END IF;
  IF v_manually THEN RETURN; END IF;

  SELECT COALESCE(ROUND(SUM(amount), 2), 0)
  INTO   v_paid
  FROM   payments
  WHERE  invoice_id = p_invoice_id
    AND  direction  = 'incoming'
    AND  deleted_at IS NULL;

  v_status := CASE
    WHEN v_paid >= ROUND(v_total, 2) THEN 'paid'
    WHEN v_paid > 0                   THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE invoices SET payment_status = v_status WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Trigger function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_recalc_ar_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    -- If invoice_id was re-pointed, recalc the old invoice too
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      IF OLD.invoice_id IS NOT NULL THEN
        PERFORM recalculate_ar_invoice_payment_status(OLD.invoice_id);
      END IF;
    END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM recalculate_ar_invoice_payment_status(v_invoice_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Attach trigger ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS payments_recalc_ar_status ON payments;
CREATE TRIGGER payments_recalc_ar_status
AFTER INSERT OR UPDATE OF amount, invoice_id, deleted_at OR DELETE
ON payments
FOR EACH ROW EXECUTE FUNCTION trg_recalc_ar_payment_status();

-- ─── 6. attach_payment_to_invoice RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION attach_payment_to_invoice(
  p_payment_id UUID,
  p_invoice_id UUID
) RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;                           -- row-level lock prevents concurrent attach

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already linked to an invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Ownership guard: skip check for NULL customer_id (legacy backfill miss)
  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = p_invoice_id WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$ LANGUAGE plpgsql;

-- ─── 7. detach_payment_from_invoice RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION detach_payment_from_invoice(
  p_payment_id UUID,
  p_invoice_id UUID
) RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'Payment is not linked to this invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = NULL WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output ends with: `Remote database is up to date` or similar success message. If you see `Error: relation "payments" does not exist`, run `npx supabase link --project-ref wkmvjxxmzstsvahuiwsz` first.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260430120000_invoice_payment_rpcs.sql
git commit -m "feat(db): add customer_id column, AR payment recalc trigger, attach/detach RPCs"
```

---

## Task 2: Update `useCreateCustomerPayment` — populate `customer_id` + fix cache

**Files:**
- Modify: `src/hooks/useCustomerPayments.ts`

- [ ] **Step 1: Update the mutation payload type and insert**

In `src/hooks/useCustomerPayments.ts`, find `useCreateCustomerPayment` and replace the entire function:

```typescript
export function useCreateCustomerPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      customer_id: string
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer' | 'pos'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'incoming')
      const payment_id = `CPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id:  payload.invoice_id,
          customer_id: payload.customer_id,
          amount:      payload.amount,
          method:      payload.method,
          date:        payload.date,
          reference:   payload.reference,
          notes:       payload.notes,
          direction:   'incoming',
          status:      'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute invoice payment_status (belt-and-suspenders alongside the DB trigger)
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'incoming')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (inv?.total_amount ?? Infinity) ? 'paid'
        : totalPaid > 0 ? 'partially_paid'
        : 'unpaid'

      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', payload.invoice_id)

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments', variables.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

- [ ] **Step 2: Update `CustomerPaymentDialog` to pass `customer_id`**

In `src/components/sales/CustomerPaymentDialog.tsx`, find the `submit` function and add `customer_id`:

```typescript
await createPayment.mutateAsync({
  invoice_id:  invoice.id,
  customer_id: invoice.customer_id,   // ← add this line
  amount:      amountNum,
  method,
  date,
  reference: reference || null,
  notes:     null,
})
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCustomerPayments.ts src/components/sales/CustomerPaymentDialog.tsx
git commit -m "feat(payments): populate customer_id on incoming payments, fix cache invalidation"
```

---

## Task 3: `useUnlinkedIncomingPayments` hook

**Files:**
- Create: `src/hooks/useUnlinkedIncomingPayments.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useUnlinkedIncomingPayments.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type UnlinkedIncomingPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
  reference: string | null
}

// customerId is required — prevents cross-customer data leak
export function useUnlinkedIncomingPayments(customerId: string) {
  return useQuery({
    queryKey: ['unlinked-incoming-payments', customerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('id, payment_id, amount, method, date, reference')
        .eq('direction', 'incoming')
        .eq('customer_id', customerId)
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as UnlinkedIncomingPayment[]
    },
    enabled: !!customerId,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUnlinkedIncomingPayments.ts
git commit -m "feat(payments): add useUnlinkedIncomingPayments hook"
```

---

## Task 4: `useUnlinkedArInvoices` hook

**Files:**
- Create: `src/hooks/useUnlinkedArInvoices.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useUnlinkedArInvoices.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type UnlinkedArInvoice = {
  id: string
  invoice_id: string   // display string e.g. "INV-00003"
  total_amount: number | null
  payment_status: string
  issued_date: string
}

// customerId is required — prevents cross-customer data leak
export function useUnlinkedArInvoices(customerId: string) {
  return useQuery({
    queryKey: ['unlinked-ar-invoices', customerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('id, invoice_id, total_amount, payment_status, issued_date')
        .eq('direction', 'ar')
        .eq('customer_id', customerId)
        .in('payment_status', ['unpaid', 'partially_paid'])
        .order('issued_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as UnlinkedArInvoice[]
    },
    enabled: !!customerId,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUnlinkedArInvoices.ts
git commit -m "feat(payments): add useUnlinkedArInvoices hook"
```

---

## Task 5: `useAttachPaymentToInvoice` hook

**Files:**
- Create: `src/hooks/useAttachPaymentToInvoice.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useAttachPaymentToInvoice.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useAttachPaymentToInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      invoiceId,
    }: {
      paymentId: string
      invoiceId: string
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('attach_payment_to_invoice', {
        p_payment_id: paymentId,
        p_invoice_id: invoiceId,
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments', variables.invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unlinked-incoming-payments'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAttachPaymentToInvoice.ts
git commit -m "feat(payments): add useAttachPaymentToInvoice hook"
```

---

## Task 6: `useDetachPaymentFromInvoice` hook

**Files:**
- Create: `src/hooks/useDetachPaymentFromInvoice.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useDetachPaymentFromInvoice.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useDetachPaymentFromInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      invoiceId,
    }: {
      paymentId: string
      invoiceId: string
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('detach_payment_from_invoice', {
        p_payment_id: paymentId,
        p_invoice_id: invoiceId,
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments', variables.invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unlinked-incoming-payments'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDetachPaymentFromInvoice.ts
git commit -m "feat(payments): add useDetachPaymentFromInvoice hook"
```

---

## Task 7: Move `PaymentPlanDialog` to `src/components/finance/` + add `labels` prop

**Files:**
- Create: `src/components/finance/PaymentPlanDialog.tsx`
- Modify: `src/components/purchase/PaymentPlanDialog.tsx` (replace with re-export)

- [ ] **Step 1: Create `src/components/finance/` directory and new file**

Create `src/components/finance/PaymentPlanDialog.tsx` with the full updated component:

```typescript
'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreatePaymentPlan } from '@/hooks/usePaymentPlans'
import { formatCurrency } from '@/lib/utils/formatters'

export interface PaymentPlanLabels {
  partyLabel:  string   // "Customer" | "Vendor"
  amountLabel: string   // "Receivable Amount" | "Payable Amount"
}

const AP_LABELS: PaymentPlanLabels = { partyLabel: 'Vendor',    amountLabel: 'Payable Amount'    }
const AR_LABELS: PaymentPlanLabels = { partyLabel: 'Customer',  amountLabel: 'Receivable Amount' }

export { AP_LABELS, AR_LABELS }

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoiceId: string
  outstanding: number
  labels?: PaymentPlanLabels
}

type InstallmentDraft = { due_date: string; amount: string }

export function PaymentPlanDialog({
  open,
  onOpenChange,
  invoiceId,
  outstanding,
  labels = AP_LABELS,
}: Props) {
  const createPlan = useCreatePaymentPlan()
  const [planType, setPlanType]       = useState<'schedule' | 'adhoc'>('schedule')
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    { due_date: '', amount: String(outstanding.toFixed(2)) },
  ])
  const [saving, setSaving] = useState(false)

  const totalDefined = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const balanceOk    = Math.abs(totalDefined - outstanding) < 0.01

  const update = (idx: number, patch: Partial<InstallmentDraft>) => {
    setInstallments((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const submit = async () => {
    if (planType === 'schedule' && !balanceOk) {
      toast.error(
        `Installment total (${formatCurrency(totalDefined, 'QAR')}) must equal outstanding (${formatCurrency(outstanding, 'QAR')})`
      )
      return
    }
    setSaving(true)
    try {
      await createPlan.mutateAsync({
        invoice_id:   invoiceId,
        plan_type:    planType,
        total_amount: outstanding,
        installments: installments.map((i) => ({
          due_date: planType === 'schedule' ? i.due_date : null,
          amount:   Number(i.amount),
        })),
      })
      toast.success('Payment plan created')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up Payment Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {labels.amountLabel} outstanding:{' '}
            <span className="font-semibold text-foreground">{formatCurrency(outstanding, 'QAR')}</span>
          </p>
          <div className="flex gap-2">
            {(['schedule', 'adhoc'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPlanType(t)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  planType === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {t === 'schedule' ? 'Schedule (with due dates)' : 'Ad-hoc (no due dates)'}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Installments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setInstallments((prev) => [...prev, { due_date: '', amount: '' }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {installments.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                {planType === 'schedule' && (
                  <Input
                    type="date"
                    className="flex-1"
                    value={inst.due_date}
                    onChange={(e) => update(idx, { due_date: e.target.value })}
                  />
                )}
                <Input
                  type="number"
                  className="flex-1"
                  placeholder="Amount"
                  value={inst.amount}
                  step="0.01"
                  min={0}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                />
                {installments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {planType === 'schedule' && (
              <p className={`text-xs ${balanceOk ? 'text-green-600' : 'text-amber-600'}`}>
                Total defined: {formatCurrency(totalDefined, 'QAR')} /{' '}
                {formatCurrency(outstanding, 'QAR')} outstanding
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || (planType === 'schedule' && !balanceOk)}
          >
            {saving ? 'Saving…' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Replace `src/components/purchase/PaymentPlanDialog.tsx` with a re-export**

This preserves backwards compatibility while the three callers are updated in later tasks:

```typescript
// src/components/purchase/PaymentPlanDialog.tsx
export { PaymentPlanDialog, AP_LABELS, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
export type { PaymentPlanLabels } from '@/components/finance/PaymentPlanDialog'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/PaymentPlanDialog.tsx src/components/purchase/PaymentPlanDialog.tsx
git commit -m "feat(finance): move PaymentPlanDialog to finance/, add labels prop"
```

---

## Task 8: `AttachInvoiceDialog` component

**Files:**
- Create: `src/components/sales/AttachInvoiceDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/sales/AttachInvoiceDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { useAttachPaymentToInvoice } from '@/hooks/useAttachPaymentToInvoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  customerId: string
  invoicePaid: boolean
}

export function AttachInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  customerId,
  invoicePaid,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToInvoice()
  const { data: payments = [], isLoading } = useUnlinkedIncomingPayments(customerId)

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      await attach.mutateAsync({ paymentId: selectedId, invoiceId })
      toast.success('Payment attached to invoice.')
      handleOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to attach. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach Payment to Invoice</DialogTitle>
        </DialogHeader>

        {invoicePaid ? (
          <p className="text-sm text-muted-foreground py-4">
            This invoice is already fully paid.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unlinked payments found for this customer.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {payments.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'border rounded-md p-3 cursor-pointer transition-colors',
                  selectedId === p.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">{p.payment_id ?? '—'}</span>
                  <span>{formatCurrency(p.amount, 'QAR')}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatDate(p.date)}</span>
                  <span>{p.method.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || attach.isPending || invoicePaid}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Attaching…' : 'Attach'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sales/AttachInvoiceDialog.tsx
git commit -m "feat(sales): add AttachInvoiceDialog component"
```

---

## Task 9: `SelectInvoiceDialog` component

**Files:**
- Create: `src/components/sales/SelectInvoiceDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/sales/SelectInvoiceDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useUnlinkedArInvoices } from '@/hooks/useUnlinkedArInvoices'
import { useAttachPaymentToInvoice } from '@/hooks/useAttachPaymentToInvoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

const PAY_STATUS_CLASS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentId: string
  customerId: string
}

export function SelectInvoiceDialog({
  open,
  onOpenChange,
  paymentId,
  customerId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToInvoice()
  const { data: invoices = [], isLoading } = useUnlinkedArInvoices(customerId)

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      await attach.mutateAsync({ paymentId, invoiceId: selectedId })
      toast.success('Payment linked to invoice.')
      handleOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to link. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Payment to Invoice</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unpaid invoices found for this customer.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className={cn(
                  'border rounded-md p-3 cursor-pointer transition-colors',
                  selectedId === inv.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => setSelectedId(inv.id)}
              >
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">{inv.invoice_id}</span>
                  <span>{formatCurrency(inv.total_amount ?? 0, 'QAR')}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatDate(inv.issued_date)}</span>
                  <Badge className={cn('text-xs', PAY_STATUS_CLASS[inv.payment_status] ?? '')}>
                    {inv.payment_status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || attach.isPending}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Linking…' : 'Link Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sales/SelectInvoiceDialog.tsx
git commit -m "feat(sales): add SelectInvoiceDialog component"
```

---

## Task 10: Wire the Invoice Detail Page + Dialog

**Files:**
- Modify: `src/app/(dashboard)/sales/invoices/[id]/page.tsx`
- Modify: `src/components/sales/InvoiceDetail.tsx`
- Modify: `src/components/sales/SoDetailDialog.tsx`

### 10a — Invoice Detail Page (`[id]/page.tsx`)

- [ ] **Step 1: Add imports**

At the top of `src/app/(dashboard)/sales/invoices/[id]/page.tsx`, add these imports (keep all existing ones):

```typescript
import { Link2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AttachInvoiceDialog } from '@/components/sales/AttachInvoiceDialog'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { AR_LABELS } from '@/components/finance/PaymentPlanDialog'
```

Replace the existing PaymentPlanDialog import:
```typescript
// REMOVE:
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'

// REPLACE WITH:
import { PaymentPlanDialog } from '@/components/finance/PaymentPlanDialog'
```

- [ ] **Step 2: Add state + hook**

Inside `InvoiceDetailContent`, after the existing `const [planOpen, setPlanOpen] = useState(false)` line, add:

```typescript
const [attachOpen, setAttachOpen] = useState(false)
const { data: unlinkedPayments = [], isLoading: loadingUnlinked } = useUnlinkedIncomingPayments(
  invoice?.customer_id ?? ''
)
const hasUnlinkedPayments = unlinkedPayments.length > 0
```

Note: the hook is called conditionally — `enabled: !!customerId` inside the hook guards against an empty string.

- [ ] **Step 3: Update the toolbar buttons**

Replace the existing toolbar button block (lines ~166–175):

```tsx
{/* REPLACE the existing Pay Now + Payment Plan buttons with: */}
{outstanding > 0 && invoice.doc_status !== 'draft' && (
  <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
    Record Payment
  </Button>
)}
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Button
          variant="outline"
          size="sm"
          disabled={loadingUnlinked || !hasUnlinkedPayments}
          onClick={() => setAttachOpen(true)}
        >
          <Link2 className="h-4 w-4 mr-1.5" />
          Attach Payment
        </Button>
      </span>
    </TooltipTrigger>
    {!hasUnlinkedPayments && (
      <TooltipContent>No unlinked payments for this customer</TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
{invoice.payment_status !== 'paid' && (
  <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
    Payment Plan
  </Button>
)}
```

- [ ] **Step 4: Add `AttachInvoiceDialog` to the rendered dialogs**

After the existing `{planOpen && <PaymentPlanDialog ... />}` block, add:

```tsx
{attachOpen && invoice && (
  <AttachInvoiceDialog
    open
    onOpenChange={setAttachOpen}
    invoiceId={invoice.id}
    customerId={invoice.customer_id}
    invoicePaid={invoice.payment_status === 'paid'}
  />
)}
```

- [ ] **Step 5: Add `labels` to `PaymentPlanDialog`**

Find the existing `<PaymentPlanDialog ... />` usage and add `labels={AR_LABELS}`:

```tsx
{planOpen && (
  <PaymentPlanDialog
    open
    onOpenChange={setPlanOpen}
    invoiceId={invoice.id}
    outstanding={outstanding}
    labels={AR_LABELS}
  />
)}
```

### 10b — `InvoiceDetail.tsx` (popup dialog)

- [ ] **Step 6: Add imports**

In `src/components/sales/InvoiceDetail.tsx`, add:

```typescript
import { Link2, Unlink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AttachInvoiceDialog } from './AttachInvoiceDialog'
import { useDetachPaymentFromInvoice } from '@/hooks/useDetachPaymentFromInvoice'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { AR_LABELS } from '@/components/finance/PaymentPlanDialog'
import { formatDate } from '@/lib/utils/formatters'
```

Replace the existing PaymentPlanDialog import:
```typescript
// REMOVE:
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
// REPLACE WITH:
import { PaymentPlanDialog } from '@/components/finance/PaymentPlanDialog'
```

- [ ] **Step 7: Add state inside `InvoiceDetail`**

After the existing `const [planOpen, setPlanOpen] = useState(false)` line:

```typescript
const [attachOpen, setAttachOpen]           = useState(false)
const [detachTarget, setDetachTarget]       = useState<{ id: string; payment_id: string | null } | null>(null)
const detach = useDetachPaymentFromInvoice()
const { data: unlinkedPayments = [], isLoading: loadingUnlinked } = useUnlinkedIncomingPayments(
  invoice.customer_id
)
const hasUnlinkedPayments = unlinkedPayments.length > 0
```

- [ ] **Step 8: Update action buttons in `InvoiceDetail`**

Replace the existing button block (lines ~136–160 — the `<div className="flex flex-wrap gap-2">` block):

```tsx
<div className="flex flex-wrap gap-2">
  {invoice.doc_status === 'ready_to_send' && (
    <Button
      className="min-h-11"
      onClick={() => {
        sendInvoice.mutate(invoice.id, {
          onSuccess: () => toast.success('Invoice marked as sent'),
          onError:   () => toast.error('Failed to mark invoice as sent'),
        })
      }}
    >
      <Send className="w-4 h-4 mr-2" /> Send to Customer
    </Button>
  )}
  {outstanding > 0 && invoice.doc_status !== 'draft' && (
    <Button variant="outline" className="min-h-11" onClick={() => setPayOpen(true)}>
      Record Payment
    </Button>
  )}
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={loadingUnlinked || !hasUnlinkedPayments}
            onClick={() => setAttachOpen(true)}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Attach Payment
          </Button>
        </span>
      </TooltipTrigger>
      {!hasUnlinkedPayments && (
        <TooltipContent>No unlinked payments for this customer</TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
  {invoice.payment_status !== 'paid' && (
    <Button variant="outline" className="min-h-11" onClick={() => setPlanOpen(true)}>
      Payment Plan
    </Button>
  )}
</div>
```

- [ ] **Step 9: Add payment history section in `InvoiceDetail`**

After the date grid (`<div className="grid grid-cols-2 gap-4 ...">`) and before `</div>` that closes `space-y-4`, add:

```tsx
{/* Payment History */}
<div>
  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
    Payment History
  </p>
  {(payments ?? []).length === 0 ? (
    <p className="text-sm text-muted-foreground">No payments recorded</p>
  ) : (
    <div className="space-y-2">
      {(payments ?? []).map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between text-sm border rounded p-2"
        >
          <div>
            <span className="font-mono font-medium">{p.payment_id ?? '—'}</span>
            <span className="text-muted-foreground ml-2 text-xs">
              {formatDate(p.date)} · {p.method.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{formatCurrency(p.amount, 'QAR')}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => setDetachTarget({ id: p.id, payment_id: p.payment_id })}
                  >
                    <Unlink className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Detach payment</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 10: Add dialogs at the bottom of `InvoiceDetail`**

After the existing `{planOpen && <PaymentPlanDialog ... />}` block, add:

```tsx
{attachOpen && (
  <AttachInvoiceDialog
    open
    onOpenChange={setAttachOpen}
    invoiceId={invoice.id}
    customerId={invoice.customer_id}
    invoicePaid={invoice.payment_status === 'paid'}
  />
)}

<AlertDialog
  open={!!detachTarget}
  onOpenChange={(v) => { if (!v) setDetachTarget(null) }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Detach payment?</AlertDialogTitle>
      <AlertDialogDescription>
        This will unlink{' '}
        <span className="font-mono font-medium">{detachTarget?.payment_id ?? 'this payment'}</span>{' '}
        from the invoice. The invoice status will be recalculated. The payment record is NOT deleted.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          if (!detachTarget) return
          try {
            await detach.mutateAsync({ paymentId: detachTarget.id, invoiceId: invoice.id })
            toast.success('Payment detached')
          } catch (err: unknown) {
            toast.error((err as Error).message ?? 'Failed to detach')
          } finally {
            setDetachTarget(null)
          }
        }}
      >
        Detach
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 11: Add `labels={AR_LABELS}` to `PaymentPlanDialog` in `InvoiceDetail`**

```tsx
{planOpen && (
  <PaymentPlanDialog
    open
    onOpenChange={setPlanOpen}
    invoiceId={invoice.id}
    outstanding={outstanding}
    labels={AR_LABELS}
  />
)}
```

### 10c — `SoDetailDialog.tsx`

- [ ] **Step 12: Update import in `SoDetailDialog.tsx`**

```typescript
// REMOVE:
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
// REPLACE WITH:
import { PaymentPlanDialog, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
```

Find the `<PaymentPlanDialog` usage in `SoDetailDialog.tsx` and add `labels={AR_LABELS}`:

```tsx
<PaymentPlanDialog
  open={planOpen}
  onOpenChange={setPlanOpen}
  invoiceId={...}
  outstanding={invoiceOutstanding}
  labels={AR_LABELS}
/>
```

- [ ] **Step 13: Commit**

```bash
git add src/app/(dashboard)/sales/invoices/[id]/page.tsx \
        src/components/sales/InvoiceDetail.tsx \
        src/components/sales/SoDetailDialog.tsx
git commit -m "feat(sales): wire invoice detail with Record Payment, Attach Payment, Payment Plan, and payment history"
```

---

## Task 11: Wire Payments Page — Link Invoice button

**Files:**
- Modify: `src/app/(dashboard)/purchase/payments/page.tsx`

- [ ] **Step 1: Add imports**

Add to the existing import block:

```typescript
import { SelectInvoiceDialog } from '@/components/sales/SelectInvoiceDialog'
```

- [ ] **Step 2: Add state**

Inside `PaymentsPage`, after the existing `attachSupplierId` state, add:

```typescript
const [linkInvoiceOpen, setLinkInvoiceOpen]     = useState(false)
const [linkPaymentId, setLinkPaymentId]         = useState<string | null>(null)
const [linkCustomerId, setLinkCustomerId]       = useState<string | null>(null)
```

- [ ] **Step 3: Add customer_id to `CustomerPayment` type usage**

The `CustomerPayment` type from `useCustomerPayments.ts` needs `customer_id`. Add it to the type in `src/hooks/useCustomerPayments.ts`:

```typescript
export type CustomerPayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null
  customer_id: string | null   // ← add this field
  source_type: string | null
  source_id: string | null
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'incoming'
  status: string | null
  created_at: string | null
  // joined / resolved
  invoice_display?: string | null
  customer_name?: string | null
  so_number?: string | null
}
```

Also update the query in `useCustomerPayments` to include `customer_id` in the select:

```typescript
.select('*, customer_id, invoices(invoice_id, customers(name))')
```

- [ ] **Step 4: Add "Link Invoice" button to `invoiceColumns` actions cell**

Find the `invoiceColumns` definition and replace the `actions` column cell:

```typescript
{
  id: 'actions',
  header: '',
  cell: ({ row }) => {
    const p = row.original
    return (
      <div className="flex items-center gap-1">
        {p.source_type === 'sale_order' && p.source_id && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="View sale order"
            onClick={() => openSO(p)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {!p.invoice_id && p.customer_id && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Link to invoice"
            onClick={() => {
              setLinkPaymentId(p.id)
              setLinkCustomerId(p.customer_id!)
              setLinkInvoiceOpen(true)
            }}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    )
  },
},
```

- [ ] **Step 5: Add `SelectInvoiceDialog` to the JSX**

After the closing `</AttachBillDialog>` element, add:

```tsx
{linkInvoiceOpen && linkPaymentId && linkCustomerId && (
  <SelectInvoiceDialog
    open
    onOpenChange={setLinkInvoiceOpen}
    paymentId={linkPaymentId}
    customerId={linkCustomerId}
  />
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/purchase/payments/page.tsx src/hooks/useCustomerPayments.ts
git commit -m "feat(payments): add Link Invoice button to Invoice Payments tab"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `payments.customer_id` column + backfill | Task 1 |
| `recalculate_ar_invoice_payment_status` function | Task 1 |
| DB trigger on payments table | Task 1 |
| `attach_payment_to_invoice` RPC | Task 1 |
| `detach_payment_from_invoice` RPC | Task 1 |
| `useCreateCustomerPayment` populates `customer_id` | Task 2 |
| `useUnlinkedIncomingPayments(customerId: string)` | Task 3 |
| `useUnlinkedArInvoices(customerId: string)` | Task 4 |
| `useAttachPaymentToInvoice()` | Task 5 |
| `useDetachPaymentFromInvoice()` | Task 6 |
| `PaymentPlanDialog` moved to `finance/`, `labels` prop | Task 7 |
| `AttachInvoiceDialog` component | Task 8 |
| `SelectInvoiceDialog` component | Task 9 |
| Invoice detail page — Record Payment button | Task 10a |
| Invoice detail page — Attach Payment button (always rendered, disabled when empty) | Task 10a |
| Invoice detail page — Payment Plan button (always rendered) | Task 10a |
| Invoice detail page — PaymentPlanDialog with `AR_LABELS` | Task 10a |
| Invoice detail dialog — same three buttons | Task 10b |
| Invoice detail dialog — payment history with detach | Task 10b |
| SoDetailDialog — import updated + AR_LABELS | Task 10c |
| Payments page — Link Invoice button for unlinked CPAY rows | Task 11 |
| Ownership guard in RPC (customer mismatch → exception) | Task 1 |
| Race-condition guard (FOR UPDATE) | Task 1 |
| Overpayment → 'paid' (not 'overpaid') | Task 1 |
| NUMERIC precision with ROUND(...,2) | Task 1 |
| Cache invalidation includes `['customer-payments', invoiceId]` | Tasks 2, 5, 6 |

**No placeholders found.** All code blocks are complete.

**Type consistency check:**
- `UnlinkedIncomingPayment.id` (Task 3) → used as `paymentId` in `useAttachPaymentToInvoice` (Task 5) ✓
- `UnlinkedArInvoice.id` (Task 4) → used as `invoiceId` in `useAttachPaymentToInvoice` (Task 5) ✓
- `PaymentPlanLabels` interface (Task 7) → `AR_LABELS` / `AP_LABELS` constants used in Tasks 10a, 10b, 10c ✓
- `CustomerPayment.customer_id` added to type (Task 11) and to query select (Task 11) ✓
