# Sales Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After EVERY task commit, update `PROGRESS.md` immediately and commit it (per AGENTS.md rule).

**Goal:** Build the Sale Orders list, Create/Edit SO form, SO detail dialog, and Sale Returns page — the core sales workflow.

**Architecture:** TanStack Query hooks for all sales tables, shared status/delivery/payment components, a full-page create/edit form at `/sales/create-so` and `/sales/edit-so/[id]`, a list page at `/sales/orders` with a slide-over detail dialog, and a returns page at `/sales/returns`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (client-side + edge functions), TanStack Query v5, shadcn/ui (Base UI), zod + react-hook-form, sonner toasts, Tailwind CSS.

---

## CRITICAL codebase rules — read before writing any code

1. `DropdownMenuTrigger` does **NOT** support `asChild` — use `className` directly.
2. `DropdownMenuLabel` **MUST** be inside `<DropdownMenuGroup>` or crashes with `MenuGroupRootContext is missing`.
3. `zodResolver(schema) as never` — always add `as never` to bypass zod v4 TS inference.
4. Supabase client: `import { createClient } from '@/lib/supabase/client'`
5. Types: if the generated types are stale (column missing), cast the whole query builder: `(supabase as any).from(...)`.
6. **Responsive design is mandatory** — every component must work at phone/tablet/laptop/TV breakpoints. Dialogs: `w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg`. Touch targets: `min-h-11`.
7. `DialogClose asChild` is NOT supported — use plain `<Button onClick={() => onOpenChange(false)}>`.
8. **After every task commit** — update `PROGRESS.md` and commit it separately.

## Key schema facts

**`sale_orders`**: id, so_number (text NOT NULL UNIQUE), customer_id (uuid → customers), status (`sale_order_status` enum: `quotation | pending_approval | confirmed | partial_delivery | delivered | invoiced | closed | cancelled`), subtotal, tax, total, discount_amount, discount_label, discount_type (`'fixed'|'percentage'`), discount_amount_resolved, voucher_id, campaign_id, notes, created_by_name, deleted_at.

**`sale_order_lines`**: id, sale_order_id, item_id, item_name, sku, qty, unit_price, total, delivered_qty, brand_variant_id.

**`sale_deliveries`**: id, delivery_number (unique), sale_order_id, warehouse_id, warehouse_name, date, items (jsonb: `[{item_name, sku, qty_delivered, brand_variant_id}]`), status (`sale_delivery_status` enum: `pending | dispatched | delivered`), created_by_name.

**`returns`** (unified): id, return_number, source_type (`sale_order | order`), source_id (= sale_order.id), date, reason, items (jsonb: `[{item_name, sku, qty, condition}]`), restock_warehouse_id, notes, status (`pending | received | restocked | closed`), division_id, created_by_name.

**`approval_requests`**: id, source_type (`sale_order`), source_id, approval_type (`margin | credit`), status (`pending | approved | rejected`), requested_by, decided_by, decided_by_name, reason, comment.

**`customers`**: id, name, email, customer_type, customer_number, credit_category_id, is_blocked.

**`payments`** (same table as purchase): source_type = `'sale_order'`, source_id = so.id, supplier_id = null.

**Edge functions (already deployed in Supabase):**
- `deduct-sale-stock` — called on delivery creation; atomically deducts FIFO layers, creates stock movement, updates stock level. Payload: `{ sale_order_id, delivery_id, warehouse_id, items: [{brand_variant_id, qty}] }`
- `reserve-stock` — called on SO confirmation; reserves stock. Payload: `{ sale_order_id, items: [{brand_variant_id, qty}] }`

**SO number generation:** count+1 with `SO-XXXXX` prefix (same pattern as PO numbers, race-prone, UNIQUE constraint is safety net).

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/useSaleOrders.ts` | Types + hooks for sale orders, customers, deliveries, payments, confirmation |
| `src/hooks/useSaleReturns.ts` | Sale returns CRUD and status transitions |
| `src/components/sales/SoStatusBadge.tsx` | Color-coded SO status badge |
| `src/components/sales/SoPaymentDialog.tsx` | Record payment form dialog |
| `src/components/sales/SoDeliveryDialog.tsx` | Create delivery form — warehouse + per-item qty |
| `src/components/sales/SoDetailDialog.tsx` | 4-tab read-only SO detail dialog |
| `src/components/sales/SoLineItemsEditor.tsx` | Dynamic line items editor (used in create/edit form) |
| `src/app/(dashboard)/sales/orders/page.tsx` | SO list page with filters |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Create SO form page |
| `src/app/(dashboard)/sales/edit-so/[id]/page.tsx` | Edit SO form page |
| `src/app/(dashboard)/sales/returns/page.tsx` | Sale returns list + create return dialog |

---

## Task 1: Sale Hooks

**Files:**
- Create: `src/hooks/useSaleOrders.ts`
- Create: `src/hooks/useSaleReturns.ts`

- [ ] **Step 1: Create `src/hooks/useSaleOrders.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SOStatus =
  | 'quotation'
  | 'pending_approval'
  | 'confirmed'
  | 'partial_delivery'
  | 'delivered'
  | 'invoiced'
  | 'closed'
  | 'cancelled'

export type SOLineItem = {
  id: string
  sale_order_id: string
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  total: number
  delivered_qty: number
  brand_variant_id: string | null
  created_at: string
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string
  warehouse_name: string | null
  date: string
  items: {
    item_name: string
    sku: string | null
    qty_delivered: number
    brand_variant_id: string | null
  }[]
  status: string
  created_by_name: string | null
  created_at: string
}

export type SaleOrder = {
  id: string
  so_number: string
  customer_id: string
  status: SOStatus
  subtotal: number
  tax: number
  total: number
  discount_amount: number
  discount_label: string | null
  discount_type: string | null
  discount_amount_resolved: number
  notes: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // joined
  sale_order_lines?: SOLineItem[]
  sale_deliveries?: SaleDelivery[]
  // denormalised from customers join
  customer_name?: string
  customer_phone?: string
}

export type SalePayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type Customer = {
  id: string
  name: string
  email: string | null
  customer_number: string | null
  customer_type: string | null
  is_blocked: boolean
  credit_category_id: string | null
}

export type SOLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit_price: number
  total: number
  brand_variant_id: string | null
  avg_cost?: number // for margin check
}

export type CreateSOPayload = {
  customer_id: string
  customer_name: string
  notes: string | null
  discount_amount: number
  discount_label: string | null
  discount_type: 'fixed' | 'percentage'
  line_items: SOLineItemDraft[]
}

export type UpdateSOPayload = Partial<CreateSOPayload> & { id: string }

export interface SOFilters {
  search?: string
  status?: SOStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateSONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await (supabase as any)
    .from('sale_orders')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(5, '0')
  return `SO-${seq}`
  // TODO: replace with server-side sequence to avoid race conditions. Current
  // implementation is prone to duplicates under concurrent load; the UNIQUE
  // constraint on so_number is the safety net.
}

export function calcSOSubtotal(lines: SOLineItemDraft[]): number {
  return lines.reduce((s, l) => s + l.total, 0)
}

export function calcSOTotal(subtotal: number, discountAmount: number, discountType: 'fixed' | 'percentage'): number {
  if (discountType === 'percentage') {
    return subtotal - (subtotal * discountAmount) / 100
  }
  return subtotal - discountAmount
}

export function hasNegativeMargin(lines: SOLineItemDraft[]): boolean {
  return lines.some((l) => l.avg_cost !== undefined && l.unit_price < l.avg_cost)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('customers')
        .select('id, name, email, customer_number, customer_type, is_blocked, credit_category_id')
        .is('deleted_at', null)
        .order('name')
        .limit(50)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.ilike('name', `%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Customer[]
    },
    staleTime: 30 * 1000,
    enabled: true,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; email?: string | null; customer_type?: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customers')
        .insert({ name: payload.name, email: payload.email ?? null, customer_type: payload.customer_type ?? 'individual' })
        .select()
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useSaleOrders(filters: SOFilters = {}) {
  return useQuery({
    queryKey: ['sale-orders', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('sale_orders')
        .select('*, sale_order_lines(*), sale_deliveries(*), customers!inner(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.or(`so_number.ilike.%${safe}%,customers.name.ilike.%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        customer_name: row.customers?.name ?? null,
      })) as SaleOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function useSaleOrder(id: string | null) {
  return useQuery({
    queryKey: ['sale-order', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('sale_orders')
        .select('*, sale_order_lines(*), sale_deliveries(*), customers(name, email, customer_number)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
      } as SaleOrder
    },
    enabled: !!id,
  })
}

export function useSOPayments(soId: string | null) {
  return useQuery({
    queryKey: ['so-payments', soId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) throw error
      return data as SalePayment[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}

export function useCreateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSOPayload) => {
      const supabase = createClient()
      const so_number = await generateSONumber(supabase)
      const subtotal = calcSOSubtotal(payload.line_items)
      const discountResolved = payload.discount_type === 'percentage'
        ? (subtotal * payload.discount_amount) / 100
        : payload.discount_amount
      const total = subtotal - discountResolved

      const { data: so, error: soErr } = await (supabase as any)
        .from('sale_orders')
        .insert({
          so_number,
          customer_id: payload.customer_id,
          status: 'quotation',
          subtotal,
          tax: 0,
          total,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
          discount_type: payload.discount_type,
          discount_amount_resolved: discountResolved,
          notes: payload.notes,
        })
        .select()
        .single()
      if (soErr) throw soErr

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('sale_order_lines')
          .insert(
            payload.line_items.map(({ avg_cost: _unused, ...li }) => ({
              ...li,
              sale_order_id: so.id,
            }))
          )
        if (liErr) throw liErr
      }

      return so as SaleOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
    },
  })
}

export function useUpdateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdateSOPayload & { line_items?: SOLineItemDraft[] }) => {
      const supabase = createClient()

      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = calcSOSubtotal(line_items)
        const discountType = (fields as any).discount_type ?? 'fixed'
        const discountAmount = (fields as any).discount_amount ?? 0
        const discountResolved = discountType === 'percentage'
          ? (subtotal * discountAmount) / 100
          : discountAmount
        extraFields = { subtotal, total: subtotal - discountResolved, discount_amount_resolved: discountResolved }
      }

      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (soErr) throw soErr

      if (line_items) {
        await (supabase as any).from('sale_order_lines').delete().eq('sale_order_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await (supabase as any)
            .from('sale_order_lines')
            .insert(line_items.map(({ avg_cost: _unused, ...li }) => ({ ...li, sale_order_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
    },
  })
}

export function useConfirmSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lineItems }: { id: string; lineItems: SOLineItem[] }) => {
      const supabase = createClient()

      // Update SO status
      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
      if (soErr) throw soErr

      // Call reserve-stock edge function (best-effort; warns if insufficient stock)
      try {
        await supabase.functions.invoke('reserve-stock', {
          body: {
            sale_order_id: id,
            items: lineItems
              .filter((l) => l.brand_variant_id)
              .map((l) => ({ brand_variant_id: l.brand_variant_id, qty: l.qty })),
          },
        })
      } catch {
        // Non-blocking: log warning but don't fail the confirmation
        console.warn('reserve-stock edge function failed — stock not reserved')
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
    },
  })
}

export function useCreateSOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      so_id: string
      amount: number
      method: string
      date: string
      reference: string | null
      notes: string | null
      currency: string
      exchange_rate: number
    }) => {
      const supabase = createClient()
      const { error } = await supabase.from('payments').insert({
        source_type: 'sale_order',
        source_id: payment.so_id,
        supplier_id: null,
        amount: payment.amount,
        method: payment.method as any,
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        status: 'pending' as any,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['so-payments', variables.so_id] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
    },
  })
}

export function useCreateDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      so_id: string
      warehouse_id: string
      warehouse_name: string
      date: string
      items: { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[]
    }) => {
      const supabase = createClient()

      // Generate delivery number
      const { count } = await (supabase as any)
        .from('sale_deliveries')
        .select('*', { count: 'exact', head: true })
      const delivery_number = `DEL-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: delivery, error: delErr } = await (supabase as any)
        .from('sale_deliveries')
        .insert({
          delivery_number,
          sale_order_id: payload.so_id,
          warehouse_id: payload.warehouse_id,
          warehouse_name: payload.warehouse_name,
          date: payload.date,
          items: payload.items,
          status: 'pending',
        })
        .select()
        .single()
      if (delErr) throw delErr

      // Call deduct-sale-stock edge function (FIFO deduction)
      const { error: fnErr } = await supabase.functions.invoke('deduct-sale-stock', {
        body: {
          sale_order_id: payload.so_id,
          delivery_id: delivery.id,
          warehouse_id: payload.warehouse_id,
          items: payload.items
            .filter((i) => i.brand_variant_id)
            .map((i) => ({ brand_variant_id: i.brand_variant_id, qty: i.qty_delivered })),
        },
      })
      if (fnErr) throw fnErr

      return delivery as SaleDelivery
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.so_id] })
    },
  })
}
```

- [ ] **Step 2: Create `src/hooks/useSaleReturns.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type SaleReturn = {
  id: string
  return_number: string
  source_type: 'sale_order'
  source_id: string
  date: string
  reason: string
  items: {
    item_name: string
    sku: string | null
    qty: number
    condition: 'good' | 'damaged'
    brand_variant_id: string | null
  }[]
  restock_warehouse_id: string | null
  notes: string | null
  status: 'pending' | 'received' | 'restocked' | 'closed'
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function useSaleReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['sale-returns', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'sale_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as SaleReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreateSaleReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string
      date: string
      reason: string
      items: SaleReturn['items']
      restock_warehouse_id: string | null
      notes: string | null
    }) => {
      const supabase = createClient()

      // Generate return number
      const { count } = await (supabase as any)
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'sale_order')
      const return_number = `SR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('returns')
        .insert({
          return_number,
          source_type: 'sale_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          items: payload.items,
          restock_warehouse_id: payload.restock_warehouse_id,
          notes: payload.notes,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data as SaleReturn
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
    },
  })
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
    },
  })
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/hooks/useSaleOrders.ts src/hooks/useSaleReturns.ts
git commit -m "feat: add sale order and sale return hooks"
```

- [ ] **Step 5: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 1: Sale Hooks** — useSaleOrders (types, customer hooks, SO CRUD, confirm with reserve-stock, delivery with deduct-sale-stock, payments), useSaleReturns (CRUD + status transitions)
```
Update `## 🔄 In Progress` to Task 2. Commit: `docs: update PROGRESS.md — Sales Core Task 1 complete`

---

## Task 2: Shared Sale Components

**Files:**
- Create: `src/components/sales/SoStatusBadge.tsx`
- Create: `src/components/sales/SoPaymentDialog.tsx`
- Create: `src/components/sales/SoDeliveryDialog.tsx`

- [ ] **Step 1: Create `src/components/sales/SoStatusBadge.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SOStatus } from '@/hooks/useSaleOrders'

const STATUS_CONFIG: Record<SOStatus, { label: string; className: string }> = {
  quotation:        { label: 'Quotation',        className: 'border-muted-foreground/40 text-muted-foreground' },
  pending_approval: { label: 'Pending Approval', className: 'border-warning text-warning' },
  confirmed:        { label: 'Confirmed',         className: 'border-blue-500 text-blue-500' },
  partial_delivery: { label: 'Partial Delivery',  className: 'border-orange-500 text-orange-500' },
  delivered:        { label: 'Delivered',          className: 'border-success text-success' },
  invoiced:         { label: 'Invoiced',           className: 'border-success text-success bg-success/10' },
  closed:           { label: 'Closed',             className: 'border-muted-foreground/60 text-muted-foreground bg-muted' },
  cancelled:        { label: 'Cancelled',          className: 'border-destructive text-destructive' },
}

export function SoStatusBadge({ status, className }: { status: SOStatus; className?: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}
```

- [ ] **Step 2: Create `src/components/sales/SoPaymentDialog.tsx`**

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateSOPayment, type SaleOrder } from '@/hooks/useSaleOrders'

const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque', 'credit_card', 'debit_card', 'online', 'other',
] as const

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(PAYMENT_METHODS),
  date: z.string().min(1, 'Date is required'),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
})

type FormValues = z.infer<typeof schema>

interface SoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoPaymentDialog({ open, onOpenChange, so }: SoPaymentDialogProps) {
  const createPayment = useCreateSOPayment()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      amount: 0,
      method: 'cash',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    },
  })

  function onSubmit(values: FormValues) {
    createPayment.mutate(
      {
        so_id: so.id,
        amount: values.amount,
        method: values.method,
        date: values.date,
        reference: values.reference || null,
        notes: values.notes || null,
        currency: 'QAR',
        exchange_rate: 1,
      },
      {
        onSuccess: () => {
          toast.success('Payment recorded')
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Record Payment — {so.so_number}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (QAR) *</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="method" render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method *</FormLabel>
                <FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reference" render={({ field }) => (
              <FormItem>
                <FormLabel>Reference</FormLabel>
                <FormControl><Input placeholder="Transaction / cheque number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createPayment.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPayment.isPending}>
                {createPayment.isPending ? 'Saving…' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create `src/components/sales/SoDeliveryDialog.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateDelivery, useWarehouses, type SaleOrder, type SOLineItem } from '@/hooks/useSaleOrders'
import { useWarehouses as useWarehouseList } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'

interface SoDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoDeliveryDialog({ open, onOpenChange, so }: SoDeliveryDialogProps) {
  const createDelivery = useCreateDelivery()
  const { data: warehouses } = useWarehouseList()

  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [qtys, setQtys] = useState<Record<string, number>>({})

  const lines = so.sale_order_lines ?? []

  function maxDeliverable(line: SOLineItem): number {
    return Math.max(0, line.qty - line.delivered_qty)
  }

  function handleSubmit() {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    const items = lines
      .map((l) => ({ ...l, deliveryQty: qtys[l.id] ?? 0 }))
      .filter((l) => l.deliveryQty > 0)

    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }

    const warehouse = warehouses?.find((w: any) => w.id === warehouseId)

    createDelivery.mutate(
      {
        so_id: so.id,
        warehouse_id: warehouseId,
        warehouse_name: warehouse?.name ?? '',
        date,
        items: items.map((i) => ({
          item_name: i.item_name,
          sku: i.sku,
          qty_delivered: i.deliveryQty,
          brand_variant_id: i.brand_variant_id,
        })),
      },
      {
        onSuccess: () => {
          toast.success('Delivery created')
          onOpenChange(false)
          setQtys({})
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Delivery — {so.so_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Warehouse + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="delivery-warehouse">Warehouse *</Label>
              <select
                id="delivery-warehouse"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select warehouse…</option>
                {(warehouses ?? []).map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery-date">Date *</Label>
              <Input id="delivery-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Items</Label>
            {lines.map((line) => {
              const max = maxDeliverable(line)
              return (
                <div key={line.id} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{line.item_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordered: {line.qty} · Delivered: {line.delivered_qty} · Max: {max}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={max}
                    value={qtys[line.id] ?? 0}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [line.id]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                    className="w-20 text-right"
                    disabled={max === 0}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createDelivery.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createDelivery.isPending}>
            {createDelivery.isPending ? 'Creating…' : 'Create Delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

> **Note:** `SoDeliveryDialog` imports `useWarehouses` from `@/hooks/useInventory` — that hook already exists. Remove the duplicate import line `import { useWarehouses as useWarehouseList } from '@/hooks/useInventory'` — just use `useWarehouses` from `useInventory` directly.

- [ ] **Step 4: Fix the duplicate import in SoDeliveryDialog**

After writing the file, fix the import block to use only one warehouse import:

```typescript
import { useWarehouses } from '@/hooks/useInventory'
```

And use `useWarehouses()` in the component body (remove the `as useWarehouseList` alias).

- [ ] **Step 5: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd D:/MMS && git add src/components/sales/
git commit -m "feat: add shared sale components — SoStatusBadge, SoPaymentDialog, SoDeliveryDialog"
```

- [ ] **Step 6: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 2: Shared Components** — SoStatusBadge (8 status colors), SoPaymentDialog (record payment form), SoDeliveryDialog (warehouse + per-item qty, calls deduct-sale-stock edge function)
```
Commit: `docs: update PROGRESS.md — Sales Core Task 2 complete`

---

## Task 3: SO Detail Dialog

**Files:**
- Create: `src/components/sales/SoDetailDialog.tsx`

- [ ] **Step 1: Create `src/components/sales/SoDetailDialog.tsx`**

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SoStatusBadge } from './SoStatusBadge'
import { SoPaymentDialog } from './SoPaymentDialog'
import { SoDeliveryDialog } from './SoDeliveryDialog'
import {
  useSaleOrder,
  useSOPayments,
  type SaleOrder,
} from '@/hooks/useSaleOrders'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface SoDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder | null
  onEdit?: (so: SaleOrder) => void
  onConfirm?: (so: SaleOrder) => void
}

export function SoDetailDialog({ open, onOpenChange, so, onEdit, onConfirm }: SoDetailDialogProps) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)

  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: payments } = useSOPayments(open ? (so?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && so?.id ? { module: 'sale_orders', entity_id: so.id } : {}
  )

  const current = fullSO ?? so

  const canRecordPayment = current && ['confirmed', 'partial_delivery', 'delivered', 'invoiced'].includes(current.status)
  const canDeliver = current && ['confirmed', 'partial_delivery'].includes(current.status)
  const canConfirm = current?.status === 'quotation'
  const canEdit = current?.status === 'quotation'

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
  const payPct = current ? Math.min(100, (totalPaid / (current.total || 1)) * 100) : 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{current?.so_number}</DialogTitle>
              {current && <SoStatusBadge status={current.status} />}
              {current?.customer_name && (
                <span className="text-sm text-muted-foreground">{current.customer_name}</span>
              )}
            </div>
            {current && (
              <div className="text-sm text-muted-foreground">
                Total: {formatCurrency(current.total, 'QAR')} · {formatDate(current.created_at)}
              </div>
            )}
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">Failed to load sale order details.</div>
          ) : (
            <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0 overflow-x-auto">
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              {/* ── Items ────────────────────────────────────────── */}
              <TabsContent value="items" className="flex-1 overflow-y-auto">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden sm:table-cell">SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Delivered</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fullSO?.sale_order_lines ?? []).map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="font-medium">{li.item_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(li.unit_price, 'QAR')}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">{li.delivered_qty}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(li.total, 'QAR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {current && (
                  <div className="mt-4 space-y-1 text-sm text-right pr-2">
                    <div className="text-muted-foreground">Subtotal: <span className="text-foreground font-medium">{formatCurrency(current.subtotal, 'QAR')}</span></div>
                    {(current.discount_amount_resolved > 0) && (
                      <div className="text-muted-foreground">
                        Discount{current.discount_label ? ` (${current.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(current.discount_amount_resolved, 'QAR')}</span>
                      </div>
                    )}
                    {current.tax > 0 && (
                      <div className="text-muted-foreground">Tax: <span className="text-foreground">{formatCurrency(current.tax, 'QAR')}</span></div>
                    )}
                    <div className="font-semibold">Total: {formatCurrency(current.total, 'QAR')}</div>
                  </div>
                )}
              </TabsContent>

              {/* ── Deliveries ───────────────────────────────────── */}
              <TabsContent value="deliveries" className="flex-1 overflow-y-auto space-y-3">
                {(fullSO?.sale_deliveries ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</p>
                ) : (
                  (fullSO?.sale_deliveries ?? []).map((d) => (
                    <div key={d.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{d.delivery_number}</span>
                        <Badge variant="outline" className="text-xs">{d.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(d.date)} · {d.warehouse_name ?? 'Unknown warehouse'}
                      </div>
                      {d.items && d.items.length > 0 && (
                        <div className="rounded border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Item</TableHead>
                                <TableHead className="text-xs text-right">Qty Delivered</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {d.items.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-xs">{item.item_name}</TableCell>
                                  <TableCell className="text-xs text-right">{item.qty_delivered}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ── Payments ─────────────────────────────────────── */}
              <TabsContent value="payments" className="flex-1 overflow-y-auto space-y-4">
                {canRecordPayment && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setPaymentOpen(true)}>+ Record Payment</Button>
                  </div>
                )}
                {(payments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payments yet</p>
                ) : (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="hidden sm:table-cell">Method</TableHead>
                            <TableHead className="hidden md:table-cell">Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(payments ?? []).map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(p.amount_qar ?? p.amount, 'QAR')}</TableCell>
                              <TableCell className="hidden sm:table-cell capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {current && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Paid: {formatCurrency(totalPaid, 'QAR')}</span>
                          <span>Total: {formatCurrency(current.total, 'QAR')}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${payPct}%` }}
                            role="progressbar"
                            aria-valuenow={Math.round(payPct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Payment progress"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                {(activityLogs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-2">
                    {(activityLogs ?? []).map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0 text-xs pt-0.5">{formatRelative(log.created_at)}</span>
                        <div>
                          <span className="font-medium">{log.action}</span>
                          {log.performer_name && <span className="text-muted-foreground"> · {log.performer_name}</span>}
                          {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Action buttons */}
          {current && !isLoading && (
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t justify-end">
              {canConfirm && onConfirm && (
                <Button size="sm" onClick={() => { onConfirm(current); onOpenChange(false) }}>
                  Confirm Order
                </Button>
              )}
              {canDeliver && (
                <Button variant="outline" size="sm" onClick={() => setDeliveryOpen(true)}>
                  + Create Delivery
                </Button>
              )}
              {canEdit && onEdit && (
                <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { onEdit(current); onOpenChange(false) }}>
                  Edit SO
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {current && (
        <>
          <SoPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} so={current} />
          <SoDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} so={current} />
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd D:/MMS && git add src/components/sales/SoDetailDialog.tsx
git commit -m "feat: add SO detail dialog with 4 tabs (items, deliveries, payments, activity)"
```

- [ ] **Step 3: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 3: SO Detail Dialog** — 4-tab dialog (items with subtotal/discount/total, deliveries with item breakdown, payments with progress bar, activity log); action buttons for confirm/deliver/edit per status
```
Commit: `docs: update PROGRESS.md — Sales Core Task 3 complete`

---

## Task 4: Sale Orders List Page

**Files:**
- Create: `src/app/(dashboard)/sales/orders/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/sales/orders/page.tsx`**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { SoStatusBadge } from '@/components/sales/SoStatusBadge'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import {
  useSaleOrders,
  useConfirmSO,
  type SaleOrder,
  type SOStatus,
} from '@/hooks/useSaleOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATUSES: { value: SOStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partial_delivery', label: 'Partial Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function SaleOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SOStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailSO, setDetailSO] = useState<SaleOrder | null>(null)

  const confirmSO = useConfirmSO()

  const searchRef = useState<ReturnType<typeof setTimeout> | null>(null)
  function handleSearch(val: string) {
    setSearch(val)
    if (searchRef[0]) clearTimeout(searchRef[0])
    searchRef[1](setTimeout(() => setDebouncedSearch(val), 300))
  }

  const { data: orders, isLoading } = useSaleOrders({
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<SOStatus, number>> = {}
    ;(orders ?? []).forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    })
    return counts
  }, [orders])

  function handleConfirm(so: SaleOrder) {
    confirmSO.mutate(
      { id: so.id, lineItems: so.sale_order_lines ?? [] },
      {
        onSuccess: () => toast.success(`${so.so_number} confirmed`),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const columns = useMemo<ColumnDef<SaleOrder>[]>(() => [
    {
      accessorKey: 'so_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="SO #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('so_number')}</span>,
    },
    {
      accessorKey: 'customer_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') ?? '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <SoStatusBadge status={row.getValue('status')} />,
    },
    {
      accessorKey: 'subtotal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtotal" />,
      cell: ({ row }) => <span className="text-sm">{formatCurrency(row.getValue('subtotal'), 'QAR')}</span>,
    },
    {
      accessorKey: 'total',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total (QAR)" />,
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('total'), 'QAR')}</span>,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.getValue('created_at'))}</span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDetailSO(row.original)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale Orders"
        description="Create and manage customer sale orders"
        actions={
          <Button onClick={() => router.push('/sales/create-so')}>
            + Create Sale Order
          </Button>
        }
      />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted'
            )}
          >
            {s.label}
            {s.value && statusCounts[s.value] !== undefined && (
              <span className={cn(
                'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px]',
                statusFilter === s.value ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
              )}>
                {statusCounts[s.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search SO number or customer…" />
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            aria-label="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            aria-label="To date"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear dates
            </Button>
          )}
        </div>
      </div>

      <DataTable columns={columns} data={orders ?? []} isLoading={isLoading} />

      <SoDetailDialog
        open={!!detailSO}
        onOpenChange={(open) => { if (!open) setDetailSO(null) }}
        so={detailSO}
        onEdit={(so) => router.push(`/sales/edit-so/${so.id}`)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd D:/MMS && git add "src/app/(dashboard)/sales/orders/page.tsx"
git commit -m "feat: add Sale Orders list page with status chips, date filters, and DataTable"
```

- [ ] **Step 3: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 4: Sale Orders List Page** — status chip filters (8 statuses with counts), debounced search, date range, DataTable with 7 columns, SoDetailDialog integration with confirm/edit actions
```
Commit: `docs: update PROGRESS.md — Sales Core Task 4 complete`

---

## Task 5: Create/Edit SO Page

**Files:**
- Create: `src/components/sales/SoLineItemsEditor.tsx`
- Create: `src/app/(dashboard)/sales/create-so/page.tsx`
- Create: `src/app/(dashboard)/sales/edit-so/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/sales/SoLineItemsEditor.tsx`**

```typescript
'use client'

import { Trash2, Plus, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InventoryItemLookup, type InventoryLookupResult } from '@/components/purchase/InventoryItemLookup'
import { formatCurrency } from '@/lib/utils/formatters'
import type { SOLineItemDraft } from '@/hooks/useSaleOrders'

export type SOLineItemRow = SOLineItemDraft & { _key: string }

interface SoLineItemsEditorProps {
  value: SOLineItemRow[]
  onChange: (rows: SOLineItemRow[]) => void
}

export function SoLineItemsEditor({ value, onChange }: SoLineItemsEditorProps) {
  function addRow() {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        item_name: '',
        sku: '',
        qty: 1,
        unit_price: 0,
        total: 0,
        brand_variant_id: null,
        avg_cost: undefined,
      },
    ])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<SOLineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleItemSelected(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit_price: 0, total: 0, brand_variant_id: null, avg_cost: undefined })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      sku: item.sku ?? '',
      unit_price: item.selling_price || item.cost_price,
      total: (item.selling_price || item.cost_price) * (value.find((r) => r._key === key)?.qty ?? 1),
      brand_variant_id: item.brand_variant_id,
      avg_cost: item.cost_price,
    })
  }

  const grandTotal = value.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((row, idx) => {
          const hasNegativeMargin = row.avg_cost !== undefined && row.unit_price < row.avg_cost && row.unit_price > 0
          return (
            <div key={row._key} className="grid grid-cols-12 gap-2 items-start rounded-md border p-2">
              {/* Item lookup */}
              <div className="col-span-12 sm:col-span-5">
                <InventoryItemLookup
                  value={row.brand_variant_id ? {
                    brand_variant_id: row.brand_variant_id,
                    item_name: row.item_name,
                    item_name_ar: null,
                    sku: row.sku,
                    unit: 'pcs',
                    cost_price: row.avg_cost ?? 0,
                    selling_price: row.unit_price,
                  } : null}
                  onChange={(item) => handleItemSelected(row._key, item)}
                  placeholder={`Item ${idx + 1}…`}
                />
              </div>

              {/* SKU */}
              <div className="col-span-4 sm:col-span-2">
                <Input
                  placeholder="SKU"
                  value={row.sku}
                  onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                  className="text-xs"
                />
              </div>

              {/* Qty */}
              <div className="col-span-2 sm:col-span-1">
                <Input
                  type="number"
                  min="1"
                  value={row.qty}
                  onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                  placeholder="Qty"
                  className="text-xs"
                />
              </div>

              {/* Unit Price */}
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.unit_price}
                  onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                  placeholder="Price"
                  className={`text-xs ${hasNegativeMargin ? 'border-warning text-warning' : ''}`}
                />
              </div>

              {/* Total + Margin warning + Delete */}
              <div className="col-span-12 sm:col-span-2 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{formatCurrency(row.total, 'QAR')}</span>
                  {hasNegativeMargin && (
                    <AlertTriangle className="h-3 w-3 text-warning shrink-0" title={`Below cost (${formatCurrency(row.avg_cost!, 'QAR')})`} />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeRow(row._key)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
        <div className="text-sm font-semibold">
          Subtotal: {formatCurrency(grandTotal, 'QAR')}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/(dashboard)/sales/create-so/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SoLineItemsEditor, type SOLineItemRow } from '@/components/sales/SoLineItemsEditor'
import {
  useCreateSO,
  useConfirmSO,
  useCustomers,
  useCreateCustomer,
  calcSOSubtotal,
  calcSOTotal,
  hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
})

export default function CreateSOPage() {
  const router = useRouter()
  const createSO = useCreateSO()
  const confirmSO = useConfirmSO()
  const createCustomer = useCreateCustomer()

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [lineItems, setLineItems] = useState<SOLineItemRow[]>([])
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema) as never,
    defaultValues: { name: '', email: '' },
  })

  const subtotal = calcSOSubtotal(lineItems)
  const total = calcSOTotal(subtotal, discountAmount, discountType)
  const negativeMargin = hasNegativeMargin(lineItems)

  function handleSelectCustomer(c: { id: string; name: string }) {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setCustomerSearch(c.name)
  }

  function handleAddCustomer(values: z.infer<typeof customerSchema>) {
    createCustomer.mutate(
      { name: values.name, email: values.email || null },
      {
        onSuccess: (data) => {
          toast.success('Customer added')
          handleSelectCustomer({ id: data.id, name: data.name })
          setAddCustomerOpen(false)
          customerForm.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function validate() {
    if (!customerId) { toast.error('Please select a customer'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((l) => !l.item_name)) { toast.error('All line items need an item name'); return false }
    return true
  }

  function buildPayload() {
    return {
      customer_id: customerId,
      customer_name: customerName,
      notes: notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      discount_type: discountType,
      line_items: lineItems.map(({ _key, ...li }) => li),
    }
  }

  function saveQuotation() {
    if (!validate()) return
    createSO.mutate(buildPayload(), {
      onSuccess: () => { toast.success('Saved as quotation'); router.push('/sales/orders') },
      onError: (err) => toast.error(err.message),
    })
  }

  function confirmOrder() {
    if (!validate()) return
    createSO.mutate(buildPayload(), {
      onSuccess: (so: any) => {
        confirmSO.mutate(
          { id: so.id, lineItems: so.sale_order_lines ?? [] },
          {
            onSuccess: () => { toast.success('Order confirmed'); router.push('/sales/orders') },
            onError: (err) => toast.error(err.message),
          }
        )
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending = createSO.isPending || confirmSO.isPending

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Sale Order</h1>
      </div>

      {/* Customer */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Customer</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search customers…"
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(''); setCustomerName('') }}
            />
            {customerSearch && !customerId && (customers ?? []).length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                {(customers ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                    onClick={() => handleSelectCustomer(c)}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.customer_number && <span className="text-xs text-muted-foreground">{c.customer_number}</span>}
                    {c.is_blocked && <Badge variant="destructive" className="text-[10px] h-4">Blocked</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(true)}>
            + Add Customer
          </Button>
        </div>
        {customerId && (
          <Badge variant="outline" className="text-success border-success">✓ {customerName}</Badge>
        )}
      </section>

      {/* Line Items */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Line Items</h2>
        {negativeMargin && (
          <div className="flex items-center gap-2 rounded-md border border-warning bg-warning/5 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            One or more items are priced below cost. A margin approval will be required.
          </div>
        )}
        <SoLineItemsEditor value={lineItems} onChange={setLineItems} />
      </section>

      {/* Discount */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Discount</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Discount Label</Label>
            <Input placeholder="e.g. Loyalty discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(['fixed', 'percentage'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${discountType === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                >
                  {t === 'fixed' ? 'Fixed (QAR)' : 'Percentage (%)'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Amount {discountType === 'percentage' ? '(%)' : '(QAR)'}</Label>
            <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-semibold">Notes</h2>
        <Textarea placeholder="Internal notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </section>

      {/* Footer */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1 text-sm text-right">
          <div className="text-muted-foreground">Subtotal: <span className="text-foreground">{formatCurrency(subtotal, 'QAR')}</span></div>
          {discountAmount > 0 && (
            <div className="text-muted-foreground">
              Discount: <span className="text-destructive">-{formatCurrency(discountType === 'percentage' ? (subtotal * discountAmount / 100) : discountAmount, 'QAR')}</span>
            </div>
          )}
          <div className="font-semibold text-base">Total: {formatCurrency(total, 'QAR')}</div>
        </div>
        <Separator />
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={saveQuotation} disabled={isPending}>
            {createSO.isPending ? 'Saving…' : 'Save as Quotation'}
          </Button>
          <Button onClick={confirmOrder} disabled={isPending}>
            {isPending ? 'Confirming…' : 'Confirm Order'}
          </Button>
        </div>
      </section>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleAddCustomer)} className="space-y-4">
              <FormField control={customerForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={customerForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createCustomer.isPending}>{createCustomer.isPending ? 'Adding…' : 'Add Customer'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/(dashboard)/sales/edit-so/[id]/page.tsx`**

```typescript
'use client'

import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useSaleOrder } from '@/hooks/useSaleOrders'

export default function EditSOPage() {
  const { id } = useParams<{ id: string }>()
  const { data: so, isLoading } = useSaleOrder(id)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!so) return <div className="text-muted-foreground p-8 text-center">Sale order not found</div>

  // TODO: Render same form as create-so, pre-populated with so data.
  // Refactor: extract CreateSOPage form into a shared <SOForm initialSO={so}> component.
  // Only quotation-status SOs can be edited.
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Edit {so.so_number}</h1>
      <p className="text-muted-foreground">Edit form coming soon — only quotation-status orders can be edited.</p>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd D:/MMS && git add src/components/sales/SoLineItemsEditor.tsx \
  "src/app/(dashboard)/sales/create-so/page.tsx" \
  "src/app/(dashboard)/sales/edit-so/[id]/page.tsx"
git commit -m "feat: add Create SO page with line items editor, discount, customer search, margin warning"
```

- [ ] **Step 5: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 5: Create/Edit SO Page** — SoLineItemsEditor (inventory lookup per row, qty/price/total calc, negative margin warning icon), Create SO page (customer search+quick-add, line items, fixed/percentage discount, notes, save-as-quotation + confirm-order), Edit SO stub page
```
Commit: `docs: update PROGRESS.md — Sales Core Task 5 complete`

---

## Task 6: Sale Returns Page

**Files:**
- Create: `src/app/(dashboard)/sales/returns/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/sales/returns/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useSaleReturns,
  useCreateSaleReturn,
  useUpdateReturnStatus,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { useWarehouses } from '@/hooks/useInventory'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<SaleReturn['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-warning text-warning' },
  received:  { label: 'Received',  className: 'border-blue-500 text-blue-500' },
  restocked: { label: 'Restocked', className: 'border-success text-success' },
  closed:    { label: 'Closed',    className: 'border-muted-foreground/50 text-muted-foreground' },
}

const STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending: 'received',
  received: 'restocked',
  restocked: 'closed',
}

export default function SaleReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleReturn['status'] | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<SaleReturn | null>(null)

  // Create return form state
  const [soId, setSoId] = useState('')
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [returnItems, setReturnItems] = useState<SaleReturn['items']>([])

  const { data: returns, isLoading } = useSaleReturns({ search, status: statusFilter || undefined })
  const { data: orders } = useSaleOrders({ status: 'delivered' })
  const { data: warehouses } = useWarehouses()
  const createReturn = useCreateSaleReturn()
  const updateStatus = useUpdateReturnStatus()

  function handleSOSelect(id: string) {
    setSoId(id)
    const so = (orders ?? []).find((o) => o.id === id)
    if (!so) return
    // Pre-populate items from delivered line items
    setReturnItems(
      (so.sale_order_lines ?? [])
        .filter((l) => l.delivered_qty > 0)
        .map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty: 0,
          condition: 'good' as const,
          brand_variant_id: l.brand_variant_id,
        }))
    )
  }

  function handleCreateReturn() {
    if (!soId) { toast.error('Select a sale order'); return }
    if (!reason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }

    createReturn.mutate(
      {
        source_id: soId,
        date: returnDate,
        reason,
        items,
        restock_warehouse_id: warehouseId || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Return created')
          setCreateOpen(false)
          setSoId(''); setReason(''); setNotes(''); setReturnItems([])
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAdvanceStatus(ret: SaleReturn) {
    const next = STATUS_NEXT[ret.status]
    if (!next) return
    updateStatus.mutate(
      { id: ret.id, status: next },
      {
        onSuccess: () => toast.success(`Return marked as ${next}`),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale Returns"
        description="Manage customer returns and restocking"
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create Return</Button>}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return number…" />
        <div className="flex flex-wrap gap-2">
          {(['', 'pending', 'received', 'restocked', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Returns list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : (returns ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No sale returns found
        </div>
      ) : (
        <div className="space-y-3">
          {(returns ?? []).map((ret) => {
            const cfg = STATUS_CONFIG[ret.status]
            const next = STATUS_NEXT[ret.status]
            return (
              <div
                key={ret.id}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="font-mono font-semibold text-sm hover:underline"
                      onClick={() => setDetailReturn(ret)}
                    >
                      {ret.return_number}
                    </button>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdvanceStatus(ret)}
                      disabled={updateStatus.isPending}
                    >
                      Mark as {STATUS_CONFIG[next].label}
                    </Button>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Return Detail Dialog */}
      <Dialog open={!!detailReturn} onOpenChange={(open) => { if (!open) setDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {detailReturn && (
            <>
              <DialogHeader>
                <DialogTitle>Return {detailReturn.return_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(detailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {detailReturn.reason}</div>
                  {detailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {detailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Condition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{item.item_name}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${item.condition === 'damaged' ? 'border-destructive text-destructive' : 'border-success text-success'}`}>
                              {item.condition}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailReturn(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Return Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create Sale Return</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* SO Selector */}
            <div className="space-y-1">
              <Label htmlFor="return-so">Sale Order (delivered) *</Label>
              <select
                id="return-so"
                value={soId}
                onChange={(e) => handleSOSelect(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select sale order…</option>
                {(orders ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.so_number} — {o.customer_name ?? 'Unknown'}</option>
                ))}
              </select>
            </div>

            {/* Date + Warehouse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="return-date">Return Date *</Label>
                <Input id="return-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="return-warehouse">Restock Warehouse</Label>
                <select
                  id="return-warehouse"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">No restocking</option>
                  {(warehouses ?? []).map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <Label htmlFor="return-reason">Reason *</Label>
              <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective item, wrong item shipped…" />
            </div>

            {/* Items */}
            {returnItems.length > 0 && (
              <div className="space-y-2">
                <Label>Return Items</Label>
                {returnItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], qty: Math.max(0, Number(e.target.value)) }
                          setReturnItems(updated)
                        }}
                        className="w-20 text-right"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], condition: item.condition === 'good' ? 'damaged' : 'good' }
                          setReturnItems(updated)
                        }}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs font-medium transition-colors min-h-9',
                          item.condition === 'good'
                            ? 'border-success text-success'
                            : 'border-destructive text-destructive'
                        )}
                      >
                        {item.condition}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="return-notes">Notes</Label>
              <Textarea id="return-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createReturn.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreateReturn} disabled={createReturn.isPending}>
              {createReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd D:/MMS && git add "src/app/(dashboard)/sales/returns/page.tsx"
git commit -m "feat: add Sale Returns page with create return dialog and status pipeline"
```

- [ ] **Step 3: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Sales Core Task 6: Sale Returns Page** — returns list with status chips, create return dialog (SO selector, per-item qty + condition toggle, restock warehouse), return detail dialog, advance-status pipeline (pending → received → restocked → closed)
```
Commit: `docs: update PROGRESS.md — Sales Core Task 6 complete`

---

## Task 7: Integration Test + PROGRESS.md

- [ ] **Step 1: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit --pretty 2>&1 | grep -v "node_modules" | head -40
```

Fix any new errors. Pre-existing stale-types errors (cast with `as any`) are acceptable.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm run test:run
```

Expected: All 21 tests pass.

- [ ] **Step 3: Run build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -40
```

Expected: Build succeeds. Look for these sales routes in the output:
- `/sales/orders`
- `/sales/create-so`
- `/sales/edit-so/[id]`
- `/sales/returns`

Fix any build errors before proceeding.

- [ ] **Step 4: Final PROGRESS.md update**

Read `PROGRESS.md`, then:

1. In **`## Implementation Plans`** table, add a new row:
   ```
   | `docs/superpowers/plans/2026-04-17-mms-sales-core.md` | **DONE** | Sale Orders list, Create SO, SO detail, Sale Returns |
   ```

2. In **`## ✅ Completed`**, add:
   ```
   - [2026-04-17] **Sales Core plan: COMPLETE** — All 7 tasks done. 4 pages, 3 hooks, 5+ components, full SO lifecycle (quotation → confirm → deliver → pay → return).
   ```

3. Change **`## 🔄 In Progress`** to:
   ```
   ## 🔄 In Progress

   - Writing Purchase Operations plan (Shipments, Landed Costs, Warehouses hub, Returns, Dead Stock)
   ```

4. Change **`## ⏳ Not Started`** to:
   ```
   ## ⏳ Not Started

   - Purchase Operations module (Shipments, Landed Costs, Warehouses hub, Returns, Dead Stock)
   - CSV Import tool
   ```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: mark Sales Core plan complete — all 7 tasks done"
```
