# Edit PO Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/purchase/edit-po/[id]` from a stub into a full versioned edit experience — identical layout to Create PO, pre-filled with existing values, with a version tab strip showing frozen read-only snapshots of every previous submission.

**Architecture:** One `po_versions` snapshot table stores frozen JSONB copies of every submitted version. The live `purchase_orders` row always holds the current editable state. On "Submit for Approval" the current state is snapshotted, the main record updated, `version_number` incremented, approvals reset. "Save as Draft" is an in-place update with no snapshot. Old version tabs are read-only with a "Restore" button that pre-fills the current form.

**Tech Stack:** Next.js 14 App Router, React, Supabase client, @tanstack/react-query, shadcn/ui, lucide-react, Tailwind CSS, sonner toasts.

---

## File Map

| Action  | Path | Responsibility |
|---------|------|----------------|
| Create  | `supabase/migrations/20260420000001_po_versions.sql` | Add `version_number` to `purchase_orders`; create `po_versions` table with RLS |
| Modify  | `src/hooks/usePurchaseOrders.ts` | Add `PoVersion` type; add `usePoVersions`, `useSubmitPoVersion`, `useSavePoAsDraft` hooks |
| Create  | `src/components/purchase/PoVersionTabs.tsx` | Tab strip: V1 / V2 / … / Vn (current) |
| Create  | `src/components/purchase/PoVersionBanner.tsx` | Orange read-only banner + "Restore to this version" button |
| Rewrite | `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` | Full edit page wiring all components together |

---

## Task 1: DB Migration — `po_versions` table

**Files:**
- Create: `supabase/migrations/20260420000001_po_versions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260420000001_po_versions.sql

-- Track current version number on every PO.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;

-- Frozen snapshot of every submitted PO version.
CREATE TABLE IF NOT EXISTS po_versions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  version_number       INT NOT NULL,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id          TEXT NOT NULL,
  supplier_name        TEXT NOT NULL,
  currency             TEXT NOT NULL,
  exchange_rate        NUMERIC NOT NULL,
  subtotal             NUMERIC NOT NULL,
  discount_amount      NUMERIC NOT NULL DEFAULT 0,
  discount_label       TEXT,
  payment_terms        TEXT,
  payment_terms_notes  TEXT,
  payment_milestones   JSONB,
  delivery_terms       TEXT,
  delivery_terms_notes TEXT,
  expected_delivery    DATE,
  vendor_notes         TEXT,
  line_items           JSONB NOT NULL,
  UNIQUE (po_id, version_number)
);

ALTER TABLE po_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage po_versions"
  ON po_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run in Supabase SQL editor**

Paste the full SQL above into the Supabase dashboard SQL editor and execute. Verify:
- `purchase_orders` now has a `version_number` column (default 1)
- `po_versions` table exists with all columns
- RLS policy created

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260420000001_po_versions.sql
git commit -m "feat(purchase): add po_versions snapshot table + version_number column"
```

---

## Task 2: `PoVersion` type + three new hooks

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts`

Add the `PoVersion` type after the existing `POLineItemDraft` type (around line 117), then add three hooks after `useSubmitPOForApproval` (around line 380).

- [ ] **Step 1: Add `PoVersion` type**

In `src/hooks/usePurchaseOrders.ts`, after the `UpdatePOPayload` type (line 136), insert:

```typescript
export type PoVersion = {
  id: string
  po_id: string
  version_number: number
  submitted_at: string
  submitted_by: string | null
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  subtotal: number
  discount_amount: number
  discount_label: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  payment_milestones: { label: string; percent: number }[] | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  expected_delivery: string | null
  vendor_notes: string | null
  line_items: POLineItemDraft[]
}
```

Also add `version_number?: number` to the `PurchaseOrder` type (after `created_by: string | null`):
```typescript
  version_number: number
```

- [ ] **Step 2: Add `usePoVersions` hook**

After `useSubmitPOForApproval` (after line 380), add:

```typescript
export function usePoVersions(poId: string | null) {
  return useQuery({
    queryKey: ['po-versions', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('po_versions')
        .select('*')
        .eq('po_id', poId!)
        .order('version_number', { ascending: true })
      if (error) throw error
      return data as PoVersion[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 3: Add `useSubmitPoVersion` hook**

This is the combined mutation: snapshot current state → update PO with new values → increment version → reset approvals → set `pending_approval`.

```typescript
export function useSubmitPoVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      currentVersionNumber,
      currentSnapshot,
      payload,
    }: {
      id: string
      currentVersionNumber: number
      currentSnapshot: Omit<PoVersion, 'id' | 'po_id' | 'submitted_at' | 'submitted_by'>
      payload: CreatePOPayload
    }) => {
      const supabase = createClient()

      // 1. Snapshot current state into po_versions
      const { error: snapErr } = await (supabase as any)
        .from('po_versions')
        .insert({
          po_id: id,
          version_number: currentVersionNumber,
          supplier_id: currentSnapshot.supplier_id,
          supplier_name: currentSnapshot.supplier_name,
          currency: currentSnapshot.currency,
          exchange_rate: currentSnapshot.exchange_rate,
          subtotal: currentSnapshot.subtotal,
          discount_amount: currentSnapshot.discount_amount,
          discount_label: currentSnapshot.discount_label,
          payment_terms: currentSnapshot.payment_terms,
          payment_terms_notes: currentSnapshot.payment_terms_notes,
          payment_milestones: currentSnapshot.payment_milestones,
          delivery_terms: currentSnapshot.delivery_terms,
          delivery_terms_notes: currentSnapshot.delivery_terms_notes,
          expected_delivery: currentSnapshot.expected_delivery,
          vendor_notes: currentSnapshot.vendor_notes,
          line_items: currentSnapshot.line_items,
        })
      if (snapErr) throw snapErr

      // 2. Recalculate totals
      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)
      const newVersion = currentVersionNumber + 1

      // 3. Update main PO record + increment version
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          version_number: newVersion,
          status: 'pending_approval',
          expected_delivery: payload.expected_delivery,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .eq('id', id)
      if (poErr) throw poErr

      // 4. Replace line items
      await (supabase as any).from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }

      // 5. Reset approvals — delete old, insert fresh
      await (supabase as any).from('po_approvals').delete().eq('po_id', id)
      const roles = getApprovalRoles(approval_level)
      const { error: approvalErr } = await (supabase as any)
        .from('po_approvals')
        .insert(roles.map((role) => ({ po_id: id, role, status: 'pending' })))
      if (approvalErr) throw approvalErr
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['po-versions', variables.id] })
    },
  })
}
```

- [ ] **Step 4: Add `useSavePoAsDraft` hook**

```typescript
export function useSavePoAsDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CreatePOPayload }) => {
      const supabase = createClient()

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          expected_delivery: payload.expected_delivery,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .eq('id', id)
      if (poErr) throw poErr

      await (supabase as any).from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts
git commit -m "feat(purchase): add PoVersion type + usePoVersions, useSubmitPoVersion, useSavePoAsDraft hooks"
```

---

## Task 3: `PoVersionTabs` component

**Files:**
- Create: `src/components/purchase/PoVersionTabs.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { cn } from '@/lib/utils'
import { PencilLine } from 'lucide-react'
import type { PoVersion } from '@/hooks/usePurchaseOrders'

interface PoVersionTabsProps {
  versions: PoVersion[]
  currentVersionNumber: number
  activeTab: number
  onTabChange: (versionNumber: number) => void
}

export function PoVersionTabs({
  versions,
  currentVersionNumber,
  activeTab,
  onTabChange,
}: PoVersionTabsProps) {
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  // Build tab list: all past versions + current version tab
  const tabs = [
    ...versions.map((v) => ({
      versionNumber: v.version_number,
      label: `V${v.version_number}`,
      sub: formatDate(v.submitted_at),
      isCurrent: false,
    })),
    {
      versionNumber: currentVersionNumber,
      label: `V${currentVersionNumber}`,
      sub: 'Current',
      isCurrent: true,
    },
  ]

  return (
    <div className="shrink-0 flex items-center gap-1 px-4 md:px-6 py-2 border-b bg-background overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.versionNumber}
          type="button"
          onClick={() => onTabChange(tab.versionNumber)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap',
            activeTab === tab.versionNumber
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          )}
        >
          <span>{tab.label}</span>
          <span className="opacity-70">{tab.sub}</span>
          {tab.isCurrent && <PencilLine className="h-3 w-3 opacity-70" />}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/PoVersionTabs.tsx
git commit -m "feat(purchase): PoVersionTabs — version tab strip component"
```

---

## Task 4: `PoVersionBanner` component

**Files:**
- Create: `src/components/purchase/PoVersionBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { RotateCcw, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PoVersion } from '@/hooks/usePurchaseOrders'

interface PoVersionBannerProps {
  version: PoVersion
  onRestore: () => void
}

export function PoVersionBanner({ version, onRestore }: PoVersionBannerProps) {
  const date = new Date(version.submitted_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-amber-800">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Viewing V{version.version_number} — submitted {date}
        </span>
        <span className="text-xs text-amber-600">Read-only</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={onRestore}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore to this version
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/PoVersionBanner.tsx
git commit -m "feat(purchase): PoVersionBanner — read-only version banner with restore button"
```

---

## Task 5: Rewrite `edit-po/[id]/page.tsx`

**Files:**
- Rewrite: `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx`

This is the main assembly. It mirrors the Create PO page structure but:
- Loads existing PO data and hydrates form state
- Fetches `po_versions` history and renders the tab strip
- Shows the edit form on the current version tab
- Shows read-only form + banner on old version tabs
- "Submit for Approval" calls `useSubmitPoVersion` (snapshot + update + reset approvals)
- "Save as Draft" calls `useSavePoAsDraft` (in-place update, no snapshot)

- [ ] **Step 1: Write the full page**

Replace `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` entirely:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, CheckCircle2, Building2,
  Package, StickyNote, Clock, ArrowRight, Plus,
} from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Skeleton } from '@/components/ui/skeleton'
import { PoLineItemsEditor, type LineItemRow } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, DEFAULT_TERMS, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { AddSupplierDialog } from '@/components/purchase/AddSupplierDialog'
import { PoVersionTabs } from '@/components/purchase/PoVersionTabs'
import { PoVersionBanner } from '@/components/purchase/PoVersionBanner'
import {
  usePurchaseOrder,
  usePoVersions,
  useSubmitPoVersion,
  useSavePoAsDraft,
  calcApprovalLevel,
  getApprovalRoles,
  type PoVersion,
  type POLineItemDraft,
} from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import type { LineType } from '@/components/purchase/PoLineItemsEditor'

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const

const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}

const CURRENCY_NAMES: Record<string, string> = {
  QAR: 'Qatari Riyal', USD: 'US Dollar', EUR: 'Euro',
  GBP: 'British Pound', AED: 'UAE Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar',
}

function sym(currency: string) {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

function formatAmt(amount: number, currency: string) {
  return `${sym(currency)}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function draftToLineItemRows(items: POLineItemDraft[]): LineItemRow[] {
  return items.map((li) => ({
    ...li,
    _key: crypto.randomUUID(),
    line_type: (li.tool_asset_item_id ? 'tools' : 'products') as LineType,
  }))
}

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(id)
  const { data: versions = [], isLoading: versionsLoading } = usePoVersions(id)
  const { data: suppliers } = useSuppliers()
  const submitPoVersion = useSubmitPoVersion()
  const savePoAsDraft = useSavePoAsDraft()

  // ── Form state (mirrors create-po page) ──────────────────────────────────
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [currency, setCurrency] = useState<string>('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [terms, setTerms] = useState<PoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')

  // ── Tab state ─────────────────────────────────────────────────────────────
  const currentVersion = po?.version_number ?? 1
  const [activeTab, setActiveTab] = useState<number>(currentVersion)

  // ── Hydrate form from live PO on load ─────────────────────────────────────
  useEffect(() => {
    if (!po) return
    setSupplierId(po.supplier_id)
    setSupplierName(po.supplier_name)
    setCurrency(po.currency)
    setExchangeRate(po.exchange_rate)
    setDiscountAmount(po.discount_amount ?? 0)
    setDiscountLabel(po.discount_label ?? '')
    setTerms({
      payment_terms: po.payment_terms ?? '',
      payment_terms_notes: po.payment_terms_notes ?? '',
      payment_milestones: (po as any).payment_milestones ?? [],
      delivery_terms: po.delivery_terms ?? '',
      delivery_terms_notes: po.delivery_terms_notes ?? '',
      expected_delivery: po.expected_delivery ?? '',
      vendor_notes: po.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(po.po_line_items ?? []))
    setActiveTab(po.version_number ?? 1)
  }, [po?.id])

  // ── Computed ──────────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const grandTotal = subtotal - discountAmount
  const totalQar = grandTotal * exchangeRate
  const approvalLevel = calcApprovalLevel(totalQar)
  const approvalRoles = getApprovalRoles(approvalLevel)
  const validCount = lineItems.filter((li) => li.item_name.trim() !== '').length

  function handleSelectSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierOpen(false)
  }

  function buildPayload() {
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: terms.expected_delivery || null,
      payment_terms: terms.payment_terms || null,
      payment_terms_notes: terms.payment_terms_notes || null,
      payment_milestones: terms.payment_milestones.length > 0
        ? terms.payment_milestones.map(({ label, percent }) => ({ label, percent }))
        : null,
      delivery_terms: terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      vendor_notes: terms.vendor_notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      line_items: lineItems.map(({ _key, line_type, ...li }) => li),
    }
  }

  function validate() {
    if (!supplierId) { toast.error('Please select a supplier'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) { toast.error('All line items need an item name'); return false }
    if (discountAmount > subtotal) { toast.error('Discount cannot exceed subtotal'); return false }
    return true
  }

  function handleSaveDraft() {
    if (!validate()) return
    savePoAsDraft.mutate(
      { id, payload: buildPayload() },
      {
        onSuccess: () => toast.success('Draft saved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSubmit() {
    if (!validate()) return
    if (!po) return
    const currentSnapshot = {
      version_number: currentVersion,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      currency: po.currency,
      exchange_rate: po.exchange_rate,
      subtotal: po.subtotal,
      discount_amount: po.discount_amount ?? 0,
      discount_label: po.discount_label ?? null,
      payment_terms: po.payment_terms ?? null,
      payment_terms_notes: po.payment_terms_notes ?? null,
      payment_milestones: (po as any).payment_milestones ?? null,
      delivery_terms: po.delivery_terms ?? null,
      delivery_terms_notes: po.delivery_terms_notes ?? null,
      expected_delivery: po.expected_delivery ?? null,
      vendor_notes: po.vendor_notes ?? null,
      line_items: (po.po_line_items ?? []).map(({ _key, line_type, ...li }: any) => li),
    }
    submitPoVersion.mutate(
      {
        id,
        currentVersionNumber: currentVersion,
        currentSnapshot,
        payload: buildPayload(),
      },
      {
        onSuccess: () => {
          toast.success('Submitted for approval')
          router.push('/purchase/orders')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRestore(version: PoVersion) {
    setSupplierId(version.supplier_id)
    setSupplierName(version.supplier_name)
    setCurrency(version.currency)
    setExchangeRate(version.exchange_rate)
    setDiscountAmount(version.discount_amount)
    setDiscountLabel(version.discount_label ?? '')
    setTerms({
      payment_terms: version.payment_terms ?? '',
      payment_terms_notes: version.payment_terms_notes ?? '',
      payment_milestones: version.payment_milestones ?? [],
      delivery_terms: version.delivery_terms ?? '',
      delivery_terms_notes: version.delivery_terms_notes ?? '',
      expected_delivery: version.expected_delivery ?? '',
      vendor_notes: version.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(version.line_items))
    setActiveTab(currentVersion)
    toast.success(`Restored V${version.version_number} values — review and submit`)
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (poLoading || versionsLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 md:px-6 py-4 border-b space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!po) {
    return <div className="text-muted-foreground p-8 text-center">PO not found</div>
  }

  if (po.status === 'cancelled') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-6 py-4 border-b bg-background">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{po.po_number}</h1>
            <Badge variant="outline" className="text-xs">Cancelled</Badge>
          </div>
        </div>
        <div className="text-muted-foreground p-8 text-center">Cancelled POs cannot be edited.</div>
      </div>
    )
  }

  const isPending = submitPoVersion.isPending || savePoAsDraft.isPending
  const isViewingOldVersion = activeTab !== currentVersion
  const activeVersion = versions.find((v) => v.version_number === activeTab) ?? null

  // ── Read-only form renderer for old version tabs ───────────────────────────
  function renderReadOnlyForm(version: PoVersion) {
    const vLines = draftToLineItemRows(version.line_items)
    const vSubtotal = vLines.reduce((s, li) => s + li.total_price, 0)
    const vGrandTotal = vSubtotal - version.discount_amount
    const vTerms: PoTermsValues = {
      payment_terms: version.payment_terms ?? '',
      payment_terms_notes: version.payment_terms_notes ?? '',
      payment_milestones: version.payment_milestones ?? [],
      delivery_terms: version.delivery_terms ?? '',
      delivery_terms_notes: version.delivery_terms_notes ?? '',
      expected_delivery: version.expected_delivery ?? '',
      vendor_notes: version.vendor_notes ?? '',
    }

    return (
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6 pointer-events-none opacity-80">
        {/* Supplier & Details */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 pointer-events-none">
            <Building2 className="h-4 w-4 text-primary" />
            Supplier &amp; Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUPPLIER</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.supplier_name}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.currency}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold">
                {formatAmt(vSubtotal, version.currency)}
              </div>
            </div>
            {version.discount_amount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold">
                  {formatAmt(vGrandTotal, version.currency)}
                </div>
              </div>
            )}
          </div>
        </section>
        <Separator />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4 text-primary" />
            Line Items
          </h2>
          <PoLineItemsEditor value={vLines} onChange={() => {}} currency={version.currency} readOnly />
        </section>
        <Separator />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.discount_label || '—'}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{formatAmt(version.discount_amount, version.currency)}</div>
            </div>
          </div>
        </section>
        <Separator />
        <PoTermsSection value={vTerms} onChange={() => {}} readOnly />
        <Separator />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-primary" />
            Vendor Notes
          </h2>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs min-h-[60px]">{version.vendor_notes || '—'}</div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{po.po_number}</h1>
              <Badge variant="outline" className="text-xs font-mono">v{currentVersion}</Badge>
            </div>
            <Badge
              className={`text-[10px] mt-0.5 ${po.status === 'draft' ? 'bg-slate-100 text-slate-700' : po.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : po.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
              variant="outline"
            >
              {po.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>
        {!isViewingOldVersion && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveDraft} disabled={isPending}>
              <Save className="h-3.5 w-3.5" />
              {savePoAsDraft.isPending ? 'Saving…' : 'Save as Draft'}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSubmit} disabled={isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {submitPoVersion.isPending ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Version Tab Strip ── */}
      <PoVersionTabs
        versions={versions}
        currentVersionNumber={currentVersion}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* ── Old Version View ── */}
      {isViewingOldVersion && activeVersion && (
        <>
          <div className="px-4 md:px-6 pt-4">
            <PoVersionBanner
              version={activeVersion}
              onRestore={() => handleRestore(activeVersion)}
            />
          </div>
          {renderReadOnlyForm(activeVersion)}
        </>
      )}

      {/* ── Current Version Edit Form ── */}
      {!isViewingOldVersion && (
        <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

          {/* ① Supplier & Details */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              Supplier &amp; Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUPPLIER *</label>
                <div className="flex gap-2">
                  <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                    <PopoverTrigger
                      className="h-9 flex-1 inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      render={(props) => <button type="button" {...props} />}
                    >
                      <span className={supplierName ? '' : 'text-muted-foreground'}>
                        {supplierName || 'Search suppliers…'}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search suppliers..." />
                        <CommandList>
                          <CommandEmpty>No suppliers found.</CommandEmpty>
                          <CommandGroup>
                            {(suppliers ?? []).map((s) => (
                              <CommandItem key={s.id} value={s.name} onSelect={() => handleSelectSupplier(s)}>
                                <Check className={`mr-2 h-4 w-4 ${supplierId === s.id ? 'opacity-100' : 'opacity-0'}`} />
                                <span>{s.name}</span>
                                {s.category && <span className="ml-2 text-xs text-muted-foreground">({s.category})</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new supplier" onClick={() => setAddSupplierOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{sym(c)}{c} — {CURRENCY_NAMES[c]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                  {formatAmt(subtotal, currency)}
                </div>
              </div>
              {discountAmount > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                  <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                    {formatAmt(grandTotal, currency)}
                  </div>
                </div>
              )}
            </div>
            {currency !== 'QAR' && (
              <div className="flex items-center gap-3">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Exchange Rate (to QAR)</label>
                <Input type="number" min="0.0001" step="0.0001" className="h-8 w-32 text-sm" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} />
              </div>
            )}
          </section>

          <Separator />

          {/* ② Line Items */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" />
                Line Items
              </h2>
              <Badge variant="outline" className="text-[9px]">{validCount} valid</Badge>
            </div>
            <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} />
          </section>

          <Separator />

          {/* ③ Discount */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Discount</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
                <Input className="h-9 text-sm" placeholder="e.g. Volume Discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount ({currency})</label>
                <Input type="number" min="0" max={subtotal} step="0.01" className="h-9 text-sm" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
              </div>
            </div>
          </section>

          <Separator />

          {/* ④⑤ Payment & Delivery Terms */}
          <PoTermsSection value={terms} onChange={setTerms} />

          <Separator />

          {/* ⑥ Vendor Notes */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-primary" />
              Vendor Notes
              <span className="text-xs text-muted-foreground font-normal">(shown on printed PO)</span>
            </h2>
            <Textarea
              className="min-h-[60px] text-xs resize-none"
              placeholder="Notes visible to the vendor…"
              value={terms.vendor_notes}
              onChange={(e) => setTerms({ ...terms, vendor_notes: e.target.value })}
            />
          </section>

          <Separator />

          {/* ⑦ Approval Chain Preview */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Approval Chain Preview{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (Level {approvalLevel} — &lt; QAR 5K / 5K–50K / ≥ 50K)
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {approvalRoles.map((role, idx) => (
                <div key={role} className="flex items-center gap-2">
                  {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <div className="flex items-center gap-1.5 border rounded-md px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">{roleLabel(role)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      <AddSupplierDialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen} onCreated={handleSelectSupplier} />
    </div>
  )
}
```

- [ ] **Step 2: Add `readOnly` prop to `PoLineItemsEditor`**

The read-only form passes `readOnly` to `PoLineItemsEditor`. Add this prop (it just disables interactions):

In `src/components/purchase/PoLineItemsEditor.tsx`, update the props interface and apply:

```typescript
// In PoLineItemsEditorProps interface, add:
readOnly?: boolean

// In the component, pass readOnly to disable the toolbar and row buttons:
// Wrap the toolbar buttons with: {!readOnly && ( ... )}
// Wrap the delete Button with: {!readOnly && ( ... )}
// Pass readOnly to InventoryItemLookup and ToolAssetLookup if they support it
// (or simply don't render the lookup row A when readOnly — just show the item name as text)
```

Full updated props section in `PoLineItemsEditor`:

```typescript
interface PoLineItemsEditorProps {
  value: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  currency: string
  readOnly?: boolean
}

export function PoLineItemsEditor({ value, onChange, currency, readOnly = false }: PoLineItemsEditorProps) {
```

Wrap toolbar with `{!readOnly && (...)}`:
```tsx
{/* Toolbar */}
{!readOnly && (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ADD ITEM:</span>
    {ALL_TYPES.map((t) => {
      const cfg = TYPE_CONFIG[t]
      const Icon = cfg.icon
      return (
        <Button key={t} type="button" variant="outline" size="sm" className={`h-7 text-xs gap-1.5 ${cfg.buttonClass}`} onClick={() => addRow(t)}>
          <Icon className="h-3.5 w-3.5" />{cfg.label}
        </Button>
      )
    })}
  </div>
)}
```

In the rows section, replace Row A lookup+delete with read-only item name display when `readOnly`:
```tsx
{/* Row A: lookup + delete */}
<div className="flex items-center gap-2">
  <div className="flex-1">
    {readOnly ? (
      <div className="h-8 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
        {row.item_name || '—'}
      </div>
    ) : isInventory ? (
      <InventoryItemLookup ... />
    ) : (
      <ToolAssetLookup ... />
    )}
  </div>
  {!readOnly && (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0" onClick={() => removeRow(row._key)}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )}
</div>
```

Also wrap the group header `+` button with `{!readOnly && (...)}`.

- [ ] **Step 3: Add `readOnly` prop to `PoTermsSection`**

In `src/components/purchase/PoTermsSection.tsx`, update the props interface:

```typescript
interface PoTermsSectionProps {
  value: PoTermsValues
  onChange: (values: PoTermsValues) => void
  readOnly?: boolean
}

export function PoTermsSection({ value, onChange, readOnly = false }: PoTermsSectionProps) {
```

When `readOnly`, replace interactive elements with static displays. Wrap preset pills with `{!readOnly && (...)}`. Wrap the "Add milestone" button and remove milestone buttons with `{!readOnly && (...)}`. Make Textarea and Input elements have `readOnly={readOnly}` attribute.

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/purchase/edit-po/[id]/page.tsx \
        src/components/purchase/PoLineItemsEditor.tsx \
        src/components/purchase/PoTermsSection.tsx
git commit -m "feat(purchase): edit-po — full versioned edit page with tab strip, restore, and snapshot submit"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `version_number` column on `purchase_orders` | Task 1 |
| `po_versions` snapshot table + RLS | Task 1 |
| `usePoVersions` hook | Task 2 |
| `useSubmitPoVersion` — snapshot + update + increment + reset approvals | Task 2 |
| `useSavePoAsDraft` — in-place, no snapshot | Task 2 |
| Version tab strip | Task 3 |
| Read-only banner + restore button | Task 4 |
| Edit page pre-filled from live PO | Task 5 |
| Submit creates snapshot then updates PO | Task 5 |
| Save as Draft — in-place, no version increment | Task 5 |
| Restore pre-fills form, switches to current tab | Task 5 |
| Cancelled PO shows read-only, no edit | Task 5 |
| `readOnly` prop on `PoLineItemsEditor` | Task 5 step 2 |
| `readOnly` prop on `PoTermsSection` | Task 5 step 3 |
| Line items in snapshot get fresh `_key` on restore | Task 5 (`draftToLineItemRows`) |
