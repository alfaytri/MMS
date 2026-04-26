'use client'

import { useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCreateInventoryCategory,
  useCreateInventoryItem,
  useCreateBrandVariant,
  useAllBrandNames,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
} from '@/hooks/useInventory'
import type { LineType } from './PoLineItemsEditor'

// ── CascadeNewCategoryForm ─────────────────────────────────────────────────────

interface NewCategoryFormProps {
  lineType: LineType
  onCreated: (category: InventoryCategory) => void
  onCancel: () => void
}

export function CascadeNewCategoryForm({ lineType, onCreated, onCancel }: NewCategoryFormProps) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const create = useCreateInventoryCategory()

  function handleSubmit() {
    if (!nameEn.trim()) return
    create.mutate(
      { name_en: nameEn.trim(), name_ar: nameAr.trim() || null, type: lineType },
      {
        onSuccess: (cat) => { toast.success('Category created'); onCreated(cat) },
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Category</p>
      <Input
        autoFocus
        className="h-7 text-xs w-full"
        placeholder="English name *"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Arabic name (optional)"
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
      />
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!nameEn.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CascadeNewItemForm ─────────────────────────────────────────────────────────

interface NewItemFormProps {
  categoryId: string
  onCreated: (item: InventoryItem) => void
  onCancel: () => void
}

export function CascadeNewItemForm({ categoryId, onCreated, onCancel }: NewItemFormProps) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [unit,   setUnit]   = useState('pcs')
  const [sku,    setSku]    = useState('')
  const create = useCreateInventoryItem()

  function handleSubmit() {
    if (!nameEn.trim() || !unit.trim()) return
    create.mutate(
      {
        name_en:     nameEn.trim(),
        name_ar:     nameAr.trim() || null,
        unit:        unit.trim(),
        sku:         sku.trim() || '',
        category_id: categoryId,
      } as any,
      {
        onSuccess: (item) => { toast.success('Item created'); onCreated(item as InventoryItem) },
        onError:   (err)  => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Item</p>
      <Input
        autoFocus
        className="h-7 text-xs w-full"
        placeholder="English name *"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Arabic name (optional)"
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="h-7 text-xs"
          placeholder="Unit *"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <Input
          className="h-7 text-xs"
          placeholder="SKU (optional)"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!nameEn.trim() || !unit.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CascadeNewVariantForm ──────────────────────────────────────────────────────

interface NewVariantFormProps {
  itemId: string
  onCreated: (variant: BrandVariant) => void
  onCancel: () => void
}

export function CascadeNewVariantForm({ itemId, onCreated, onCancel }: NewVariantFormProps) {
  const [brand,        setBrand]        = useState('')
  const [code,         setCode]         = useState('')
  const [costPrice,    setCostPrice]    = useState('0')
  const [sellingPrice, setSellingPrice] = useState('0')
  const create = useCreateBrandVariant()
  const { data: allBrands = [] } = useAllBrandNames()

  const datalistId = `brands-${itemId}`

  function handleSubmit() {
    if (!brand.trim()) return
    create.mutate(
      {
        item_id:       itemId,
        brand:         brand.trim(),
        code:          code.trim() || null,
        cost_price:    Number(costPrice)    || 0,
        selling_price: Number(sellingPrice) || 0,
      },
      {
        onSuccess: (variant) => { toast.success('Brand/variant created'); onCreated(variant as BrandVariant) },
        onError:   (err)     => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Brand / Variant</p>
      <datalist id={datalistId}>
        {allBrands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <Input
        autoFocus
        list={datalistId}
        className="h-7 text-xs w-full"
        placeholder="Brand name *"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Variant code / SKU (optional)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Cost price"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Selling price"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!brand.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
