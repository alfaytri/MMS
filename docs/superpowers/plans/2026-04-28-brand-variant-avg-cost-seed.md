# Brand Variant Initial Average Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable Avg Cost field to the Brand Variant dialog that lets users seed the initial cost when no stock exists, and shows it as read-only once PO receivals have been made.

**Architecture:** Single component change — add `avgCost` state to `BrandVariantEditDialog`, render it as an editable input when `stock_level === 0` (or adding new), and as a read-only display when `stock_level > 0`. Include `average_cost` in the save payload. No DB migration needed — the `average_cost` column already exists on `inventory_brand_variants`.

**Tech Stack:** React, TypeScript, shadcn/ui Input/Label

---

## Files

| File | Change |
|---|---|
| `src/components/services/inventory/BrandVariantEditDialog.tsx` | Add avgCost state, render editable/read-only field, include in save payload |

---

## Task 1: Add Avg Cost field to BrandVariantEditDialog

**Files:**
- Modify: `src/components/services/inventory/BrandVariantEditDialog.tsx`

The lock condition: field is **editable** when creating a new variant (`!isEdit`) OR when editing and `stock_level === 0`. Field is **read-only** when editing and `stock_level > 0` (FIFO layers exist — system owns the value).

- [ ] **Step 1: Replace the entire file content**

Replace `src/components/services/inventory/BrandVariantEditDialog.tsx` with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
}

export function BrandVariantEditDialog({ open, onOpenChange, itemId, variant }: Props) {
  const isEdit = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()

  const [brand, setBrand] = useState('')
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [marginPercent, setMarginPercent] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [stockLevel, setStockLevel] = useState('0')
  const [avgCost, setAvgCost] = useState('')

  // True when the system manages avg cost (stock received via PO)
  const avgCostLocked = isEdit && ((variant as any)?.stock_level ?? 0) > 0

  useEffect(() => {
    if (open) {
      setBrand((variant as any)?.brand ?? '')
      setCode((variant as any)?.code ?? '')
      setSellingPrice((variant as any)?.selling_price != null ? String((variant as any).selling_price) : '')
      setMarginPercent((variant as any)?.margin_percent != null ? String((variant as any).margin_percent) : '0')
      setReorderPoint(variant ? String((variant as any).reorder_point ?? 0) : '0')
      setStockLevel(variant ? String((variant as any).stock_level ?? 0) : '0')
      setAvgCost((variant as any)?.average_cost != null ? String((variant as any).average_cost) : '')
    }
  }, [open, variant])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brand.trim()) {
      toast.error('Brand name is required')
      return
    }

    const payload = {
      brand: brand.trim(),
      code: code.trim() || null,
      selling_price: sellingPrice ? Number(sellingPrice) : 0,
      margin_percent: Number(marginPercent) || 0,
      reorder_point: Number(reorderPoint),
      stock_level: Number(stockLevel) || 0,
      // Only include average_cost when the field is editable (not locked by PO receivals)
      ...(!avgCostLocked && { average_cost: avgCost !== '' ? Number(avgCost) : null }),
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => { toast.success('Variant updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: () => { toast.success('Variant added'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Brand Variant' : 'Add Brand Variant'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. LG, Alfacool"
            />
          </div>
          <div className="space-y-1">
            <Label>SKU Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto-generated if blank"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Selling Price (QAR)</Label>
              <Input
                type="number" min="0" step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Markup %</Label>
              <Input
                type="number" min="0" step="0.01"
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Used by LC price review: price = avg_cost × (1 + markup%)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Avg Cost (QAR)</Label>
              {avgCostLocked ? (
                <div className="space-y-1">
                  <Input
                    value={avgCost}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Auto-calculated from PO receivals</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number" min="0" step="0.01"
                    value={avgCost}
                    onChange={(e) => setAvgCost(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">Set initial cost — overwritten by first PO receival</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Reorder Point</Label>
              <Input
                type="number" min="0" step="1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Stock on Hand</Label>
            <Input
              type="number" min="0" step="1"
              value={stockLevel}
              onChange={(e) => setStockLevel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
git add src/components/services/inventory/BrandVariantEditDialog.tsx
git commit -m "feat(ui): add avg cost seed field to brand variant dialog — editable when no stock, read-only after PO receivals"
```

---

## Task 2: Update PROGRESS.md

- [ ] **Step 1: Add to the top of `## ✅ Completed` in `PROGRESS.md`**

```
- [2026-04-28] **Brand Variant Avg Cost Seed** — `src/components/services/inventory/BrandVariantEditDialog.tsx` — Editable avg cost field on brand variant dialog; read-only once PO receivals exist (stock_level > 0)
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — brand variant avg cost seed complete"
```
