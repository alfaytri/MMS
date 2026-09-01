'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCreateInventoryCategory,
  useCreateInventoryItem,
  useCreateBrandVariant,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
  type BrandVariantWithJoins,
} from '@/hooks/useInventory'
import { BrandCombobox } from '@/components/services/inventory/BrandCombobox'
import { OriginCombobox } from '@/components/services/inventory/OriginCombobox'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import type { LineType } from './PoLineItemsEditor'

// ── CascadeNewCategoryForm ─────────────────────────────────────────────────────

interface NewCategoryFormProps {
  lineType: LineType
  parentId?: string | null
  onCreated: (category: InventoryCategory) => void
  onCancel: () => void
}

export function CascadeNewCategoryForm({ lineType, parentId = null, onCreated, onCancel }: NewCategoryFormProps) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const create = useCreateInventoryCategory()

  function handleSubmit() {
    if (!nameEn.trim()) return
    create.mutate(
      {
        name_en:   nameEn.trim(),
        name_ar:   nameAr.trim() || null,
        type:      lineType,
        parent_id: parentId,
      },
      {
        onSuccess: (cat) => { toast.success('Category created'); onCreated(cat) },
        onError:   (err) => toast.error(humanizeDbError(err)),
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
      },
      {
        onSuccess: (item) => { toast.success('Item created'); onCreated(item as InventoryItem) },
        onError:   (err)  => toast.error(humanizeDbError(err)),
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
  onCreated: (variant: BrandVariantWithJoins) => void
  onCancel: () => void
}

export function CascadeNewVariantForm({ itemId, onCreated, onCancel }: NewVariantFormProps) {
  const [brand,        setBrand]        = useState<{ id: string; name: string } | null>(null)
  const [countryId,    setCountryId]    = useState<number | null>(null)
  const [code,         setCode]         = useState('')
  const [costPrice,    setCostPrice]    = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const create = useCreateBrandVariant()
  const { data: countryCodes = [] } = useCountryCodes()

  // Require at least a brand OR an origin — prevents an accidental empty
  // (generic, no-origin) leaf from being created inline. A truly generic leaf
  // is a rare case and can be added from the catalog.
  const canSave = (brand !== null || countryId !== null) && !create.isPending

  function handleSubmit() {
    if (!canSave) return
    create.mutate(
      {
        item_id:       itemId,
        // brand is NOT NULL; '' satisfies it and the BEFORE-INSERT trigger
        // overwrites it from brands.name once brand_id is set.
        brand:         '',
        brand_id:      brand?.id ?? null,
        country_id:    countryId,
        code:          code.trim() || null,
        cost_price:    Number(costPrice)    || 0,
        selling_price: Number(sellingPrice) || 0,
      },
      {
        onSuccess: (variant) => {
          toast.success('Brand/variant created')
          // The insert's .select() row lacks the joined names — attach the
          // brand/origin labels we already hold so the picker breadcrumb shows
          // origin immediately (before the list refetch lands).
          const country = countryId != null
            ? countryCodes.find((c) => c.id === countryId) ?? null
            : null
          onCreated({
            ...(variant as BrandVariant),
            brands:        brand ? { name: brand.name } : null,
            country_codes: country ? { name: country.name, flag: country.flag, iso: country.iso } : null,
          })
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    // A cmdk/Radix combobox that handled this key (selecting an item on Enter,
    // closing the popover on Escape) already called preventDefault — don't let
    // that bubbled key also submit or cancel the whole form.
    if (e.defaultPrevented) return
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Brand / Variant</p>
      {/* Brand + Origin — parallel side-by-side searchable comboboxes (never
          flyout), matching the catalog BrandVariantEditDialog pattern. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <BrandCombobox value={brand?.id ?? null} onChange={setBrand} />
        <OriginCombobox value={countryId} onChange={setCountryId} />
      </div>
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
          disabled={!canSave}
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
