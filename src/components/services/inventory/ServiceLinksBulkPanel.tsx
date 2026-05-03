'use client'

import { useState, useMemo } from 'react'
import { Loader2, CheckCircle2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAddBulkServiceInventoryLinks, useAllBrandVariantsGrouped } from '@/hooks/useInventory'
import { InventoryColumnPicker } from './ServiceLeafPanel'
import type { ServiceNode, ServiceInventoryLinkFull } from './serviceInventoryHelpers'
import { toast } from 'sonner'

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

  const checkedCount = checkedIds.size
  const checkedServices = services.filter((s) => checkedIds.has(s.id))

  // All variant IDs linked to ANY service — derived from the allLinks prop
  const linkedVariantIds = useMemo(
    () => new Set(allLinks.map((l) => l.brand_variant_id)),
    [allLinks],
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
  const { allLinkedVariants, someLinkedVariants } = useMemo(() => {
    const variantStats = new Map<string, VariantStat>()
    for (const link of allLinks) {
      if (!checkedIds.has(link.service_id)) continue
      const key = link.brand_variant_id
      const displayName = link.inventory_brand_variants
        ? `${link.inventory_brand_variants.inventory_items.name_en} — ${link.inventory_brand_variants.brand}`
        : key
      const existing = variantStats.get(key)
      if (existing) existing.count++
      else variantStats.set(key, { displayName, count: 1 })
    }
    return {
      allLinkedVariants: Array.from(variantStats.values()).filter(
        (v) => v.count === checkedCount,
      ),
      someLinkedVariants: Array.from(variantStats.values()).filter(
        (v) => v.count < checkedCount,
      ),
    }
  }, [allLinks, checkedIds, checkedCount])

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
      {(allLinkedVariants.length > 0 || someLinkedVariants.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current Links Across Selection
          </p>

          {allLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Linked to all {checkedCount}
              </p>
              {allLinkedVariants.map((v) => (
                <div key={v.displayName} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  {v.displayName}
                </div>
              ))}
            </div>
          )}

          {someLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked to some</p>
              {someLinkedVariants.map((v) => (
                <div key={v.displayName} className="flex items-center gap-2 text-sm">
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
