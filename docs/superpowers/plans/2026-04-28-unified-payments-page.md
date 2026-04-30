# Unified Payments Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two separate payment pages (Purchase Payments and Customer Payments) into a single page at `/purchase/payments` with a dropdown to switch between "Purchase Payments" and "Invoice Payments".

**Architecture:** Rewrite `/purchase/payments/page.tsx` to hold both tables, controlled by a `paymentType` state fed by a `<Select>` dropdown. Both data hooks are called unconditionally (pre-fetches both). Delete `/sales/payments/page.tsx`. Update `nav-config.ts` to replace the two nav entries with a single "Payments" entry.

**Tech Stack:** Next.js 15, React, TypeScript, shadcn/ui (Select, Badge, Button), TanStack Table, Supabase

---

## Files

| File | Change |
|---|---|
| `src/app/(dashboard)/purchase/payments/page.tsx` | Rewrite — unified page with type selector |
| `src/app/(dashboard)/sales/payments/page.tsx` | Delete |
| `src/components/layout/nav-config.ts` | Two entries → one "Payments" entry |

---

## Task 1: Rewrite the unified payments page

**Files:**
- Modify: `src/app/(dashboard)/purchase/payments/page.tsx`

- [ ] **Step 1: Replace the entire file**

Write the following content to `src/app/(dashboard)/purchase/payments/page.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSupplierPayments, type SupplierPayment } from '@/hooks/useSupplierPayments'
import { useCustomerPayments, type CustomerPayment } from '@/hooks/useCustomerPayments'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { SaleOrder } from '@/hooks/useSaleOrders'

type PaymentType = 'purchase' | 'invoice'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online:          'Online',
  online_transfer: 'Online Transfer',
  pay_later:       'Pay Later',
  fawran:          'Fawran',
  pos:             'POS',
}

export default function PaymentsPage() {
  const [paymentType, setPaymentType] = useState<PaymentType>('purchase')

  const { data: supplierPayments, isLoading: loadingSupplier } = useSupplierPayments()
  const { data: customerPayments, isLoading: loadingCustomer } = useCustomerPayments()

  const [selectedSO, setSelectedSO] = useState<SaleOrder | null>(null)
  const [detailOpen, setDetailOpen]   = useState(false)

  function openSO(payment: CustomerPayment) {
    if (!payment.source_id || payment.source_type !== 'sale_order') return
    setSelectedSO({
      id:                       payment.source_id,
      so_number:                payment.so_number ?? '…',
      customer_id:              '',
      status:                   'confirmed' as const,
      subtotal:                 payment.amount,
      tax:                      0,
      total:                    payment.amount,
      discount_amount:          0,
      discount_label:           null,
      discount_type:            null,
      discount_amount_resolved: 0,
      currency:                 'QAR',
      exchange_rate:            1,
      expected_delivery:        null,
      payment_terms:            null,
      payment_terms_notes:      null,
      payment_milestones:       null,
      delivery_terms:           null,
      delivery_terms_notes:     null,
      customer_notes:           null,
      validity_days:            0,
      notes:                    null,
      created_by_name:          null,
      created_at:               payment.date,
      updated_at:               payment.date,
      deleted_at:               null,
      customer_name:            payment.customer_name ?? undefined,
    })
    setDetailOpen(true)
  }

  const purchaseColumns = useMemo<ColumnDef<SupplierPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('payment_id')}</span>,
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'bill',
      header: 'Bill #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('amount'), 'QAR'),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.getValue('method') as string] ?? row.getValue('method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
  ], [])

  const invoiceColumns = useMemo<ColumnDef<CustomerPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.getValue('payment_id') ?? '—'}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => {
        const so = row.original.so_number
        if (!so) return <span className="text-muted-foreground">—</span>
        return (
          <button
            onClick={() => openSO(row.original)}
            className="font-mono text-sm text-primary hover:underline"
          >
            {so}
          </button>
        )
      },
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatCurrency(row.getValue('amount'), 'QAR')}
        </span>
      ),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.getValue('method') as string] ?? row.getValue('method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original
        if (p.source_type !== 'sale_order' || !p.source_id) return null
        return (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="View Sale Order"
            onClick={() => openSO(p)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )
      },
    },
  ], [customerPayments]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageWrapper>
      <PageHeader title="Payments" description="Purchase and invoice payment records" />
      <div className="mb-4">
        <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="purchase">Purchase Payments</SelectItem>
            <SelectItem value="invoice">Invoice Payments</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {paymentType === 'purchase' ? (
        <DataTable
          columns={purchaseColumns}
          data={supplierPayments ?? []}
          isLoading={loadingSupplier}
        />
      ) : (
        <>
          <DataTable
            columns={invoiceColumns}
            data={customerPayments ?? []}
            isLoading={loadingCustomer}
          />
          <SoDetailDialog
            open={detailOpen}
            onOpenChange={setDetailOpen}
            so={selectedSO}
          />
        </>
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/purchase/payments/page.tsx
git commit -m "feat(ui): unified payments page — Purchase Payments and Invoice Payments in one page with type selector"
```

---

## Task 2: Delete the old sales payments page

**Files:**
- Delete: `src/app/(dashboard)/sales/payments/page.tsx`

- [ ] **Step 1: Delete the file**

```bash
git rm "src/app/(dashboard)/sales/payments/page.tsx"
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. (No other file imports this page directly — Next.js routes files by convention.)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old sales payments page — merged into /purchase/payments"
```

---

## Task 3: Update nav config

**Files:**
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Replace the two payment nav entries with one**

In `src/components/layout/nav-config.ts`, find these two lines (around lines 85 and 87):

```ts
          { label: 'Purchase Payments', href: '/purchase/payments' },
          { label: 'Deliveries', href: '/sales/deliveries' },
          { label: 'Payments', href: '/sales/payments' },
```

Replace with:

```ts
          { label: 'Payments', href: '/purchase/payments' },
          { label: 'Deliveries', href: '/sales/deliveries' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/nav-config.ts
git commit -m "chore(nav): replace two payment nav entries with single Payments entry"
```

---

## Task 4: Update PROGRESS.md

- [ ] **Step 1: Add to the top of `## ✅ Completed` in `PROGRESS.md`**

```
- [2026-04-28] **Unified Payments Page** — `src/app/(dashboard)/purchase/payments/page.tsx`, `src/app/(dashboard)/sales/payments/page.tsx` (deleted), `src/components/layout/nav-config.ts` — Merged Purchase Payments and Customer Payments into single page with Purchase Payments / Invoice Payments dropdown selector
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — unified payments page complete"
```
