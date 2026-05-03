'use client'

import { useState, useMemo } from 'react'
import { ChevronRight, Loader2, CheckCircle2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAddBulkServiceInventoryLinks, useAllBrandVariantsGrouped, useAllServiceLinks, type BrandVariantGrouped } from '@/hooks/useInventory'
import type { ServiceNode, ServiceInventoryLinkFull } from './serviceInventoryHelpers'
import { toast } from 'sonner'

// ─── InventoryColumnPicker (local copy — not exported from ServiceLeafPanel) ──
// onSelect receives only variantId — display name is derived from allVariants.

function InventoryColumnPicker({
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

  function handleBrandSelect(variantId: string) {
    onSelect(variantId)
    onOpenChange(false)
    setSelectedCatId(null)
    setSelectedItemId(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelectedCatId(null)
          setSelectedItemId(null)
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="w-full h-full rounded-none p-0 flex flex-col md:h-[460px] md:max-w-[640px] md:rounded-lg">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Column 1: Categories */}
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

          {/* Column 2: Items */}
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
                      <p
                        className={cn(
                          'text-xs truncate',
                          selectedItemId === item.id ? 'font-semibold' : '',
                        )}
                      >
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
      </DialogContent>
    </Dialog>
  )
}

// ─── ServiceLinksBulkPanel ────────────────────────────────────────────────────

interface SelectedItem {
  brandVariantId: string
  displayName: string
}

interface VariantStat {
  displayName: string
  count: number
}

interface Props {
  checkedIds: Set<string>
  services: ServiceNode[]
  allLinks: ServiceInventoryLinkFull[]
  onClearAll: () => void
}

export function ServiceLinksBulkPanel({ checkedIds, services, allLinks, onClearAll }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const bulkLink = useAddBulkServiceInventoryLinks()
  const { data: allVariants = [] } = useAllBrandVariantsGrouped(true)
  const { data: allServiceLinks = [] } = useAllServiceLinks(true)

  const checkedCount = checkedIds.size
  const checkedServices = services.filter((s) => checkedIds.has(s.id))

  // All variant IDs linked to ANY service — used to dim items in the picker
  const linkedVariantIds = useMemo(
    () => new Set(allServiceLinks.map((l) => l.brand_variant_id)),
    [allServiceLinks],
  )

  // onSelect only receives variantId — derive displayName from allVariants
  const handleItemSelect = (variantId: string) => {
    const variant = allVariants.find((v) => v.variantId === variantId)
    const displayName = variant
      ? `${variant.itemName} — ${variant.brand}`
      : variantId
    setSelectedItem({ brandVariantId: variantId, displayName })
    setConfirmedIds(new Set(checkedIds))
    setPickerOpen(false)
  }

  const toggleConfirm = (id: string) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleLink = async () => {
    if (!selectedItem || confirmedIds.size === 0) return
    setStatus('loading')
    try {
      await bulkLink.mutateAsync({
        serviceIds: Array.from(confirmedIds),
        brandVariantId: selectedItem.brandVariantId,
      })
      setStatus('success')
      toast.success(
        `Linked "${selectedItem.displayName}" to ${confirmedIds.size} service${confirmedIds.size !== 1 ? 's' : ''}`,
      )
      setTimeout(() => {
        setStatus('idle')
        setSelectedItem(null)
        setConfirmedIds(new Set())
        onClearAll()
      }, 1500)
    } catch {
      setStatus('idle')
      toast.error('Failed to link items. Please try again.')
    }
  }

  // Intersection summary: count how many checked services each variant is linked to
  const variantStats = new Map<string, VariantStat>()
  for (const link of allLinks) {
    if (!checkedIds.has(link.service_id)) continue
    const key = link.brand_variant_id
    const displayName = link.inventory_brand_variants
      ? `${link.inventory_brand_variants.inventory_items.name_en} — ${link.inventory_brand_variants.brand}`
      : key
    const existing = variantStats.get(key)
    if (existing) {
      existing.count++
    } else {
      variantStats.set(key, { displayName, count: 1 })
    }
  }
  const allLinkedVariants = Array.from(variantStats.values()).filter(
    (v) => v.count === checkedCount,
  )
  const someLinkedVariants = Array.from(variantStats.values()).filter(
    (v) => v.count < checkedCount,
  )

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {checkedCount} service{checkedCount !== 1 ? 's' : ''} selected
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-muted-foreground h-7 px-2"
        >
          Clear selection
        </Button>
      </div>

      {/* Add Inventory Item — always visible */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Add Inventory Item
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-left font-normal"
          onClick={() => setPickerOpen(true)}
        >
          <Package className="mr-2 h-4 w-4 shrink-0" />
          {selectedItem ? selectedItem.displayName : 'Choose an inventory item…'}
        </Button>
        <InventoryColumnPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          allVariants={allVariants}
          onSelect={handleItemSelect}
          title="Select Inventory Item"
          linkedVariantIds={linkedVariantIds}
        />
      </div>

      {/* Confirmation checklist — appears once an item is chosen */}
      {selectedItem && (
        <div className="space-y-2 border rounded-md p-3">
          <p className="text-xs text-muted-foreground">
            Link{' '}
            <span className="font-medium text-foreground">
              &quot;{selectedItem.displayName}&quot;
            </span>{' '}
            to:
          </p>

          {/* Scrollable checklist — height-capped */}
          <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
            {checkedServices.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={confirmedIds.has(s.id)}
                  onCheckedChange={() => toggleConfirm(s.id)}
                />
                <span className="text-sm">{s.name_en}</span>
              </label>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              disabled={
                confirmedIds.size === 0 ||
                status === 'loading' ||
                status === 'success'
              }
              onClick={handleLink}
            >
              {status === 'loading' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {status === 'success' && (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {status === 'idle' &&
                `Link to ${confirmedIds.size} service${confirmedIds.size !== 1 ? 's' : ''}`}
              {status === 'loading' && 'Linking…'}
              {status === 'success' && 'Linked!'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedItem(null)
                setConfirmedIds(new Set())
              }}
              disabled={status !== 'idle'}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Link Intersection Summary */}
      {variantStats.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current Links Across Selection
          </p>

          {allLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Linked to all {checkedCount}
              </p>
              {allLinkedVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  {v.displayName}
                </div>
              ))}
            </div>
          )}

          {someLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked to some</p>
              {someLinkedVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="flex-1">{v.displayName}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {v.count} of {checkedCount}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
