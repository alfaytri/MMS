// src/components/purchase/CascadeInventorySelector.tsx
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
  useInventoryCategoriesByType,
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
} from '@/hooks/useInventory'
import { useBrandVariantAncestry } from '@/hooks/useBrandVariantAncestry'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import type { LineType } from './PoLineItemsEditor'

interface CascadeInventorySelectorProps {
  lineType: LineType
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  onPriceLoading?: (loading: boolean) => void
}

// Orders by date DESC, created_at DESC, id DESC to be deterministic when
// multiple FIFO layers share the same date (e.g. two shipments in one day).
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

// Shared className for the combobox trigger button rendered via PopoverTrigger.
// Base UI's PopoverTrigger does not support asChild — styles are applied directly
// and a <button> element is rendered via the render prop.
const triggerCls =
  'h-8 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
  onPriceLoading,
}: CascadeInventorySelectorProps) {
  const [categoryId,    setCategoryId]    = useState<string | null>(null)
  const [itemId,        setItemId]        = useState<string | null>(null)
  const [catOpen,       setCatOpen]       = useState(false)
  const [itemOpen,      setItemOpen]      = useState(false)
  const [varOpen,       setVarOpen]       = useState(false)
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const { data: categories = [], isLoading: catsLoading } =
    useInventoryCategoriesByType(lineType)
  const { data: items = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(categoryId)
  const { data: variants = [], isLoading: varsLoading } =
    useInventoryBrandVariants(itemId)

  // Backward lookup: fires only when value exists but cascade state is absent
  // (i.e. PO loaded from DB rather than freshly selected in this session).
  const { data: ancestry, isLoading: ancestryLoading } = useBrandVariantAncestry(
    value && !categoryId ? value.brand_variant_id : null
  )

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null
  const selectedItem     = items.find((i) => i.id === itemId) ?? null

  async function handleVariantSelect(variant: {
    id: string
    brand: string
    code: string | null
    cost_price: number | null
    selling_price: number | null
  }) {
    if (!selectedItem || !selectedCategory) return
    setVarOpen(false)

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

    // cost_price is 0 or null — fetch last FIFO cost asynchronously.
    // Signal the parent to block submission while the fetch is in flight.
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
    setCategoryId(null)
    setItemId(null)
  }

  // ── PILL ───────────────────────────────────────────────────────────────────
  if (value) {
    const categoryLabel =
      selectedCategory?.name_en ??
      ancestry?.inventory_items?.inventory_categories?.name_en ??
      value.category_name ??
      null
    const categoryLabelAr =
      selectedCategory?.name_ar ??
      ancestry?.inventory_items?.inventory_categories?.name_ar ??
      value.category_name_ar ??
      null
    const brand = value.brand ?? ancestry?.brand ?? null
    const code  = value.sku   ?? ancestry?.code  ?? null

    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm min-h-[32px]">
        {isPriceLoading ? (
          <span className="flex-1 text-xs text-muted-foreground animate-pulse">
            Fetching price…
          </span>
        ) : ancestryLoading && !categoryLabel ? (
          <span className="flex-1 h-4 rounded bg-muted animate-pulse" />
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 truncate">
              {categoryLabel && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {categoryLabel} ›
                </span>
              )}
              <span className="font-medium truncate">{value.item_name}</span>
              {brand && (
                <span className="text-muted-foreground text-xs shrink-0">
                  · {brand}
                </span>
              )}
              {code && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {code}
                </span>
              )}
            </div>
            {(categoryLabelAr || value.item_name_ar) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                {categoryLabelAr && <span>{categoryLabelAr} ›</span>}
                {value.item_name_ar && <span>{value.item_name_ar}</span>}
              </div>
            )}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
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
      <Popover open={catOpen} onOpenChange={setCatOpen}>
        <PopoverTrigger
          className={triggerCls}
          render={(props) => <button type="button" {...props} />}
        >
          <span className="truncate">
            {catsLoading ? 'Loading…' : (selectedCategory?.name_en ?? 'Category…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search category…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No categories found.
            </CommandEmpty>
            <CommandGroup>
              {categories.map((cat) => (
                <CommandItem
                  key={cat.id}
                  value={cat.name_en}
                  onSelect={() => {
                    setCategoryId(cat.id)
                    setItemId(null)
                    onChange(null)
                    setCatOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', categoryId === cat.id ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <div>{cat.name_en}</div>
                    {cat.name_ar && <div className="text-muted-foreground">{cat.name_ar}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Step 2 — Item */}
      <Popover open={itemOpen} onOpenChange={setItemOpen}>
        <PopoverTrigger
          className={cn(triggerCls, !categoryId && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!categoryId} {...props} />}
        >
          <span className="truncate">
            {itemsLoading ? 'Loading…' : (selectedItem?.name_en ?? 'Item…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search item…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No items found.
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name_en}
                  onSelect={() => {
                    setItemId(item.id)
                    onChange(null)
                    setItemOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', itemId === item.id ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <div>{item.name_en}</div>
                    {item.name_ar && <div className="text-muted-foreground">{item.name_ar}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Step 3 — Brand / Variant */}
      <Popover open={varOpen} onOpenChange={setVarOpen}>
        <PopoverTrigger
          className={cn(triggerCls, !itemId && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!itemId} {...props} />}
        >
          <span className="truncate">
            {varsLoading ? 'Loading…' : 'Brand / Variant…'}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search brand…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No variants found.
            </CommandEmpty>
            <CommandGroup>
              {variants.map((v) => (
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
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
