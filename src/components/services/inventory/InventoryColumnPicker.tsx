// src/components/services/inventory/InventoryColumnPicker.tsx
'use client'

import { useState, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAllBrandVariantsGrouped, type BrandVariantGrouped } from '@/hooks/useInventory'

export type { BrandVariantGrouped }

export function InventoryColumnPicker({
  open,
  onOpenChange,
  allVariants,
  onSelect,
  title,
  linkedVariantIds = new Set(),
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allVariants: BrandVariantGrouped[]
  onSelect: (variantId: string) => void
  title: string
  linkedVariantIds?: Set<string>
}) {
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  // Item IDs where EVERY brand variant is already linked somewhere — these get dimmed
  const fullyUsedItemIds = useMemo(() => {
    const variantsByItem = new Map<string, string[]>()
    for (const v of allVariants) {
      const arr = variantsByItem.get(v.itemId) ?? []
      arr.push(v.variantId)
      variantsByItem.set(v.itemId, arr)
    }
    const result = new Set<string>()
    for (const [itemId, variantIds] of variantsByItem) {
      if (variantIds.every((id) => linkedVariantIds.has(id))) result.add(itemId)
    }
    return result
  }, [allVariants, linkedVariantIds])

  // Unique categories sorted A→Z
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const v of allVariants) {
      if (!seen.has(v.catId)) seen.set(v.catId, v.catName)
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allVariants])

  // Items for the selected category, sorted A→Z
  const items = useMemo(() => {
    if (!selectedCatId) return []
    const seen = new Map<string, { id: string; name: string; sku: string }>()
    for (const v of allVariants) {
      if (v.catId === selectedCatId && !seen.has(v.itemId))
        seen.set(v.itemId, { id: v.itemId, name: v.itemName, sku: v.itemSku })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allVariants, selectedCatId])

  // Brands for the selected item, sorted A→Z
  const brands = useMemo(
    () =>
      selectedItemId
        ? allVariants
            .filter((v) => v.itemId === selectedItemId)
            .sort((a, b) => a.brand.localeCompare(b.brand))
        : [],
    [allVariants, selectedItemId],
  )

  function handleCatSelect(catId: string) {
    setSelectedCatId(catId)
    setSelectedItemId(null)
  }

  function handleBrandSelect(variantId: string) {
    onSelect(variantId)
    onOpenChange(false)
    setSelectedCatId(null)
    setSelectedItemId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) { setSelectedCatId(null); setSelectedItemId(null) }
      onOpenChange(v)
    }}>
      <DialogContent className="w-full h-full rounded-none p-0 flex flex-col md:h-[460px] md:max-w-[640px] md:rounded-lg">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Column 1: Categories ── */}
          <div className="w-44 shrink-0 border-r border-border overflow-y-auto flex flex-col">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCatSelect(cat.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-xs border-b border-border/30',
                  'flex items-center justify-between gap-1 hover:bg-muted/30 transition-colors',
                  selectedCatId === cat.id && 'bg-primary/10 text-primary font-semibold',
                )}
              >
                <span className="flex-1 truncate">{cat.name}</span>
                {selectedCatId === cat.id && (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* ── Column 2: Items ── */}
          <div className="w-52 shrink-0 border-r border-border overflow-y-auto flex flex-col">
            {selectedCatId === null ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground select-none">
                ← Select a category
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No items
              </div>
            ) : (
              items.map((item) => {
                const allUsed = fullyUsedItemIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/30',
                      'flex items-center justify-between gap-1 hover:bg-muted/30 transition-colors',
                      selectedItemId === item.id && 'bg-primary/10 text-primary',
                      allUsed && selectedItemId !== item.id && 'opacity-40',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-xs truncate',
                        selectedItemId === item.id ? 'font-semibold' : '',
                      )}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{item.sku}</p>
                    </div>
                    {selectedItemId === item.id && (
                      <ChevronRight className="h-3 w-3 shrink-0 text-primary" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* ── Column 3: Brands ── */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {selectedItemId === null ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground select-none">
                ← Select an item
              </div>
            ) : brands.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No brands
              </div>
            ) : (
              brands.map((v) => {
                const brandUsed = linkedVariantIds.has(v.variantId)
                return (
                  <button
                    key={v.variantId}
                    onClick={() => handleBrandSelect(v.variantId)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/30 flex items-center justify-between gap-2 transition-colors',
                      brandUsed
                        ? 'opacity-40 hover:bg-muted/30'
                        : 'hover:bg-primary/10 hover:text-primary',
                    )}
                  >
                    <span className="text-xs font-medium">{v.brand}</span>
                    {v.costPrice > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {v.costPrice.toLocaleString()} QAR
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
