# Purchase Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Purchase Orders list, Create/Edit PO form, PO detail dialog, and Approvals page — the core purchase workflow.

**Architecture:** TanStack Query hooks for all purchase tables, shared status/approval-chain components, a full-page create/edit form at `/purchase/create-po` and `/purchase/edit-po/[id]`, and a list page at `/purchase/orders` with a slide-over detail dialog.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (client-side), TanStack Query v5, shadcn/ui (Base UI), zod + react-hook-form, sonner toasts, Tailwind CSS.

---

## CRITICAL codebase rules — read before writing any code

1. `DropdownMenuTrigger` does **NOT** support `asChild` — use `className` directly.
2. `DropdownMenuLabel` **MUST** be inside `<DropdownMenuGroup>` or crashes with `MenuGroupRootContext is missing`.
3. `zodResolver(schema) as never` — always add `as never` to bypass zod v4 TS inference.
4. Supabase client: `import { createClient } from '@/lib/supabase/client'`
5. Types: `DBTable<'t'>`, `DBInsert<'t'>`, `DBUpdate<'t'>` from `@/types/database.types` — if the generated types are stale (column missing), cast the whole query builder: `(supabase as any).from(...)`.
6. **Responsive design is mandatory** — every component must work at phone/tablet/laptop/TV breakpoints. Dialogs: `w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg`. Touch targets: `min-h-11`.

## Key schema facts

**`purchase_orders`**: id, po_number (text NOT NULL UNIQUE), supplier_id, supplier_name, status (`po_status` enum: `draft | pending_approval | approved | partially_received | received | cancelled`), currency, exchange_rate, subtotal, total_qar, created_date, expected_delivery, approval_level (int 1–3), payment_terms, payment_terms_notes, delivery_terms, delivery_terms_notes, vendor_notes, discount_amount, discount_label.

**`po_line_items`**: id, po_id, item_name, sku, qty, received_qty (default 0), unit, unit_price, total_price, fifo_layers (jsonb), brand_variant_id (nullable), tool_asset_item_id (nullable), brand_id (nullable), free_qty (default 0).

**`po_approvals`**: id, po_id, role (`approval_role` enum), status (`approval_status` enum: `pending | approved | rejected`), approved_by (text), date, comment.

**`receivals`**: id, receival_number, po_id, warehouse_id, received_by_name, date, status (`receival_status` enum), notes.

**`receival_items`**: id, receival_id, po_line_item_id, item_name, sku, qty_received, unit_cost, is_free, brand_variant_id.

**`payments`**: id, amount, method (`payment_method` enum), date, reference, notes, source_type (text, use `'purchase_order'`), source_id (uuid = po.id), supplier_id, currency, exchange_rate, amount_qar.

**Approval level rules** (thresholds are configurable; use these defaults):
- Level 1 (total_qar < 5000): role = `purchase_manager`
- Level 2 (5000–50000): roles = `purchase_manager`, `accountant`
- Level 3 (≥ 50000): roles = `purchase_manager`, `accountant`, `owner`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/usePurchaseOrders.ts` | List, single PO, payments, receivals queries + create/update/submit mutations |
| `src/hooks/usePOApprovals.ts` | Pending/completed approvals list, approve step, reject PO mutations |
| `src/components/purchase/PoStatusBadge.tsx` | Color-coded PO status badge |
| `src/components/purchase/PoApprovalChain.tsx` | Compact icon row for approval steps |
| `src/components/purchase/InventoryItemLookup.tsx` | Searchable combobox over inventory_items + brand_variants |
| `src/components/purchase/PoPaymentDialog.tsx` | Record payment form dialog |
| `src/components/purchase/PoDetailDialog.tsx` | 4-tab read-only PO detail dialog |
| `src/components/purchase/PoLineItemsEditor.tsx` | Dynamic line items editor (used in create/edit form) |
| `src/components/purchase/PoTermsSection.tsx` | Payment/delivery terms with preset selectors |
| `src/app/(dashboard)/purchase/orders/page.tsx` | PO list page with filters |
| `src/app/(dashboard)/purchase/create-po/page.tsx` | Create PO form page |
| `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` | Edit PO form page (fetches PO then renders same form) |
| `src/app/(dashboard)/purchase/approvals/page.tsx` | Approval queue page |

---

## Task 1: Purchase Hooks

**Files:**
- Create: `src/hooks/usePurchaseOrders.ts`
- Create: `src/hooks/usePOApprovals.ts`

- [ ] **Step 1: Create `src/hooks/usePurchaseOrders.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'

export type POLineItem = {
  id: string
  po_id: string
  item_name: string
  sku: string | null
  qty: number
  received_qty: number
  free_qty: number
  unit: string
  unit_price: number
  total_price: number
  fifo_layers: unknown
  brand_variant_id: string | null
  tool_asset_item_id: string | null
  brand_id: string | null
  created_at: string
}

export type POApprovalStep = {
  id: string
  po_id: string
  role: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  date: string | null
  comment: string | null
}

export type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string
  supplier_name: string
  status: POStatus
  currency: string
  exchange_rate: number
  subtotal: number
  total_qar: number
  created_date: string
  expected_delivery: string | null
  approval_level: number
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  // joined
  po_line_items?: POLineItem[]
  po_approvals?: POApprovalStep[]
}

export type POPayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  source_type: string
  source_id: string
  supplier_id: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type POReceival = {
  id: string
  receival_number: string
  po_id: string
  warehouse_id: string
  received_by_name: string | null
  date: string
  status: string
  notes: string | null
  created_at: string
  // joined
  receival_items?: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free: boolean
  }[]
}

export type POLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit: string
  unit_price: number
  total_price: number
  brand_variant_id: string | null
  free_qty: number
}

export type CreatePOPayload = {
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  expected_delivery: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  line_items: POLineItemDraft[]
}

export type UpdatePOPayload = Partial<CreatePOPayload> & { id: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcApprovalLevel(totalQar: number): number {
  if (totalQar < 5000) return 1
  if (totalQar < 50000) return 2
  return 3
}

export function getApprovalRoles(level: number): string[] {
  if (level === 1) return ['purchase_manager']
  if (level === 2) return ['purchase_manager', 'accountant']
  return ['purchase_manager', 'accountant', 'owner']
}

async function generatePONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await (supabase as any)
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(5, '0')
  return `PO-${seq}`
}

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface POFilters {
  search?: string
  status?: POStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters: POFilters = {}) {
  return useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('purchase_orders')
        .select('*, po_approvals(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) query = query.eq('status', filters.status)
      if (filters.dateFrom) query = query.gte('created_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_date', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        query = query.or(`po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    enabled: !!id,
  })
}

export function usePOPayments(poId: string | null) {
  return useQuery({
    queryKey: ['po-payments', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POPayment[]
    },
    enabled: !!poId,
  })
}

export function usePOReceivalsByPO(poId: string | null) {
  return useQuery({
    queryKey: ['po-receivals', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('receivals')
        .select('*, receival_items(*)')
        .eq('po_id', poId!)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POReceival[]
    },
    enabled: !!poId,
  })
}

export function useCreatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const supabase = createClient()
      const po_number = await generatePONumber(supabase)

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { data: po, error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .insert({
          po_number,
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          status: 'draft',
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          created_date: new Date().toISOString().split('T')[0],
          expected_delivery: payload.expected_delivery,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .select()
        .single()
      if (poErr) throw poErr

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: po.id })))
        if (liErr) throw liErr
      }

      return po as PurchaseOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useUpdatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdatePOPayload & { line_items?: POLineItemDraft[] }) => {
      const supabase = createClient()

      // Recalculate totals if line items provided
      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = line_items.reduce((s, li) => s + li.total_price, 0)
        const discount = (fields as any).discount_amount ?? 0
        const rate = (fields as any).exchange_rate ?? 1
        const total_qar = (subtotal - discount) * rate
        extraFields = { subtotal, total_qar, approval_level: calcApprovalLevel(total_qar) }
      }

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (poErr) throw poErr

      if (line_items) {
        // Delete existing line items and re-insert
        await (supabase as any).from('po_line_items').delete().eq('po_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await (supabase as any)
            .from('po_line_items')
            .insert(line_items.map((li) => ({ ...li, po_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}

export function useSubmitPOForApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approval_level }: { id: string; approval_level: number }) => {
      const supabase = createClient()
      const roles = getApprovalRoles(approval_level)

      // Create approval steps
      const { error: approvalErr } = await (supabase as any)
        .from('po_approvals')
        .insert(roles.map((role) => ({ po_id: id, role, status: 'pending' })))
      if (approvalErr) throw approvalErr

      // Update PO status
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (poErr) throw poErr
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}

export function useCreatePOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      po_id: string
      supplier_id: string
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
        source_type: 'purchase_order',
        source_id: payment.po_id,
        supplier_id: payment.supplier_id,
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
      queryClient.invalidateQueries({ queryKey: ['po-payments', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}
```

- [ ] **Step 2: Create `src/hooks/usePOApprovals.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrder } from './usePurchaseOrders'

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'pending'],
    queryFn: async () => {
      const supabase = createClient()
      // POs that are in pending_approval status with at least one pending step
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCompletedApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'completed'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .in('status', ['approved', 'partially_received', 'received', 'cancelled'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 60 * 1000,
  })
}

export function useApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      poId,
      approvedBy,
      comment,
      allStepsWillBeApproved,
    }: {
      stepId: string
      poId: string
      approvedBy: string
      comment: string
      allStepsWillBeApproved: boolean
    }) => {
      const supabase = createClient()

      // Approve this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        })
        .eq('id', stepId)
      if (stepErr) throw stepErr

      // If all steps are approved, update PO to approved
      if (allStepsWillBeApproved) {
        const { error: poErr } = await (supabase as any)
          .from('purchase_orders')
          .update({ status: 'approved' })
          .eq('id', poId)
        if (poErr) throw poErr
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useRejectPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poId,
      stepId,
      rejectedBy,
      comment,
      mode,
    }: {
      poId: string
      stepId: string
      rejectedBy: string
      comment: string
      mode: 'full_rejection' | 'send_back_to_rfq'
    }) => {
      const supabase = createClient()

      // Reject this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals')
        .update({
          status: 'rejected',
          approved_by: rejectedBy,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        })
        .eq('id', stepId)
      if (stepErr) throw stepErr

      const newStatus = mode === 'full_rejection' ? 'cancelled' : 'draft'

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', poId)
      if (poErr) throw poErr

      // If send back to RFQ, reset all pending steps to pending
      if (mode === 'send_back_to_rfq') {
        await (supabase as any)
          .from('po_approvals')
          .delete()
          .eq('po_id', poId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: No new errors (pre-existing `@tanstack/react-table` and `sonner` errors are OK).

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/hooks/usePurchaseOrders.ts src/hooks/usePOApprovals.ts
git commit -m "feat: add purchase order and approval hooks"
```

---

## Task 2: Shared Purchase Components

**Files:**
- Create: `src/components/purchase/PoStatusBadge.tsx`
- Create: `src/components/purchase/PoApprovalChain.tsx`
- Create: `src/components/purchase/InventoryItemLookup.tsx`
- Create: `src/components/purchase/PoPaymentDialog.tsx`

- [ ] **Step 1: Create `src/components/purchase/PoStatusBadge.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { POStatus } from '@/hooks/usePurchaseOrders'

const STATUS_CONFIG: Record<POStatus, { label: string; className: string }> = {
  draft:               { label: 'Draft',              className: 'border-muted-foreground/40 text-muted-foreground' },
  pending_approval:    { label: 'Pending Approval',   className: 'border-warning text-warning' },
  approved:            { label: 'Approved',            className: 'border-success text-success' },
  partially_received:  { label: 'Partially Received', className: 'border-blue-500 text-blue-500' },
  received:            { label: 'Received',            className: 'border-success text-success bg-success/10' },
  cancelled:           { label: 'Cancelled',           className: 'border-destructive text-destructive' },
}

export function PoStatusBadge({ status, className }: { status: POStatus; className?: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}
```

- [ ] **Step 2: Create `src/components/purchase/PoApprovalChain.tsx`**

```typescript
import { Check, X, Clock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { POApprovalStep } from '@/hooks/usePurchaseOrders'

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'PM',
  accountant: 'AC',
  owner: 'OW',
}

export function PoApprovalChain({ steps }: { steps: POApprovalStep[] }) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-1">
          {idx > 0 && <div className="h-px w-3 bg-muted-foreground/30" />}
          <div
            title={`${step.role}: ${step.status}`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold',
              step.status === 'approved' && 'border-success bg-success/10 text-success',
              step.status === 'rejected' && 'border-destructive bg-destructive/10 text-destructive',
              step.status === 'pending' && 'border-muted-foreground/40 bg-muted text-muted-foreground',
            )}
          >
            {step.status === 'approved' ? <Check className="h-3 w-3" /> :
             step.status === 'rejected' ? <X className="h-3 w-3" /> :
             <span>{ROLE_LABELS[step.role] ?? '?'}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/purchase/InventoryItemLookup.tsx`**

This is a searchable combobox that queries `inventory_items` joined with `inventory_brand_variants`. When a variant is selected, it returns the item name, SKU, unit, and cost price.

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type InventoryLookupResult = {
  brand_variant_id: string
  item_name: string
  item_name_ar: string | null
  sku: string | null
  unit: string
  cost_price: number
  selling_price: number
}

interface InventoryItemLookupProps {
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  placeholder?: string
  className?: string
}

export function InventoryItemLookup({ value, onChange, placeholder = 'Search inventory…', className }: InventoryItemLookupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InventoryLookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      const safe = query.replace(/%/g, '\\%')
      const { data } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, code, cost_price, selling_price, inventory_items!inner(name_en, name_ar, sku, unit)')
        .or(`inventory_items.name_en.ilike.%${safe}%,code.ilike.%${safe}%`)
        .eq('inventory_items.status', 'active')
        .limit(20)

      setResults(
        (data ?? []).map((r: any) => ({
          brand_variant_id: r.id,
          item_name: r.inventory_items.name_en,
          item_name_ar: r.inventory_items.name_ar,
          sku: r.code ?? r.inventory_items.sku,
          unit: r.inventory_items.unit,
          cost_price: r.cost_price ?? 0,
          selling_price: r.selling_price ?? 0,
        }))
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (value) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm', className)}>
        <span className="flex-1 font-medium">{value.item_name}</span>
        {value.sku && <span className="text-xs text-muted-foreground">{value.sku}</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={() => onChange(null)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (query.length >= 2) && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {results.map((item) => (
            <button
              key={item.brand_variant_id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(item); setQuery(''); setOpen(false) }}
            >
              <div className="text-left">
                <div className="font-medium">{item.item_name}</div>
                {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {item.unit}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/purchase/PoPaymentDialog.tsx`**

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
import { useCreatePOPayment } from '@/hooks/usePurchaseOrders'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'

const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque', 'credit_card', 'debit_card', 'online', 'other',
] as const

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(PAYMENT_METHODS),
  date: z.string().min(1, 'Date is required'),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

interface PoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder
}

export function PoPaymentDialog({ open, onOpenChange, po }: PoPaymentDialogProps) {
  const createPayment = useCreatePOPayment()

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: {
      amount: 0,
      method: 'bank_transfer',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    },
  })

  function onSubmit(values: PaymentFormValues) {
    createPayment.mutate(
      {
        po_id: po.id,
        supplier_id: po.supplier_id,
        amount: values.amount,
        method: values.method,
        date: values.date,
        reference: values.reference || null,
        notes: values.notes || null,
        currency: po.currency,
        exchange_rate: po.exchange_rate,
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
          <DialogTitle>Record Payment — {po.po_number}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ({po.currency}) *</FormLabel>
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

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/components/purchase/
git commit -m "feat: add purchase shared components — status badge, approval chain, inventory lookup, payment dialog"
```

---

## Task 3: PO Detail Dialog

**Files:**
- Create: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Create `src/components/purchase/PoDetailDialog.tsx`**

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
import { PoStatusBadge } from './PoStatusBadge'
import { PoApprovalChain } from './PoApprovalChain'
import { PoPaymentDialog } from './PoPaymentDialog'
import {
  usePurchaseOrder,
  usePOPayments,
  usePOReceivalsByPO,
  type PurchaseOrder,
} from '@/hooks/usePurchaseOrders'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface PoDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder | null
  onEdit?: (po: PurchaseOrder) => void
}

export function PoDetailDialog({ open, onOpenChange, po, onEdit }: PoDetailDialogProps) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const { data: fullPO, isLoading } = usePurchaseOrder(open ? (po?.id ?? null) : null)
  const { data: payments } = usePOPayments(open ? (po?.id ?? null) : null)
  const { data: receivals } = usePOReceivalsByPO(open ? (po?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && po?.id ? { module: 'purchase_orders', search: po.id } : {}
  )

  const current = fullPO ?? po

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{current?.po_number}</DialogTitle>
              {current && <PoStatusBadge status={current.status} />}
              {current?.po_approvals && current.po_approvals.length > 0 && (
                <PoApprovalChain steps={current.po_approvals} />
              )}
            </div>
            {current && (
              <div className="text-sm text-muted-foreground">
                {current.supplier_name} · {current.currency} · {formatDate(current.created_date)}
              </div>
            )}
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0">
                <TabsTrigger value="items">Line Items</TabsTrigger>
                <TabsTrigger value="receivals">Receivals</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              {/* ── Line Items ───────────────────────────────────── */}
              <TabsContent value="items" className="flex-1 overflow-y-auto">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden sm:table-cell">SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Free</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Received</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fullPO?.po_line_items ?? []).map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="font-medium">{li.item_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="hidden md:table-cell text-right text-muted-foreground">{li.free_qty || '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">{li.received_qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(li.unit_price, current?.currency)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(li.total_price, current?.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {current && (
                  <div className="mt-4 space-y-1 text-sm text-right pr-2">
                    <div className="text-muted-foreground">Subtotal: <span className="text-foreground font-medium">{formatCurrency(current.subtotal, current.currency)}</span></div>
                    {current.discount_amount > 0 && (
                      <div className="text-muted-foreground">
                        Discount{current.discount_label ? ` (${current.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(current.discount_amount, current.currency)}</span>
                      </div>
                    )}
                    <div className="font-semibold">Total (QAR): {formatCurrency(current.total_qar, 'QAR')}</div>
                  </div>
                )}
              </TabsContent>

              {/* ── Receivals ────────────────────────────────────── */}
              <TabsContent value="receivals" className="flex-1 overflow-y-auto space-y-3">
                {(receivals ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No receivals yet</p>
                ) : (
                  (receivals ?? []).map((r) => (
                    <div key={r.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.receival_number}</span>
                        <Badge variant="outline" className="text-xs">{r.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.date)} · {r.received_by_name ?? 'Unknown'}</div>
                      {r.receival_items && r.receival_items.length > 0 && (
                        <div className="rounded border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Item</TableHead>
                                <TableHead className="text-xs text-right">Qty</TableHead>
                                <TableHead className="text-xs text-right">Unit Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.receival_items.map((ri) => (
                                <TableRow key={ri.id}>
                                  <TableCell className="text-xs">{ri.item_name}{ri.is_free && <Badge variant="outline" className="ml-1 text-[10px] h-4">Free</Badge>}</TableCell>
                                  <TableCell className="text-xs text-right">{ri.qty_received}</TableCell>
                                  <TableCell className="text-xs text-right">{formatCurrency(ri.unit_cost)}</TableCell>
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
                {current && ['approved', 'partially_received', 'received'].includes(current.status) && (
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
                            <TableHead className="hidden sm:table-cell">QAR</TableHead>
                            <TableHead className="hidden sm:table-cell">Method</TableHead>
                            <TableHead className="hidden md:table-cell">Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(payments ?? []).map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(p.amount, p.currency)}</TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground">{formatCurrency(p.amount_qar ?? p.amount)}</TableCell>
                              <TableCell className="hidden sm:table-cell capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Payment progress bar */}
                    {current && (() => {
                      const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
                      const pct = Math.min(100, (totalPaid / current.total_qar) * 100)
                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Paid: {formatCurrency(totalPaid)}</span>
                            <span>Total: {formatCurrency(current.total_qar)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })()}
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
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t">
              {current.status === 'draft' && onEdit && (
                <Button variant="outline" size="sm" onClick={() => { onEdit(current); onOpenChange(false) }}>
                  Edit PO
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
        <PoPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          po={current}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoDetailDialog.tsx
git commit -m "feat: add PO detail dialog with 4 tabs (line items, receivals, payments, activity)"
```

---

## Task 4: Purchase Orders List Page

**Files:**
- Create: `src/app/(dashboard)/purchase/orders/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/orders/page.tsx`**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { usePurchaseOrders, type PurchaseOrder, type POStatus } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUSES: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)

  // Debounce search
  const searchRef = useState<ReturnType<typeof setTimeout> | null>(null)
  function handleSearch(val: string) {
    setSearch(val)
    if (searchRef[0]) clearTimeout(searchRef[0])
    searchRef[1](setTimeout(() => setDebouncedSearch(val), 300))
  }

  const { data: orders, isLoading } = usePurchaseOrders({
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<POStatus, number>> = {}
    ;(orders ?? []).forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    })
    return counts
  }, [orders])

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(() => [
    {
      accessorKey: 'po_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('po_number')}</span>,
    },
    {
      accessorKey: 'supplier_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('supplier_name')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <PoStatusBadge status={row.getValue('status')} />,
    },
    {
      accessorKey: 'currency',
      header: 'CCY',
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.getValue('currency')}</Badge>,
    },
    {
      accessorKey: 'subtotal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtotal" />,
      cell: ({ row }) => (
        <span className="text-sm">{formatCurrency(row.getValue('subtotal'), row.original.currency)}</span>
      ),
    },
    {
      accessorKey: 'total_qar',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total (QAR)" />,
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency(row.getValue('total_qar'), 'QAR')}</span>
      ),
    },
    {
      accessorKey: 'created_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.getValue('created_date'))}</span>
      ),
    },
    {
      id: 'approvals',
      header: 'Approvals',
      cell: ({ row }) => {
        const steps = row.original.po_approvals ?? []
        return steps.length > 0 ? <PoApprovalChain steps={steps} /> : <span className="text-muted-foreground text-xs">—</span>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDetailPO(row.original)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Manage POs, payments, deliveries and approvals"
        actions={
          <Button onClick={() => router.push('/purchase/create-po')}>
            + Create PO
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
        <SearchInput value={search} onChange={handleSearch} placeholder="Search PO number or supplier…" />
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            title="To date"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear dates
            </Button>
          )}
        </div>
      </div>

      <DataTable columns={columns} data={orders ?? []} isLoading={isLoading} />

      <PoDetailDialog
        open={!!detailPO}
        onOpenChange={(open) => { if (!open) setDetailPO(null) }}
        po={detailPO}
        onEdit={(po) => router.push(`/purchase/edit-po/${po.id}`)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify `PageHeader` supports `actions` prop**

Read `src/components/shared/PageHeader.tsx`. If it doesn't have an `actions` prop, add it:

```typescript
// In PageHeader.tsx, ensure this interface and render:
interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode  // add this line if missing
}

// In the JSX, add after description:
// {actions && <div className="flex items-center gap-2">{actions}</div>}
```

If `PageHeader` already accepts `actions`, skip this step.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/app/\(dashboard\)/purchase/orders/page.tsx src/components/shared/PageHeader.tsx
git commit -m "feat: add Purchase Orders list page with status filters, date range, DataTable"
```

---

## Task 5: Create/Edit PO Page

**Files:**
- Create: `src/components/purchase/PoLineItemsEditor.tsx`
- Create: `src/components/purchase/PoTermsSection.tsx`
- Create: `src/app/(dashboard)/purchase/create-po/page.tsx`
- Create: `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/purchase/PoLineItemsEditor.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InventoryItemLookup, type InventoryLookupResult } from './InventoryItemLookup'
import { formatCurrency } from '@/lib/utils/formatters'
import type { POLineItemDraft } from '@/hooks/usePurchaseOrders'

export type LineItemRow = POLineItemDraft & {
  _key: string // client-only stable key
}

const LINE_TYPES = [
  { value: 'inventory', label: 'Products', emoji: '📦' },
  { value: 'spare_parts', label: 'Spare Parts', emoji: '⚙️' },
  { value: 'consumable', label: 'Consumables', emoji: '💧' },
] as const

interface PoLineItemsEditorProps {
  value: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  currency: string
}

export function PoLineItemsEditor({ value, onChange, currency }: PoLineItemsEditorProps) {
  const [lineType, setLineType] = useState<string>('inventory')

  function addRow() {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        item_name: '',
        sku: '',
        qty: 1,
        unit: 'pcs',
        unit_price: 0,
        total_price: 0,
        brand_variant_id: null,
        free_qty: 0,
      },
    ])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        // Recalculate total when qty or price changes
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total_price = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleItemSelected(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, brand_variant_id: null })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      sku: item.sku ?? '',
      unit: item.unit,
      unit_price: item.cost_price,
      total_price: item.cost_price, // qty defaults to 1
      brand_variant_id: item.brand_variant_id,
    })
  }

  const grandTotal = value.reduce((s, r) => s + r.total_price, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LINE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setLineType(t.value)}
            className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              lineType === t.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {value.map((row, idx) => (
          <div key={row._key} className="grid grid-cols-12 gap-2 items-start rounded-md border p-2">
            {/* Item lookup */}
            <div className="col-span-12 sm:col-span-5">
              <InventoryItemLookup
                value={row.brand_variant_id ? {
                  brand_variant_id: row.brand_variant_id,
                  item_name: row.item_name,
                  item_name_ar: null,
                  sku: row.sku,
                  unit: row.unit,
                  cost_price: row.unit_price,
                  selling_price: 0,
                } : null}
                onChange={(item) => handleItemSelected(row._key, item)}
                placeholder={`Item ${idx + 1}…`}
              />
            </div>

            {/* SKU (read-only) */}
            <div className="col-span-4 sm:col-span-2">
              <Input
                placeholder="SKU"
                value={row.sku}
                onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                className="text-xs"
              />
            </div>

            {/* Qty */}
            <div className="col-span-3 sm:col-span-1">
              <Input
                type="number"
                min="1"
                value={row.qty}
                onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                placeholder="Qty"
                className="text-xs"
              />
            </div>

            {/* Unit */}
            <div className="col-span-3 sm:col-span-1">
              <Input
                value={row.unit}
                onChange={(e) => updateRow(row._key, { unit: e.target.value })}
                placeholder="Unit"
                className="text-xs"
              />
            </div>

            {/* Unit Price */}
            <div className="col-span-5 sm:col-span-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={row.unit_price}
                onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                placeholder="Price"
                className="text-xs"
              />
            </div>

            {/* Total + Delete */}
            <div className="col-span-7 sm:col-span-1 flex items-center justify-between gap-1">
              <span className="text-xs font-medium">{formatCurrency(row.total_price, currency)}</span>
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
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" />
          Add Line
        </Button>
        <div className="text-sm font-semibold">
          Total: {formatCurrency(grandTotal, currency)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/purchase/PoTermsSection.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PAYMENT_TERM_PRESETS = [
  { label: '100% Advance', value: '100% Advance' },
  { label: '50/50', value: '50/50' },
  { label: '30/70', value: '30/70' },
  { label: 'Custom', value: 'Custom' },
]

const DELIVERY_TERM_PRESETS = [
  { label: 'EXW', value: 'EXW' },
  { label: 'FOB', value: 'FOB' },
  { label: 'CIF', value: 'CIF' },
  { label: 'DDP', value: 'DDP' },
  { label: 'DAP', value: 'DAP' },
  { label: 'Custom', value: 'Custom' },
]

export interface PoTermsValues {
  payment_terms: string
  payment_terms_notes: string
  delivery_terms: string
  delivery_terms_notes: string
  vendor_notes: string
}

interface PoTermsSectionProps {
  value: PoTermsValues
  onChange: (values: PoTermsValues) => void
}

export function PoTermsSection({ value, onChange }: PoTermsSectionProps) {
  function set(key: keyof PoTermsValues, val: string) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div className="space-y-4">
      {/* Payment Terms */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Payment Terms</Label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_TERM_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set('payment_terms', p.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                value.payment_terms === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {value.payment_terms === 'Custom' && (
          <Input
            placeholder="Describe custom payment terms…"
            value={value.payment_terms_notes}
            onChange={(e) => set('payment_terms_notes', e.target.value)}
          />
        )}
      </div>

      {/* Delivery Terms */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery Terms</Label>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_TERM_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set('delivery_terms', p.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                value.delivery_terms === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Delivery notes…"
          value={value.delivery_terms_notes}
          onChange={(e) => set('delivery_terms_notes', e.target.value)}
        />
      </div>

      {/* Vendor Notes */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Vendor Notes</Label>
        <Textarea
          placeholder="Notes to vendor…"
          value={value.vendor_notes}
          onChange={(e) => set('vendor_notes', e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/(dashboard)/purchase/create-po/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { PoLineItemsEditor, type LineItemRow } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { useCreatePO, useSubmitPOForApproval, calcApprovalLevel } from '@/hooks/usePurchaseOrders'
import { useSuppliers, useCreateSupplier } from '@/hooks/useSuppliers'
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

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const

// Supplier quick-add schema
const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
})

export default function CreatePOPage() {
  const router = useRouter()
  const createPO = useCreatePO()
  const submitForApproval = useSubmitPOForApproval()
  const { data: suppliers } = useSuppliers()
  const createSupplier = useCreateSupplier()

  // Form state
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [currency, setCurrency] = useState<string>('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [terms, setTerms] = useState<PoTermsValues>({
    payment_terms: '', payment_terms_notes: '', delivery_terms: '', delivery_terms_notes: '', vendor_notes: '',
  })
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)

  // Computed
  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const totalQar = (subtotal - discountAmount) * exchangeRate
  const approvalLevel = calcApprovalLevel(totalQar)

  const supplierForm = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema) as never,
    defaultValues: { name: '', contact_name: '', phone: '', email: '' },
  })

  function handleSelectSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierSearch(s.name)
  }

  function handleAddSupplier(values: z.infer<typeof supplierSchema>) {
    createSupplier.mutate(
      { name: values.name, contact_name: values.contact_name || null, phone: values.phone || null, email: values.email || null },
      {
        onSuccess: (data: any) => {
          toast.success('Supplier added')
          handleSelectSupplier({ id: data.id, name: data.name })
          setAddSupplierOpen(false)
          supplierForm.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function buildPayload() {
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: expectedDelivery || null,
      payment_terms: terms.payment_terms || null,
      payment_terms_notes: terms.payment_terms_notes || null,
      delivery_terms: terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      vendor_notes: terms.vendor_notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      line_items: lineItems.map(({ _key, ...li }) => li),
    }
  }

  function validate() {
    if (!supplierId) { toast.error('Please select a supplier'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name)) { toast.error('All line items need an item name'); return false }
    return true
  }

  function saveDraft() {
    if (!validate()) return
    createPO.mutate(buildPayload(), {
      onSuccess: () => { toast.success('Saved as draft'); router.push('/purchase/orders') },
      onError: (err) => toast.error(err.message),
    })
  }

  function submitApproval() {
    if (!validate()) return
    createPO.mutate(buildPayload(), {
      onSuccess: (po: any) => {
        submitForApproval.mutate(
          { id: po.id, approval_level: approvalLevel },
          {
            onSuccess: () => { toast.success('Submitted for approval'); router.push('/purchase/orders') },
            onError: (err) => toast.error(err.message),
          }
        )
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending = createPO.isPending || submitForApproval.isPending

  const filteredSuppliers = (suppliers ?? []).filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Purchase Order</h1>
      </div>

      {/* Supplier Selection */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Supplier</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search suppliers…"
              value={supplierSearch}
              onChange={(e) => { setSupplierSearch(e.target.value); setSupplierId(''); setSupplierName('') }}
              className="w-full"
            />
            {supplierSearch && !supplierId && filteredSuppliers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => handleSelectSupplier(s)}
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.category && <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(true)}>
            + Add Supplier
          </Button>
        </div>
        {supplierId && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-success border-success">✓ {supplierName}</Badge>
          </div>
        )}
      </section>

      {/* PO Settings */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">PO Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Currency</Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {currency !== 'QAR' && (
            <div className="space-y-1">
              <Label>Exchange Rate (to QAR)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Expected Delivery</Label>
            <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Line Items */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Line Items</h2>
        <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} />
      </section>

      {/* Terms */}
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold mb-4">Terms</h2>
        <PoTermsSection value={terms} onChange={setTerms} />
      </section>

      {/* Discount */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Discount</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Discount Label</Label>
            <Input
              placeholder="e.g. Loyalty discount"
              value={discountLabel}
              onChange={(e) => setDiscountLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Discount Amount ({currency})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Footer summary */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1 text-sm text-right">
          <div className="text-muted-foreground">Subtotal: <span className="text-foreground">{formatCurrency(subtotal, currency)}</span></div>
          {discountAmount > 0 && (
            <div className="text-muted-foreground">Discount: <span className="text-destructive">-{formatCurrency(discountAmount, currency)}</span></div>
          )}
          <div className="font-semibold text-base">Total (QAR): {formatCurrency(totalQar, 'QAR')}</div>
        </div>
        {/* Approval level preview */}
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Approval level: <span className="font-semibold text-foreground">Level {approvalLevel}</span>
            {' '}({approvalLevel === 1 ? 'Purchase Manager' : approvalLevel === 2 ? 'PM → Accountant' : 'PM → Accountant → Owner'})
          </span>
        </div>
        <Separator />
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={saveDraft} disabled={isPending}>
            {createPO.isPending ? 'Saving…' : 'Save as Draft'}
          </Button>
          <Button onClick={submitApproval} disabled={isPending}>
            {isPending ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </div>
      </section>

      {/* Add Supplier Dialog */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(handleAddSupplier)} className="space-y-4">
              <FormField control={supplierForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={supplierForm.control} name="contact_name" render={({ field }) => (
                <FormItem><FormLabel>Contact Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={supplierForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={supplierForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createSupplier.isPending}>{createSupplier.isPending ? 'Adding…' : 'Add Supplier'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx`**

```typescript
'use client'

import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders'
// Note: In a real implementation this would share the form with create-po.
// For now render a redirect-style placeholder since editing a PO requires
// a shared form component — that refactor is a follow-up task.

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>()
  const { data: po, isLoading } = usePurchaseOrder(id)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!po) return <div className="text-muted-foreground p-8 text-center">PO not found</div>

  // TODO: Render same form as create-po, pre-populated with po data.
  // The Create PO form should be extracted to a shared <POForm> component
  // that accepts an optional `initialPO` prop. This is a planned refactor.
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Edit {po.po_number}</h1>
      <p className="text-muted-foreground">Edit form coming soon — currently only draft POs can be edited.</p>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoLineItemsEditor.tsx src/components/purchase/PoTermsSection.tsx \
  "src/app/(dashboard)/purchase/create-po/page.tsx" \
  "src/app/(dashboard)/purchase/edit-po/[id]/page.tsx"
git commit -m "feat: add Create PO page with line items editor, terms section, and approval level preview"
```

---

## Task 6: Approvals Page

**Files:**
- Create: `src/app/(dashboard)/purchase/approvals/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/approvals/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import { usePendingApprovals, useCompletedApprovals, useApproveStep, useRejectPO } from '@/hooks/usePOApprovals'
import { type PurchaseOrder, type POApprovalStep, formatCurrency as _unused } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface ApprovalDialogState {
  po: PurchaseOrder
  step: POApprovalStep
}

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export default function ApprovalsPage() {
  const [dialogState, setDialogState] = useState<ApprovalDialogState | null>(null)
  const [comment, setComment] = useState('')
  const [rejectMode, setRejectMode] = useState<'full_rejection' | 'send_back_to_rfq'>('full_rejection')
  const [showRejectOptions, setShowRejectOptions] = useState(false)

  const { data: pending, isLoading: pendingLoading } = usePendingApprovals()
  const { data: completed, isLoading: completedLoading } = useCompletedApprovals()
  const approveStep = useApproveStep()
  const rejectPO = useRejectPO()

  function openDialog(po: PurchaseOrder) {
    // Find the first pending step
    const step = (po.po_approvals ?? []).find((s) => s.status === 'pending')
    if (!step) return
    setDialogState({ po, step })
    setComment('')
    setShowRejectOptions(false)
    setRejectMode('full_rejection')
  }

  function handleApprove() {
    if (!dialogState) return
    const { po, step } = dialogState
    const allSteps = po.po_approvals ?? []
    const remainingPending = allSteps.filter((s) => s.status === 'pending' && s.id !== step.id)
    const allStepsWillBeApproved = remainingPending.length === 0

    approveStep.mutate(
      {
        stepId: step.id,
        poId: po.id,
        approvedBy: 'Current User', // TODO: replace with actual user name from auth context
        comment,
        allStepsWillBeApproved,
      },
      {
        onSuccess: () => {
          toast.success(allStepsWillBeApproved ? 'PO approved!' : 'Step approved, next approver notified')
          setDialogState(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReject() {
    if (!dialogState) return
    const { po, step } = dialogState
    rejectPO.mutate(
      {
        poId: po.id,
        stepId: step.id,
        rejectedBy: 'Current User',
        comment,
        mode: rejectMode,
      },
      {
        onSuccess: () => {
          toast.success(rejectMode === 'full_rejection' ? 'PO cancelled' : 'PO sent back to draft')
          setDialogState(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const isMutating = approveStep.isPending || rejectPO.isPending

  return (
    <div className="space-y-8">
      <PageHeader title="PO Approvals" description="Review and action pending purchase order approvals" />

      {/* Pending Approvals */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (pending ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No pending approvals</div>
        ) : (
          <div className="space-y-3">
            {(pending ?? []).map((po) => {
              const pendingStep = (po.po_approvals ?? []).find((s) => s.status === 'pending')
              return (
                <div
                  key={po.id}
                  className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => openDialog(po)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{po.po_number}</span>
                      <PoStatusBadge status={po.status} />
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(po.total_qar, 'QAR')}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{po.supplier_name} · {formatDate(po.created_date)}</span>
                    <PoApprovalChain steps={po.po_approvals ?? []} />
                  </div>
                  {pendingStep && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for: <span className="font-medium text-foreground">{ROLE_LABELS[pendingStep.role] ?? pendingStep.role}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Completed Approvals */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Approvals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground h-16">No completed approvals</TableCell>
                  </TableRow>
                ) : (
                  (completed ?? []).map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                      <TableCell>{po.supplier_name}</TableCell>
                      <TableCell><PoStatusBadge status={po.status} /></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(po.total_qar, 'QAR')}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PoApprovalChain steps={po.po_approvals ?? []} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Approval Dialog */}
      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) setDialogState(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {dialogState && (
            <>
              <DialogHeader>
                <DialogTitle>Approve / Reject — {dialogState.po.po_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* PO Summary */}
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier</span>
                    <span className="font-medium">{dialogState.po.supplier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total (QAR)</span>
                    <span className="font-semibold">{formatCurrency(dialogState.po.total_qar, 'QAR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approval step</span>
                    <Badge variant="outline">{ROLE_LABELS[dialogState.step.role] ?? dialogState.step.role}</Badge>
                  </div>
                </div>

                {/* Line items summary */}
                {(dialogState.po.po_line_items ?? []).length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dialogState.po.po_line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.item_name}</TableCell>
                            <TableCell className="text-right text-sm">{li.qty}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(li.total_price, dialogState.po.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Approval chain */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Chain:</span>
                  <PoApprovalChain steps={dialogState.po.po_approvals ?? []} />
                </div>

                {/* Comment */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Comment</label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional comment…"
                    rows={3}
                  />
                </div>

                {/* Rejection options */}
                {showRejectOptions && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Rejection type:</p>
                    {[
                      { value: 'full_rejection' as const, label: 'Full Rejection', desc: 'Cancel the PO entirely' },
                      { value: 'send_back_to_rfq' as const, label: 'Send Back to Draft', desc: 'Reset to draft for revision' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRejectMode(opt.value)}
                        className={`flex w-full items-start gap-3 rounded-md border p-2 text-left transition-colors ${rejectMode === opt.value ? 'border-destructive bg-destructive/5' : 'hover:bg-muted'}`}
                      >
                        <div className={`mt-0.5 h-3 w-3 rounded-full border-2 shrink-0 ${rejectMode === opt.value ? 'border-destructive bg-destructive' : 'border-muted-foreground'}`} />
                        <div>
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {!showRejectOptions ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/5"
                      onClick={() => setShowRejectOptions(true)}
                      disabled={isMutating}
                    >
                      ✗ Reject
                    </Button>
                    <Button onClick={handleApprove} disabled={isMutating} className="bg-success hover:bg-success/90 text-white">
                      {approveStep.isPending ? 'Approving…' : '✓ Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectOptions(false)} disabled={isMutating}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isMutating}>
                      {rejectPO.isPending ? 'Rejecting…' : `Confirm — ${rejectMode === 'full_rejection' ? 'Cancel PO' : 'Send to Draft'}`}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Fix unused import in approvals page**

Remove the unused `formatCurrency as _unused` import — it was included as a reminder but is unused. Replace the import line:

```typescript
// Remove this line from the import:
import { type PurchaseOrder, type POApprovalStep, formatCurrency as _unused } from '@/hooks/usePurchaseOrders'
// Replace with:
import { type PurchaseOrder, type POApprovalStep } from '@/hooks/usePurchaseOrders'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -v "@tanstack/react-table" | grep -v "sonner" | head -30
```

Fix any new errors (pre-existing errors from stale types are OK to cast with `as any`).

- [ ] **Step 4: Run build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -30
```

Expected: Build succeeds. All purchase routes appear in the route list.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/purchase/approvals/page.tsx"
git commit -m "feat: add PO Approvals page with approve/reject dialog and rejection modes"
```

---

## Task 7: Integration Test + PROGRESS.md

- [ ] **Step 1: Run TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit --pretty 2>&1 | grep -v "node_modules" | head -40
```

Note any new errors introduced by this plan. Fix any that aren't pre-existing patterns.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm run test:run
```

Expected: All 21 tests pass.

- [ ] **Step 3: Run build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -20
```

Expected: Build succeeds with all purchase routes compiled.

- [ ] **Step 4: Update PROGRESS.md**

Open `PROGRESS.md` and:

In `## ✅ Completed`, add:
```markdown
- [2026-04-17] **Purchase Core** — usePurchaseOrders, usePOApprovals hooks; PoStatusBadge, PoApprovalChain, InventoryItemLookup, PoPaymentDialog components; PO Detail Dialog (4 tabs); Purchase Orders list page with status chips + filters; Create PO form with line items editor + terms section + approval preview; Approvals page with approve/reject dialog
```

In `## 🔄 In Progress`, replace with:
```markdown
- Writing Purchase Operations plan (Shipments, Landed Costs, Warehouses hub, Returns, Dead Stock)
```

In `## ⏳ Not Started`, add:
```markdown
- Purchase Operations module (Shipments, Landed Costs, Warehouses hub, Returns, Dead Stock)
```

In the Implementation Plans table, update the purchase row:
```markdown
| `docs/superpowers/plans/2026-04-17-mms-purchase-core.md` | **DONE** | PO list, Create PO, PO detail, Approvals |
```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: mark Purchase Core plan complete"
```
