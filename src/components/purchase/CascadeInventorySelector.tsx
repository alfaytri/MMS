'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
} from '@/hooks/useInventory'
import { useInventoryTree } from '@/hooks/useInventoryTree'
import { useBrandVariantAncestry } from '@/hooks/useBrandVariantAncestry'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import type { LineType } from './PoLineItemsEditor'
import {
  CascadeNewCategoryForm,
  CascadeNewItemForm,
  CascadeNewVariantForm,
} from './CascadeInlineForms'
import { CascadeCategoryMenu } from './CascadeCategoryMenu'

interface CascadeInventorySelectorProps {
  lineType: LineType
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  onPriceLoading?: (loading: boolean) => void
}

async function fetchLastFifoCost(variantId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await (supabase as any)
    .from('fifo_cost_layers')
    .select('total_unit_cost')
    .eq('brand_variant_id', variantId)
    .order('date',       { ascending: false })
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as any)?.total_unit_cost ?? 0
}

const triggerCls =
  'h-8 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
  onPriceLoading,
}: CascadeInventorySelectorProps) {
  // Full objects stored directly — avoids .find() race with TanStack Query refetches
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | null>(null)
  const [selectedItem,     setSelectedItem]     = useState<InventoryItem | null>(null)

  const [catOpen,        setCatOpen]        = useState(false)
  const [itemOpen,       setItemOpen]       = useState(false)
  const [varOpen,        setVarOpen]        = useState(false)
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const [selectedVariantCode,  setSelectedVariantCode]  = useState<string | null>(null)
  const [selectedVariantBrand, setSelectedVariantBrand] = useState<string | null>(null)
  const [selectedVariantStock, setSelectedVariantStock] = useState<number | null>(null)

  const [isCatCreating,  setIsCatCreating]  = useState(false)
  const [isItemCreating, setIsItemCreating] = useState(false)
  const [isVarCreating,  setIsVarCreating]  = useState(false)

  const { tree, flat: allCategories, breadcrumb: getBreadcrumb, isLoading: catsLoading } =
    useInventoryTree(lineType)
  const { data: items = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(selectedCategory?.id ?? null)
  const { data: variants = [], isLoading: varsLoading } =
    useInventoryBrandVariants(selectedItem?.id ?? null)

  const { data: ancestry, isLoading: ancestryLoading } = useBrandVariantAncestry(
    value && !selectedCategory ? value.brand_variant_id : null
  )

  async function handleVariantSelect(variant: {
    id: string
    brand: string
    code: string | null
    cost_price: number | null
    selling_price: number | null
    stock_level?: number | null
    reserved_qty?: number | null
  }) {
    if (!selectedItem || !selectedCategory) return
    setVarOpen(false)

    setSelectedVariantCode(variant.code ?? null)
    setSelectedVariantBrand(variant.brand)
    setSelectedVariantStock(
      Math.max(0, (variant.stock_level ?? 0) - (variant.reserved_qty ?? 0))
    )

    const rawCost = variant.cost_price ?? 0
    if (rawCost > 0) {
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       rawCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
      return
    }

    setIsPriceLoading(true)
    onPriceLoading?.(true)
    try {
      const effectiveCost = await fetchLastFifoCost(variant.id)
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       effectiveCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
    } finally {
      setIsPriceLoading(false)
      onPriceLoading?.(false)
    }
  }

  function handleClear() {
    onChange(null)
    setSelectedCategory(null)
    setSelectedItem(null)
    setSelectedVariantCode(null)
    setSelectedVariantBrand(null)
    setSelectedVariantStock(null)
  }

  function handleCategoryCreated(cat: InventoryCategory) {
    setSelectedCategory(cat)
    setSelectedItem(null)
    setIsCatCreating(false)
    setCatOpen(false)
    setItemOpen(true)
  }

  function handleItemCreated(item: InventoryItem) {
    setSelectedItem(item)
    setIsItemCreating(false)
    setItemOpen(false)
    setVarOpen(true)
  }

  function handleVariantCreated(variant: BrandVariant) {
    handleVariantSelect(variant as any)
    setIsVarCreating(false)
  }

  // ── BREADCRUMB (compact, single-line, sits above the vendor name input) ────
  if (value) {
    // For saved rows (no live selection), the ancestry RPC only returns the
    // leaf category. Re-derive the full breadcrumb from the tree by id when
    // possible so the chip shows "AC > Split > Rotary" not just "Rotary".
    const ancestryCatId = ancestry?.inventory_items?.inventory_categories?.id ?? null
    const categoryLabel =
      selectedCategory
        ? getBreadcrumb(selectedCategory.id)
        : ancestryCatId
          ? (getBreadcrumb(ancestryCatId) ||
              ancestry?.inventory_items?.inventory_categories?.name_en ||
              value.category_name ||
              null)
          : value.category_name ?? null
    const inventoryName = selectedItem?.name_en ?? ancestry?.inventory_items?.name_en ?? null
    const brand = selectedVariantBrand ?? ancestry?.brand ?? null
    const code  = selectedVariantCode  ?? ancestry?.code  ?? null
    const ancestryStock =
      ancestry != null
        ? Math.max(0, (ancestry.stock_level ?? 0) - (ancestry.reserved_qty ?? 0))
        : null
    const stockToShow = selectedVariantStock ?? ancestryStock

    // Build a single-line dash-separated breadcrumb, e.g.
    // "AC - Floor Ceiling - Inverter - 3.0 Ton - GREE"
    const breadcrumbParts: string[] = []
    if (categoryLabel) breadcrumbParts.push(categoryLabel.replace(/\s*>\s*/g, ' - '))
    if (inventoryName) breadcrumbParts.push(inventoryName)
    if (code) breadcrumbParts.push(code)
    if (brand) breadcrumbParts.push(brand)
    const breadcrumbText = breadcrumbParts.join(' - ')

    return (
      <div className="flex items-center gap-2 min-h-[20px] px-1 text-xs">
        {isPriceLoading ? (
          <span className="flex-1 text-muted-foreground animate-pulse">Fetching price…</span>
        ) : ancestryLoading && !categoryLabel ? (
          <span className="flex-1 h-3 rounded bg-muted animate-pulse" />
        ) : (
          <span className="flex-1 min-w-0 truncate text-muted-foreground">
            {breadcrumbText || value.item_name}
            {breadcrumbText && value.item_name?.trim() && (
              <span className="text-foreground font-medium">{` (${value.item_name.trim()})`}</span>
            )}
          </span>
        )}
        {stockToShow != null && (
          <span
            className={cn(
              'shrink-0 font-medium',
              stockToShow > 0 ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {stockToShow > 0 ? `${stockToShow} in stock` : 'Out of stock'}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 shrink-0"
          onClick={handleClear}
          disabled={isPriceLoading}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  // ── CASCADE ────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {/* Step 1 — Category */}
      <Popover open={catOpen} onOpenChange={(open) => { setCatOpen(open); if (!open) setIsCatCreating(false) }}>
        <PopoverTrigger
          className={triggerCls}
          render={(props) => <button type="button" {...props} />}
        >
          <span className="truncate">
            {catsLoading ? 'Loading…' : (selectedCategory ? getBreadcrumb(selectedCategory.id) : 'Category…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          {isCatCreating ? (
            <CascadeNewCategoryForm
              lineType={lineType}
              onCreated={handleCategoryCreated}
              onCancel={() => setIsCatCreating(false)}
            />
          ) : (
            <CascadeCategoryMenu
              tree={tree}
              flat={allCategories}
              selectedId={selectedCategory?.id ?? null}
              breadcrumb={getBreadcrumb}
              onSelect={(cat) => {
                setSelectedCategory(cat)
                setSelectedItem(null)
                onChange(null)
                setCatOpen(false)
              }}
              onCreateNew={() => setIsCatCreating(true)}
            />
          )}
        </PopoverContent>
      </Popover>

      {/* Step 2 — Item */}
      <Popover open={itemOpen} onOpenChange={(open) => { setItemOpen(open); if (!open) setIsItemCreating(false) }}>
        <PopoverTrigger
          className={cn(triggerCls, !selectedCategory && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!selectedCategory} {...props} />}
        >
          <span className="truncate">
            {itemsLoading ? 'Loading…' : (selectedItem?.name_en ?? 'Item…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          {isItemCreating ? (
            <CascadeNewItemForm
              categoryId={selectedCategory!.id}
              onCreated={handleItemCreated}
              onCancel={() => setIsItemCreating(false)}
            />
          ) : (
            <>
              <Command>
                <CommandInput placeholder="Search item…" className="h-8 text-xs" />
                <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                  {itemsLoading ? 'Loading…' : 'No items found.'}
                </CommandEmpty>
                <CommandGroup>
                  {itemsLoading ? (
                    <div className="px-2 py-1.5 space-y-1">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="h-6 rounded bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    items.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.name_en}
                        onSelect={() => {
                          setSelectedItem(item)
                          onChange(null)
                          setItemOpen(false)
                        }}
                        className="text-xs"
                      >
                        <Check className={cn('mr-2 h-3 w-3 shrink-0', selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0')} />
                        <div>
                          <div>{item.name_en}</div>
                          {item.name_ar && <div className="text-muted-foreground">{item.name_ar}</div>}
                        </div>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </Command>
              <div className="border-t px-2 py-1.5">
                <button
                  type="button"
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
                  onClick={() => setIsItemCreating(true)}
                >
                  + Add new item
                </button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Step 3 — Brand / Variant */}
      <Popover open={varOpen} onOpenChange={(open) => { setVarOpen(open); if (!open) setIsVarCreating(false) }}>
        <PopoverTrigger
          className={cn(triggerCls, !selectedItem && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!selectedItem} {...props} />}
        >
          <span className="truncate">
            {varsLoading ? 'Loading…' : 'Brand / Variant…'}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          {isVarCreating ? (
            <CascadeNewVariantForm
              itemId={selectedItem!.id}
              onCreated={handleVariantCreated}
              onCancel={() => setIsVarCreating(false)}
            />
          ) : (
            <>
              <Command>
                <CommandInput placeholder="Search brand…" className="h-8 text-xs" />
                <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                  {varsLoading ? 'Loading…' : 'No variants found.'}
                </CommandEmpty>
                <CommandGroup>
                  {varsLoading ? (
                    <div className="px-2 py-1.5 space-y-1">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="h-6 rounded bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    variants.map((v) => (
                      <CommandItem
                        key={v.id}
                        value={`${v.brand} ${v.code ?? ''}`}
                        onSelect={() => handleVariantSelect(v)}
                        className="text-xs"
                      >
                        <div>
                          <div className="font-medium">{v.brand}</div>
                          {v.code && <div className="text-muted-foreground">{v.code}</div>}
                        </div>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </Command>
              <div className="border-t px-2 py-1.5">
                <button
                  type="button"
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
                  onClick={() => setIsVarCreating(true)}
                >
                  + Add new brand / variant
                </button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
