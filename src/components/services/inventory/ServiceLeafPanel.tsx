// src/components/services/inventory/ServiceLeafPanel.tsx
'use client'

import { useState, useMemo } from 'react'
import { X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useAddServiceInventoryLink,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useAllBrandVariantsGrouped,
} from '@/hooks/useInventory'
import type { ServiceInventoryLinkFull } from './serviceInventoryHelpers'
import { InventoryColumnPicker } from './InventoryColumnPicker'

export { InventoryColumnPicker }

// ─── ServiceLeafPanel ─────────────────────────────────────────────────────────

interface LeafPanelProps {
  serviceId: string
  serviceName: string
  breadcrumb: string
  links: ServiceInventoryLinkFull[]
  warranty: number | null
  onClose: () => void
}

export function ServiceLeafPanel({
  serviceId,
  serviceName,
  breadcrumb,
  links,
  warranty,
  onClose,
}: LeafPanelProps) {
  const addLink = useAddServiceInventoryLink()
  const deleteLink = useDeleteServiceInventoryLink()
  const updateLink = useUpdateServiceInventoryLink()

  const { data: allVariants = [] } = useAllBrandVariantsGrouped(true)

  // Only dim variants already linked to THIS service in the pickers
  const linkedVariantIds = useMemo(
    () => new Set(links.map((l) => l.brand_variant_id)),
    [links],
  )

  const supplyLinks = links.filter((l) => l.link_type === 'supply')
  const consumableLinks = links.filter((l) => l.link_type === 'consumable')

  // Picker open state
  const [supplyPickerOpen, setSupplyPickerOpen] = useState(false)
  const [consumablePickerOpen, setConsumablePickerOpen] = useState(false)

  // Supply add flow
  const [addingSupply, setAddingSupply] = useState(false)
  const [supplyPendingVariantId, setSupplyPendingVariantId] = useState<string | null>(null)
  const [supplyPendingQty, setSupplyPendingQty] = useState(1)

  // Consumable add flow
  const [addingConsumable, setAddingConsumable] = useState(false)
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null)
  const [pendingQty, setPendingQty] = useState(1)

  function handleSupplyPicked(variantId: string) {
    setSupplyPendingVariantId(variantId)
    setSupplyPendingQty(1)
    setAddingSupply(true)
  }

  function handleConfirmSupply() {
    if (!supplyPendingVariantId) return
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: supplyPendingVariantId,
        link_type: 'supply',
        quantity: supplyPendingQty,
        warranty_months: warranty ?? 0,
      },
      {
        onSuccess: () => {
          setAddingSupply(false)
          setSupplyPendingVariantId(null)
          setSupplyPendingQty(1)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleCancelSupply() {
    setAddingSupply(false)
    setSupplyPendingVariantId(null)
    setSupplyPendingQty(1)
  }

  function handleConsumablePicked(variantId: string) {
    setPendingVariantId(variantId)
    setAddingConsumable(true)
  }

  function handleAddConsumable() {
    if (!pendingVariantId) return
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: pendingVariantId,
        link_type: 'consumable',
        quantity: pendingQty,
        warranty_months: 0,
      },
      {
        onSuccess: () => {
          setAddingConsumable(false)
          setPendingVariantId(null)
          setPendingQty(1)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleCancelConsumable() {
    setAddingConsumable(false)
    setPendingVariantId(null)
    setPendingQty(1)
  }

  function handleRemove(id: string) {
    deleteLink.mutate(id, { onError: (err) => toast.error(err.message) })
  }

  function handleQtyBlur(id: string, raw: string) {
    const qty = Number(raw)
    if (qty > 0) {
      updateLink.mutate({ id, quantity: qty }, { onError: (err) => toast.error(err.message) })
    } else {
      toast.error('Quantity must be greater than zero')
    }
  }

  const supplyPendingVariant = supplyPendingVariantId
    ? allVariants.find((v) => v.variantId === supplyPendingVariantId)
    : null

  const pendingVariant = pendingVariantId
    ? allVariants.find((v) => v.variantId === pendingVariantId)
    : null

  return (
    <>
      <div className="w-72 shrink-0 flex flex-col border-l border-border bg-background h-full">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground truncate mb-0.5">{breadcrumb}</p>
            <p className="text-sm font-semibold leading-snug">{serviceName}</p>
            {warranty != null && warranty > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{warranty} mo warranty</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors"
            title="Close"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Supply item */}
          <section>
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
              Supply Item
            </p>

            <div className="space-y-1.5">
              {supplyLinks.map((link) => (
                <div
                  key={link.id}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      {link.inventory_brand_variants?.brand}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {link.inventory_brand_variants?.inventory_items?.name_en}
                      {' · '}
                      {link.inventory_brand_variants?.inventory_items?.sku}
                    </p>
                    {(link.inventory_brand_variants?.selling_price ?? 0) > 0 && (
                      <p className="text-[10px] text-emerald-700 mt-0.5">
                        QAR {link.inventory_brand_variants!.selling_price!.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Input
                    key={link.quantity}
                    type="number"
                    min={0.01}
                    step={0.01}
                    defaultValue={link.quantity}
                    onBlur={(e) => handleQtyBlur(link.id, e.target.value)}
                    className="h-6 w-16 text-[11px] px-2 shrink-0"
                    aria-label="Quantity"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0 w-5 text-right">
                    {link.inventory_brand_variants?.inventory_items?.unit}
                  </span>
                  <button
                    onClick={() => handleRemove(link.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Remove supply item"
                    aria-label="Remove supply item"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Quantity confirm after picking a supply item */}
              {addingSupply && supplyPendingVariant && (
                <div className="rounded-md border border-border p-2.5 space-y-2">
                  <p className="text-xs font-medium truncate">
                    {supplyPendingVariant.brand} · {supplyPendingVariant.itemName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={supplyPendingQty}
                      onChange={(e) => setSupplyPendingQty(Number(e.target.value))}
                      className="h-7 w-20 text-xs"
                      aria-label="Quantity"
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">qty</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={handleConfirmSupply}
                      disabled={addLink.isPending}
                    >
                      {addLink.isPending ? '…' : 'Add'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={handleCancelSupply}
                      aria-label="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {!addingSupply && (
                <button
                  onClick={() => setSupplyPickerOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs text-muted-foreground',
                    'hover:text-foreground transition-colors py-1 px-1',
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add supply item
                </button>
              )}
            </div>
          </section>

          {/* Consumables */}
          <section>
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
              Consumables
            </p>

            <div className="space-y-1.5">
              {consumableLinks.map((link) => (
                <div
                  key={link.id}
                  className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">
                      <span className="font-medium">
                        {link.inventory_brand_variants?.brand}
                      </span>
                      {' · '}
                      <span className="text-muted-foreground">
                        {link.inventory_brand_variants?.inventory_items?.name_en}
                      </span>
                    </p>
                  </div>
                  <Input
                    key={link.quantity}
                    type="number"
                    min={0.01}
                    step={0.01}
                    defaultValue={link.quantity}
                    onBlur={(e) => handleQtyBlur(link.id, e.target.value)}
                    className="h-6 w-16 text-[11px] px-2 shrink-0"
                    aria-label="Quantity"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0 w-5 text-right">
                    {link.inventory_brand_variants?.inventory_items?.unit}
                  </span>
                  <button
                    onClick={() => handleRemove(link.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label={`Remove ${link.inventory_brand_variants?.brand ?? 'consumable'}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Quantity confirm after picking a consumable */}
              {addingConsumable && pendingVariant && (
                <div className="rounded-md border border-border p-2.5 space-y-2">
                  <p className="text-xs font-medium truncate">
                    {pendingVariant.brand} · {pendingVariant.itemName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={pendingQty}
                      onChange={(e) => setPendingQty(Number(e.target.value))}
                      className="h-7 w-20 text-xs"
                      aria-label="Quantity"
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">qty</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={handleAddConsumable}
                      disabled={addLink.isPending}
                    >
                      {addLink.isPending ? '…' : 'Add'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={handleCancelConsumable}
                      aria-label="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {!addingConsumable && (
                <button
                  onClick={() => setConsumablePickerOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs text-muted-foreground',
                    'hover:text-foreground transition-colors py-1 px-1',
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add consumable
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Pickers (rendered outside the panel div to avoid clipping) ── */}
      <InventoryColumnPicker
        open={supplyPickerOpen}
        onOpenChange={(v) => {
          setSupplyPickerOpen(v)
          if (!v) handleCancelSupply()
        }}
        allVariants={allVariants}
        onSelect={handleSupplyPicked}
        title="Set Supply Item"
        linkedVariantIds={linkedVariantIds}
      />
      <InventoryColumnPicker
        open={consumablePickerOpen}
        onOpenChange={(v) => {
          setConsumablePickerOpen(v)
          if (!v) handleCancelConsumable()
        }}
        allVariants={allVariants}
        onSelect={handleConsumablePicked}
        title="Add Consumable"
        linkedVariantIds={linkedVariantIds}
      />
    </>
  )
}
