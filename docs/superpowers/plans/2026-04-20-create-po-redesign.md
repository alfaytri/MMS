# Create PO Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/purchase/create-po` to match the full spec: sticky header, supplier combobox, type-grouped line items (4 types), enhanced terms with payment milestones, and live approval chain preview — all using the project's existing CSS variable color scheme (primary = orange `hsl(25 95% 53%)`, secondary = blue).

**Architecture:** Complete rewrite of `create-po/page.tsx` with a `flex flex-col h-full` shell (sticky header + scrollable body). New standalone components — `AddSupplierDialog`, `ToolAssetLookup` — extracted or built fresh. `PoLineItemsEditor` and `PoTermsSection` are fully rewritten in place to match the spec.

**Tech Stack:** Next.js 14 App Router, React, shadcn/ui (Button, Input, Textarea, Select, Badge, Separator, Dialog, Command, Popover), lucide-react, @tanstack/react-query, Supabase client, Tailwind CSS, sonner toasts.

---

## File Map

| Action   | Path                                                                                    | Responsibility                                                           |
|----------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Modify   | `src/hooks/usePurchaseOrders.ts:107-116`                                                | Add `tool_asset_item_id` to `POLineItemDraft`                            |
| Create   | `src/components/purchase/AddSupplierDialog.tsx`                                         | Standalone dialog: Name/Contact/Phone/Email, calls `useCreateSupplier`   |
| Create   | `src/components/purchase/ToolAssetLookup.tsx`                                           | Searchable dropdown querying `tool_asset_items` table                    |
| Rewrite  | `src/components/purchase/PoLineItemsEditor.tsx`                                         | 4 grouped types, colored headers, spec grid layout                       |
| Rewrite  | `src/components/purchase/PoTermsSection.tsx`                                            | Payment milestones + updated presets + expected_delivery in delivery     |
| Rewrite  | `src/app/(dashboard)/purchase/create-po/page.tsx`                                       | Full spec layout: sticky header + scrollable body + all 8 sections       |

---

## Task 1: Add `tool_asset_item_id` to `POLineItemDraft`

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts:107-116`

- [ ] **Step 1: Add the field**

In `src/hooks/usePurchaseOrders.ts`, change `POLineItemDraft`:

```typescript
export type POLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit: string
  unit_price: number
  total_price: number
  brand_variant_id: string | null
  tool_asset_item_id: string | null  // ADD THIS
  free_qty: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts
git commit -m "feat(purchase): add tool_asset_item_id to POLineItemDraft"
```

---

## Task 2: Create `AddSupplierDialog` component

**Files:**
- Create: `src/components/purchase/AddSupplierDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useCreateSupplier } from '@/hooks/useSuppliers'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
})

type FormValues = z.infer<typeof schema>

interface AddSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (supplier: { id: string; name: string }) => void
}

export function AddSupplierDialog({ open, onOpenChange, onCreated }: AddSupplierDialogProps) {
  const createSupplier = useCreateSupplier()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: '', contact_name: '', phone: '', email: '' },
  })

  function handleSubmit(values: FormValues) {
    createSupplier.mutate(
      {
        name: values.name,
        contact_name: values.contact_name || null,
        phone: values.phone || null,
        email: values.email || null,
      },
      {
        onSuccess: (data) => {
          toast.success('Supplier added')
          onCreated({ id: data.id, name: data.name })
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
          <DialogTitle>Add New Supplier</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSupplier.isPending}>
                {createSupplier.isPending ? 'Adding…' : 'Create Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/AddSupplierDialog.tsx
git commit -m "feat(purchase): extract AddSupplierDialog as standalone component"
```

---

## Task 3: Create `ToolAssetLookup` component

**Files:**
- Create: `src/components/purchase/ToolAssetLookup.tsx`

This component queries `tool_asset_items` (columns: `id, name_en, name_ar, category_id`). It mirrors the shape of `InventoryItemLookup` so `PoLineItemsEditor` can handle both with a uniform `onSelect` callback.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ToolAssetLookupResult = {
  tool_asset_item_id: string
  item_name: string
}

interface ToolAssetLookupProps {
  value: ToolAssetLookupResult | null
  onChange: (item: ToolAssetLookupResult | null) => void
  placeholder?: string
  className?: string
}

export function ToolAssetLookup({
  value,
  onChange,
  placeholder = 'Search tools & assets…',
  className,
}: ToolAssetLookupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ToolAssetLookupResult[]>([])
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
        .from('tool_asset_items')
        .select('id, name_en')
        .ilike('name_en', `%${safe}%`)
        .limit(20)
      setResults(
        (data ?? []).map((r: any) => ({
          tool_asset_item_id: r.id,
          item_name: r.name_en,
        }))
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

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
      {open && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {results.map((item) => (
            <button
              key={item.tool_asset_item_id}
              type="button"
              className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(item); setQuery(''); setOpen(false) }}
            >
              <span className="font-medium">{item.item_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/ToolAssetLookup.tsx
git commit -m "feat(purchase): ToolAssetLookup — searchable tool_asset_items dropdown"
```

---

## Task 4: Rewrite `PoLineItemsEditor`

**Files:**
- Rewrite: `src/components/purchase/PoLineItemsEditor.tsx`

Key changes vs. the old component:
- `LineItemRow` gains `line_type: 'products' | 'spare-parts' | 'consumables' | 'tools'` (client-only)
- `tool_asset_item_id: string | null` added (flows from Task 1)
- Items are **grouped by type** into colored cards (4 sections)
- Each group has a colored header band + `+` add-to-group button
- Each row: two-row layout — Row A (lookup + delete) and Row B (editable fields in 6-col grid)
- Toolbar at top: "ADD ITEM:" label + 4 colored type buttons
- Empty state only shown when zero items total

**Color mapping** (uses Tailwind semantic classes matching project palette):

| Type         | Border/bg/text                                          |
|--------------|---------------------------------------------------------|
| products     | `border-blue-300 bg-blue-500/10 text-blue-700`          |
| spare-parts  | `border-amber-300 bg-amber-500/10 text-amber-700`       |
| consumables  | `border-green-300 bg-green-500/10 text-green-700`       |
| tools        | `border-purple-300 bg-purple-500/10 text-purple-700`    |

- [ ] **Step 1: Write the full component**

Replace `src/components/purchase/PoLineItemsEditor.tsx` entirely:

```tsx
'use client'

import { Trash2, Plus, ShoppingBag, Cog, Droplets, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InventoryItemLookup, type InventoryLookupResult } from './InventoryItemLookup'
import { ToolAssetLookup, type ToolAssetLookupResult } from './ToolAssetLookup'
import { formatCurrency } from '@/lib/utils/formatters'
import type { POLineItemDraft } from '@/hooks/usePurchaseOrders'
import type { ElementType } from 'react'

export type LineType = 'products' | 'spare-parts' | 'consumables' | 'tools'

export type LineItemRow = POLineItemDraft & {
  _key: string
  line_type: LineType
}

interface TypeConfig {
  label: string
  icon: ElementType
  headerClass: string
  buttonClass: string
}

const TYPE_CONFIG: Record<LineType, TypeConfig> = {
  products: {
    label: 'Products',
    icon: ShoppingBag,
    headerClass: 'bg-blue-500/10 text-blue-700 border-b border-blue-200',
    buttonClass: 'border-blue-300 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20',
  },
  'spare-parts': {
    label: 'Spare Parts',
    icon: Cog,
    headerClass: 'bg-amber-500/10 text-amber-700 border-b border-amber-200',
    buttonClass: 'border-amber-300 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20',
  },
  consumables: {
    label: 'Consumables',
    icon: Droplets,
    headerClass: 'bg-green-500/10 text-green-700 border-b border-green-200',
    buttonClass: 'border-green-300 bg-green-500/10 text-green-700 hover:bg-green-500/20',
  },
  tools: {
    label: 'Tools & Assets',
    icon: Wrench,
    headerClass: 'bg-purple-500/10 text-purple-700 border-b border-purple-200',
    buttonClass: 'border-purple-300 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20',
  },
}

const ALL_TYPES: LineType[] = ['products', 'spare-parts', 'consumables', 'tools']

function makeRow(line_type: LineType): LineItemRow {
  return {
    _key: crypto.randomUUID(),
    line_type,
    item_name: '',
    sku: '',
    qty: 1,
    unit: 'pcs',
    unit_price: 0,
    total_price: 0,
    brand_variant_id: null,
    tool_asset_item_id: null,
    free_qty: 0,
  }
}

interface PoLineItemsEditorProps {
  value: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  currency: string
}

export function PoLineItemsEditor({ value, onChange, currency }: PoLineItemsEditorProps) {
  function addRow(line_type: LineType) {
    onChange([...value, makeRow(line_type)])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total_price = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, brand_variant_id: null })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      sku: item.sku ?? '',
      unit: item.unit,
      unit_price: item.cost_price,
      total_price: item.cost_price,
      brand_variant_id: item.brand_variant_id,
      tool_asset_item_id: null,
    })
  }

  function handleToolSelect(key: string, item: ToolAssetLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, tool_asset_item_id: null })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      tool_asset_item_id: item.tool_asset_item_id,
      brand_variant_id: null,
    })
  }

  const validCount = value.filter((r) => r.item_name.trim() !== '').length
  const groupedTypes = ALL_TYPES.filter((t) => value.some((r) => r.line_type === t))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          ADD ITEM:
        </span>
        {ALL_TYPES.map((t) => {
          const cfg = TYPE_CONFIG[t]
          const Icon = cfg.icon
          return (
            <Button
              key={t}
              type="button"
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1.5 ${cfg.buttonClass}`}
              onClick={() => addRow(t)}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </Button>
          )
        })}
      </div>

      {/* Empty state */}
      {value.length === 0 && (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Click one of the buttons above to add a line item
        </div>
      )}

      {/* Grouped cards */}
      {groupedTypes.map((lineType) => {
        const cfg = TYPE_CONFIG[lineType]
        const Icon = cfg.icon
        const rows = value.filter((r) => r.line_type === lineType)

        return (
          <div key={lineType} className="border rounded-lg overflow-hidden">
            {/* Group header */}
            <div className={`flex items-center justify-between px-3 py-2 ${cfg.headerClass}`}>
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{cfg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                  {rows.length} item{rows.length !== 1 ? 's' : ''}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => addRow(lineType)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Vendor Item Name</span>
              <span>SKU</span>
              <span>Qty *</span>
              <span>Unit</span>
              <span>Unit Price *</span>
              <span>Total</span>
            </div>

            {/* Rows */}
            <div className="divide-y">
              {rows.map((row) => {
                const isInventory = lineType !== 'tools'
                return (
                  <div key={row._key} className="px-3 py-2 space-y-1.5">
                    {/* Row A: lookup + delete */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        {isInventory ? (
                          <InventoryItemLookup
                            value={
                              row.brand_variant_id
                                ? {
                                    brand_variant_id: row.brand_variant_id,
                                    item_name: row.item_name,
                                    item_name_ar: null,
                                    sku: row.sku,
                                    unit: row.unit,
                                    cost_price: row.unit_price,
                                    selling_price: 0,
                                  }
                                : null
                            }
                            onChange={(item) => handleInventorySelect(row._key, item)}
                            placeholder={`Search ${cfg.label.toLowerCase()}…`}
                          />
                        ) : (
                          <ToolAssetLookup
                            value={
                              row.tool_asset_item_id
                                ? {
                                    tool_asset_item_id: row.tool_asset_item_id,
                                    item_name: row.item_name,
                                  }
                                : null
                            }
                            onChange={(item) => handleToolSelect(row._key, item)}
                          />
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0"
                        disabled={rows.length === 1}
                        onClick={() => removeRow(row._key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Row B: editable fields */}
                    <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 items-center">
                      <Input
                        className="h-7 text-xs"
                        placeholder="Vendor's name for this item"
                        value={row.item_name}
                        onChange={(e) => updateRow(row._key, { item_name: e.target.value })}
                      />
                      <span className="h-7 px-2 flex items-center rounded-md bg-muted/40 border text-xs text-muted-foreground truncate">
                        {row.sku || '—'}
                      </span>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        className="h-7 text-xs"
                        value={row.qty}
                        onChange={(e) => updateRow(row._key, { qty: Math.max(0.001, Number(e.target.value)) })}
                      />
                      <span className="h-7 px-2 flex items-center rounded-md bg-muted/40 border text-xs text-muted-foreground">
                        {row.unit || '—'}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-7 text-xs"
                        value={row.unit_price}
                        onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                      />
                      <span className="text-xs font-medium">
                        {row.qty > 0 && row.unit_price > 0
                          ? formatCurrency(row.total_price, currency)
                          : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Valid count badge */}
      {value.length > 0 && (
        <div className="flex justify-end">
          <Badge variant="outline" className="text-[9px]">
            {validCount} valid
          </Badge>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/PoLineItemsEditor.tsx
git commit -m "feat(purchase): PoLineItemsEditor — 4 grouped types, colored headers, spec layout"
```

---

## Task 5: Rewrite `PoTermsSection`

**Files:**
- Rewrite: `src/components/purchase/PoTermsSection.tsx`

Key changes:
- `PoTermsValues` gains `payment_milestones` (client-only UI state) and `expected_delivery` (moved from page-level state)
- Payment term presets updated to spec labels
- Each preset maps to read-only milestone rows; Custom mode is editable with sum validation
- Delivery section gains `Expected Delivery *` date field
- Vendor notes kept in interface for API compatibility

**Default milestone map** (used when preset changes):

| Preset                               | Milestones                                                          |
|--------------------------------------|---------------------------------------------------------------------|
| 100% Advance                         | `[{ label: "Advance Payment", percent: 100 }]`                     |
| 100% After Delivery                  | `[{ label: "Upon Delivery", percent: 100 }]`                       |
| 50% Advance / 50% After Delivery     | `[{ label: "Advance Payment", percent: 50 }, { label: "Upon Delivery", percent: 50 }]` |
| 30% Advance / 70% After Delivery     | `[{ label: "Advance Payment", percent: 30 }, { label: "Balance on Delivery", percent: 70 }]` |
| Custom                               | `[{ label: "", percent: 100 }]` (editable)                         |

- [ ] **Step 1: Write the full component**

Replace `src/components/purchase/PoTermsSection.tsx` entirely:

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { DollarSign, Truck, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentMilestone = { label: string; percent: number }

export interface PoTermsValues {
  payment_terms: string
  payment_terms_notes: string
  payment_milestones: PaymentMilestone[]
  delivery_terms: string
  delivery_terms_notes: string
  expected_delivery: string
  vendor_notes: string
}

export const DEFAULT_TERMS: PoTermsValues = {
  payment_terms: '',
  payment_terms_notes: '',
  payment_milestones: [],
  delivery_terms: '',
  delivery_terms_notes: '',
  expected_delivery: '',
  vendor_notes: '',
}

const PAYMENT_PRESETS: { label: string; milestones: PaymentMilestone[] }[] = [
  {
    label: '100% Advance',
    milestones: [{ label: 'Advance Payment', percent: 100 }],
  },
  {
    label: '100% After Delivery',
    milestones: [{ label: 'Upon Delivery', percent: 100 }],
  },
  {
    label: '50% Advance / 50% After Delivery',
    milestones: [
      { label: 'Advance Payment', percent: 50 },
      { label: 'Upon Delivery', percent: 50 },
    ],
  },
  {
    label: '30% Advance / 70% After Delivery',
    milestones: [
      { label: 'Advance Payment', percent: 30 },
      { label: 'Balance on Delivery', percent: 70 },
    ],
  },
  {
    label: 'Custom',
    milestones: [{ label: '', percent: 100 }],
  },
]

const DELIVERY_PRESETS = ['EXW', 'FOB', 'CIF', 'DDP', 'DAP', 'Custom']

interface PoTermsSectionProps {
  value: PoTermsValues
  onChange: (values: PoTermsValues) => void
}

export function PoTermsSection({ value, onChange }: PoTermsSectionProps) {
  function set<K extends keyof PoTermsValues>(key: K, val: PoTermsValues[K]) {
    onChange({ ...value, [key]: val })
  }

  function selectPaymentPreset(label: string) {
    const preset = PAYMENT_PRESETS.find((p) => p.label === label)
    onChange({
      ...value,
      payment_terms: label,
      payment_milestones: preset ? [...preset.milestones.map((m) => ({ ...m }))] : [],
    })
  }

  function updateMilestone(idx: number, patch: Partial<PaymentMilestone>) {
    const updated = value.payment_milestones.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    set('payment_milestones', updated)
  }

  function addMilestone() {
    set('payment_milestones', [...value.payment_milestones, { label: '', percent: 0 }])
  }

  function removeMilestone(idx: number) {
    set('payment_milestones', value.payment_milestones.filter((_, i) => i !== idx))
  }

  const isCustomPayment = value.payment_terms === 'Custom'
  const milestoneSum = value.payment_milestones.reduce((s, m) => s + m.percent, 0)
  const milestoneValid = milestoneSum === 100

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Payment Terms ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-primary" />
          Payment Terms
        </h2>

        {/* Preset pills */}
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => selectPaymentPreset(p.label)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                value.payment_terms === p.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 hover:bg-muted border-border'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Milestones */}
        {value.payment_milestones.length > 0 && (
          <div className="space-y-1.5">
            {value.payment_milestones.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1 h-8 text-xs"
                  placeholder="Milestone label"
                  value={m.label}
                  readOnly={!isCustomPayment}
                  onChange={(e) => updateMilestone(idx, { label: e.target.value })}
                />
                <div className="flex items-center gap-0.5">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="w-16 h-8 text-xs text-center"
                    value={m.percent}
                    readOnly={!isCustomPayment}
                    onChange={(e) => updateMilestone(idx, { percent: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {isCustomPayment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeMilestone(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {isCustomPayment && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-primary px-0 h-auto text-xs"
                onClick={addMilestone}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add milestone
              </Button>
            )}

            {isCustomPayment && !milestoneValid && (
              <p className="text-xs text-destructive">
                Total is {milestoneSum}% — must equal 100%
              </p>
            )}
          </div>
        )}

        <Textarea
          className="min-h-[50px] text-xs resize-none"
          placeholder="Additional payment notes…"
          value={value.payment_terms_notes}
          onChange={(e) => set('payment_terms_notes', e.target.value)}
        />
      </div>

      {/* ── Delivery Terms ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-primary" />
          Delivery Terms
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Terms select */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Terms
            </label>
            <select
              value={value.delivery_terms}
              onChange={(e) => set('delivery_terms', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select…</option>
              {DELIVERY_PRESETS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Expected delivery */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Expected Delivery *
            </label>
            <Input
              type="date"
              className="h-9"
              value={value.expected_delivery}
              onChange={(e) => set('expected_delivery', e.target.value)}
            />
          </div>
        </div>

        <Textarea
          className="min-h-[50px] text-xs resize-none"
          placeholder="Additional delivery notes…"
          value={value.delivery_terms_notes}
          onChange={(e) => set('delivery_terms_notes', e.target.value)}
        />
      </div>
    </div>
  )
}
```

**Note:** `Textarea` import needs to be added — it's in `@/components/ui/textarea`.

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/PoTermsSection.tsx
git commit -m "feat(purchase): PoTermsSection — milestone payment terms, delivery date, spec presets"
```

---

## Task 6: Rewrite `create-po/page.tsx`

**Files:**
- Rewrite: `src/app/(dashboard)/purchase/create-po/page.tsx`

This is the main assembly. Key structural decisions:
- Shell: `<div className="flex flex-col h-full">` — header is `shrink-0`, body is `flex-1 overflow-auto`
- Supplier combobox: `Popover` + `Command` + `CommandInput` + `CommandList` from shadcn
- `supplierId` + `supplierName` + `supplierOpen` (popover state) in local state
- `terms` state type is now `PoTermsValues` from the updated PoTermsSection (includes `expected_delivery`)
- `buildPayload()` reads `expected_delivery` from `terms.expected_delivery`
- Approval chain: uses `calcApprovalLevel` + `getApprovalRoles` — renders role pills with `ArrowRight` separators
- Subtotal = sum of line items; grandTotal = subtotal - discount
- Grand total display only shown when `discountAmount > 0`
- Currency symbol helper: a simple map for display purposes

**Currency symbol map** (add near top of file):
```typescript
const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
```

**Approval level thresholds** (matching existing `calcApprovalLevel` in the hook — L1 < 5K, L2 < 50K, L3 ≥ 50K):
```typescript
const LEVEL_LABEL = '< QAR 5K / 5K–50K / ≥ 50K'
```

- [ ] **Step 1: Write the full page**

Replace `src/app/(dashboard)/purchase/create-po/page.tsx` entirely:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Save, CheckCircle2, Building2,
  Package, StickyNote, Clock, ArrowRight,
} from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { PoLineItemsEditor, type LineItemRow } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, DEFAULT_TERMS, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { AddSupplierDialog } from '@/components/purchase/AddSupplierDialog'
import { useCreatePO, useSubmitPOForApproval, calcApprovalLevel, getApprovalRoles } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'

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

export default function CreatePOPage() {
  const router = useRouter()
  const createPO = useCreatePO()
  const submitForApproval = useSubmitPOForApproval()
  const { data: suppliers } = useSuppliers()

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

  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const grandTotal = subtotal - discountAmount
  const totalQar = grandTotal * exchangeRate
  const approvalLevel = calcApprovalLevel(totalQar)
  const approvalRoles = getApprovalRoles(approvalLevel)

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
      onSuccess: (po) => {
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
  const validCount = lineItems.filter((li) => li.item_name.trim() !== '').length

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Create Purchase Order</h1>
            <p className="text-xs text-muted-foreground">Direct PO to supplier with multi-currency support</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveDraft} disabled={isPending}>
            <Save className="h-3.5 w-3.5" />
            {createPO.isPending ? 'Saving…' : 'Save as RFQ / Draft'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={submitApproval} disabled={isPending}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isPending ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Supplier & Details */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-primary" />
            Supplier &amp; Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            {/* Supplier combobox */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                SUPPLIER *
              </label>
              <div className="flex gap-2">
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="h-9 flex-1 justify-between font-normal"
                    >
                      <span className={supplierName ? '' : 'text-muted-foreground'}>
                        {supplierName || 'Search suppliers…'}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search suppliers..." />
                      <CommandList>
                        <CommandEmpty>No suppliers found.</CommandEmpty>
                        <CommandGroup>
                          {(suppliers ?? []).map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => handleSelectSupplier(s)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${supplierId === s.id ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span>{s.name}</span>
                              {s.category && (
                                <span className="ml-2 text-xs text-muted-foreground">({s.category})</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Add new supplier"
                  onClick={() => setAddSupplierOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                CURRENCY
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {sym(c)}{c} — {CURRENCY_NAMES[c]}
                  </option>
                ))}
              </select>
            </div>

            {/* Subtotal display */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                SUBTOTAL ({currency})
              </label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                {formatAmt(subtotal, currency)}
              </div>
            </div>

            {/* Grand total (only when discount > 0) */}
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  GRAND TOTAL ({currency})
                </label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                  {formatAmt(grandTotal, currency)}
                </div>
              </div>
            )}
          </div>

          {/* Exchange rate (non-QAR) */}
          {currency !== 'QAR' && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Exchange Rate (to QAR)
              </label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                className="h-8 w-32 text-sm"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
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
            <Badge variant="outline" className="text-[9px]">
              {validCount} valid
            </Badge>
          </div>
          <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} />
        </section>

        {/* ③ Discount */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Label
              </label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g. Volume Discount"
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Amount ({currency})
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-9 text-sm"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
              />
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
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none min-h-[60px]"
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

      {/* Add Supplier Dialog */}
      <AddSupplierDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        onCreated={handleSelectSupplier}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (or only pre-existing errors unrelated to these files).

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/purchase/create-po/page.tsx
git commit -m "feat(purchase): create-po — full spec redesign (sticky header, grouped items, approval chain)"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Covered? | Task |
|---|---|---|
| Sticky header with back / Save as RFQ / Submit | ✅ | Task 6 |
| Supplier combobox (Popover + Command) | ✅ | Task 6 |
| Add Supplier button → dialog | ✅ | Task 2, 6 |
| Currency select with symbol+name | ✅ | Task 6 |
| Subtotal display (read-only) | ✅ | Task 6 |
| Grand Total display (conditional on discount) | ✅ | Task 6 |
| Exchange rate field for non-QAR | ✅ | Task 6 |
| Line items grouped by 4 types | ✅ | Task 4 |
| Per-group colored headers + add row button | ✅ | Task 4 |
| Column headers grid | ✅ | Task 4 |
| Row A: lookup (inventory or tool) + delete | ✅ | Task 4 |
| Row B: vendor name, SKU (read-only), qty, unit (read-only), price, total | ✅ | Task 4 |
| Empty state when zero items | ✅ | Task 4 |
| Discount section (label + amount) | ✅ | Task 6 |
| Payment Terms: preset pills | ✅ | Task 5 |
| Payment Terms: milestone rows (read-only + Custom editable) | ✅ | Task 5 |
| Payment Terms: sum validation hint | ✅ | Task 5 |
| Payment Terms: notes textarea | ✅ | Task 5 |
| Delivery Terms: terms select | ✅ | Task 5 |
| Delivery Terms: expected delivery date | ✅ | Task 5 |
| Delivery Terms: notes textarea | ✅ | Task 5 |
| Vendor Notes section (own heading) | ✅ | Task 6 |
| Approval Chain Preview with pills + arrows | ✅ | Task 6 |
| ToolAssetLookup component | ✅ | Task 3 |
| AddSupplierDialog standalone | ✅ | Task 2 |
| tool_asset_item_id in POLineItemDraft | ✅ | Task 1 |

### No Placeholder Violations

All code blocks contain full implementations. No "TBD", no "TODO", no references to undefined types.

### Type Consistency

- `LineItemRow` (Task 4) = `POLineItemDraft` (Task 1 updated) + `{ _key, line_type }`
- `PoTermsValues` (Task 5) exported as `DEFAULT_TERMS` + `PoTermsValues` → imported by Task 6
- `AddSupplierDialog` props: `open, onOpenChange, onCreated` → called correctly in Task 6
- `ToolAssetLookupResult`: `{ tool_asset_item_id, item_name }` → used in Task 4
- `buildPayload()` strips `_key` and `line_type` via destructuring: `({ _key, line_type, ...li }) => li`
- `getApprovalRoles` imported from `usePurchaseOrders` (already exported in hook)
