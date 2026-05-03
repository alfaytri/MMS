// src/components/services/inventory/InventoryColumnPicker.tsx
'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus search on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleClose(v: boolean) {
    if (!v) {
      setSelectedCatId(null)
      setSelectedItemId(null)
      setSearchQuery('')
    }
    onOpenChange(v)
  }

  function handleBrandSelect(variantId: string) {
    onSelect(variantId)
    onOpenChange(false)
    setSelectedCatId(null)
    setSelectedItemId(null)
    setSearchQuery('')
  }

  // ── Search results ─────────────────────────────────────────────────────────

  const trimmed = searchQuery.trim().toLowerCase()

  const searchResults = useMemo(() => {
    if (!trimmed) return []
    return allVariants.filter(
      (v) =>
        v.itemName.toLowerCase().includes(trimmed) ||
        v.itemSku.toLowerCase().includes(trimmed) ||
        v.catName.toLowerCase().includes(trimmed) ||
        v.brand.toLowerCase().includes(trimmed),
    )
  }, [allVariants, trimmed])

  // ── Column browser data ────────────────────────────────────────────────────

  // Item IDs where EVERY brand variant is already linked — these get dimmed
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

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const v of allVariants) {
      if (!seen.has(v.catId)) seen.set(v.catId, v.catName)
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allVariants])

  const items = useMemo(() => {
    if (!selectedCatId) return []
    const seen = new Map<string, { id: string; name: string; sku: string }>()
    for (const v of allVariants) {
      if (v.catId === selectedCatId && !seen.has(v.itemId))
        seen.set(v.itemId, { id: v.itemId, name: v.itemName, sku: v.itemSku })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allVariants, selectedCatId])

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-full rounded-none p-0 flex flex-col md:h-[520px] md:max-w-[780px] md:rounded-lg">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-border shrink-0 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Search by name, SKU, category or brand…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {trimmed ? (
          /* ── Search results (flat list) ── */
          <div className="flex-1 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No items match &quot;{searchQuery}&quot;
              </p>
            ) : (
              searchResults.map((v) => {
                const used = linkedVariantIds.has(v.variantId)
                return (
                  <button
                    key={v.variantId}
                    onClick={() => handleBrandSelect(v.variantId)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 border-b border-border/30 transition-colors',
                      'flex items-start justify-between gap-3',
                      used
                        ? 'opacity-40 hover:bg-muted/30'
                        : 'hover:bg-primary/10 hover:text-primary',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{v.catName}</p>
                      <p className="text-xs font-medium break-words">{v.itemName}</p>
                      <p className="text-[10px] text-muted-foreground">{v.itemSku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold">{v.brand}</p>
                      {v.costPrice > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {v.costPrice.toLocaleString()} QAR
                        </p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          /* ── Column browser ── */
          <div className="flex flex-1 overflow-hidden">
            {/* Column 1: Categories */}
            <div className="w-48 shrink-0 border-r border-border overflow-y-auto flex flex-col">
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
                  <span className="flex-1 break-words">{cat.name}</span>
                  {selectedCatId === cat.id && (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Column 2: Items */}
            <div className="w-64 shrink-0 border-r border-border overflow-y-auto flex flex-col">
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
                          'text-xs break-words',
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

            {/* Column 3: Brands */}
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
        )}
      </DialogContent>
    </Dialog>
  )
}
