// src/components/services/inventory/ServiceLeafPanel.tsx
'use client'

import { useState, useMemo } from 'react'
import { X, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  useAddServiceInventoryLink,
  useAddServiceInventoryLinksBatch,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useSetServiceNoInventoryNeeded,
  useAllBrandVariantsGrouped,
} from '@/hooks/useInventory'
import type { ServiceInventoryLinkFull } from './serviceInventoryHelpers'
import { InventoryColumnPicker } from './InventoryColumnPicker'
import { InventoryMultiPicker } from './InventoryMultiPicker'

export { InventoryColumnPicker }

// ─── ServiceLeafPanel ─────────────────────────────────────────────────────────

interface LeafPanelProps {
  serviceId: string
  serviceName: string
  breadcrumb: string
  links: ServiceInventoryLinkFull[]
  warranty: number | null
  noInventoryNeeded: boolean
  onClose: () => void
}

export function ServiceLeafPanel({
  serviceId,
  serviceName,
  breadcrumb,
  links,
  warranty,
  noInventoryNeeded,
  onClose,
}: LeafPanelProps) {
  const addLink = useAddServiceInventoryLink()
  const addBatch = useAddServiceInventoryLinksBatch()
  const deleteLink = useDeleteServiceInventoryLink()
  const updateLink = useUpdateServiceInventoryLink()
  const setNoItems = useSetServiceNoInventoryNeeded()

  const hasAnyLink = links.length > 0

  const { data: allVariants = [] } = useAllBrandVariantsGrouped(true)

  // Only dim variants already linked to THIS service in the pickers
  const linkedVariantIds = useMemo(
    () => new Set(links.map((l) => l.brand_variant_id)),
    [links],
  )

  const supplyLinks = links.filter((l) => l.link_type === 'supply')
  const consumableLinks = links.filter((l) => l.link_type === 'consumable')

  // Required = no group, options = group_label set
  const requiredSupplyLinks = supplyLinks.filter((l) => l.group_label === null)
  const optionSupplyLinks = supplyLinks.filter((l) => l.group_label !== null)

  // Multi-select pickers — the primary "add many" flow for supply + consumables
  const [supplyMultiOpen, setSupplyMultiOpen] = useState(false)
  const [consumableMultiOpen, setConsumableMultiOpen] = useState(false)

  // Column picker — kept only for the specialised select-one "option" flow
  const [supplyPickerOpen, setSupplyPickerOpen] = useState(false)
  const [addingSupply, setAddingSupply] = useState(false)
  const [supplyPendingMode, setSupplyPendingMode] = useState<'required' | 'option'>('option')
  const [supplyPendingVariantId, setSupplyPendingVariantId] = useState<string | null>(null)
  const [supplyPendingQty, setSupplyPendingQty] = useState(1)

  function openSupplyPicker(mode: 'required' | 'option') {
    setSupplyPendingMode(mode)
    setSupplyPickerOpen(true)
  }

  function handleSupplyPicked(variantId: string) {
    setSupplyPendingVariantId(variantId)
    setSupplyPendingQty(1)
    setAddingSupply(true)
  }

  function handleConfirmSupply() {
    if (!supplyPendingVariantId) return
    const isOption = supplyPendingMode === 'option'
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: supplyPendingVariantId,
        link_type: 'supply',
        quantity: supplyPendingQty,
        warranty_months: warranty ?? 0,
        group_label: isOption ? 'options' : null,
        // first option in the group becomes default automatically
        is_default: isOption && optionSupplyLinks.length === 0,
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

  // Set one option as default — clears default on all siblings
  function handleSetDefault(id: string) {
    optionSupplyLinks.forEach((link) => {
      updateLink.mutate(
        { id: link.id, is_default: link.id === id },
        { onError: (err) => toast.error(err.message) },
      )
    })
  }

  function handleAddSupplyBatch(rows: { variantId: string; quantity: number }[]) {
    addBatch.mutate(
      rows.map((r) => ({
        service_id: serviceId,
        brand_variant_id: r.variantId,
        link_type: 'supply' as const,
        quantity: r.quantity,
        warranty_months: warranty ?? 0,
        group_label: null,
      })),
      {
        onSuccess: () => setSupplyMultiOpen(false),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleAddConsumableBatch(rows: { variantId: string; quantity: number }[]) {
    addBatch.mutate(
      rows.map((r) => ({
        service_id: serviceId,
        brand_variant_id: r.variantId,
        link_type: 'consumable' as const,
        quantity: r.quantity,
        warranty_months: 0,
      })),
      {
        onSuccess: () => setConsumableMultiOpen(false),
        onError: (err) => toast.error(err.message),
      },
    )
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

  // ── Shared card for a supply link row ────────────────────────────────────────
  function renderSupplyCard(link: ServiceInventoryLinkFull, isOption = false) {
    return (
      <div
        key={link.id}
        className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center gap-2"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight">
            {link.inventory_brand_variants?.brand}
          </p>
          {/* Default badge — only on option group items */}
          {isOption && (
            <button
              onClick={() => handleSetDefault(link.id)}
              title={link.is_default ? 'Default pre-selection' : 'Set as default'}
              aria-label={link.is_default ? 'Default' : 'Set as default'}
              className="mt-0.5"
            >
              {link.is_default ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-semibold px-1.5 py-0.5 border border-amber-200">
                  <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                  default
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[9px] font-medium px-1.5 py-0.5 border border-border hover:border-amber-300 hover:text-amber-600 transition-colors">
                  set default
                </span>
              )}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            {link.inventory_brand_variants?.inventory_items?.name_en}
            {' · '}
            {link.inventory_brand_variants?.inventory_items?.sku}
          </p>
          {(link.inventory_brand_variants?.selling_price ?? 0) > 0 && (
            <p className="text-[10px] text-emerald-700 mt-0.5">
              QAR {link.inventory_brand_variants!.selling_price!.toLocaleString('en-QA')}
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
          title="Remove"
          aria-label="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

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

          {/* No-items-needed toggle */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">No items needed</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {hasAnyLink
                  ? 'Remove linked items to mark this as needing none.'
                  : 'Mark this reviewed service as requiring no inventory.'}
              </p>
            </div>
            <Switch
              checked={noInventoryNeeded}
              disabled={hasAnyLink || setNoItems.isPending}
              onCheckedChange={(v) =>
                setNoItems.mutate(
                  { serviceId, value: v },
                  { onError: (err) => toast.error(err.message) },
                )
              }
            />
          </div>

          {noInventoryNeeded ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center">
              <p className="text-xs text-muted-foreground">
                No inventory items needed for this service.
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Turn off “No items needed” to link items.
              </p>
            </div>
          ) : (
          <>

          {/* Supply item */}
          <section>
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
              Supply Item
            </p>

            <div className="space-y-1.5">
              {/* Required items */}
              {requiredSupplyLinks.map((link) => renderSupplyCard(link, false))}

              {/* Select One group */}
              {optionSupplyLinks.length > 0 && (
                <div className="rounded-md border border-dashed border-border p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Select One
                  </p>
                  {optionSupplyLinks.map((link) => renderSupplyCard(link, true))}
                  {!addingSupply && (
                    <button
                      onClick={() => openSupplyPicker('option')}
                      className={cn(
                        'flex items-center gap-1.5 text-xs text-muted-foreground',
                        'hover:text-foreground transition-colors py-0.5 px-1',
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      Add option
                    </button>
                  )}
                </div>
              )}

              {/* Confirm card after picking */}
              {addingSupply && supplyPendingVariant && (
                <div className="rounded-md border border-border p-2.5 space-y-2">
                  <div>
                    <p className="text-xs font-medium truncate">
                      {supplyPendingVariant.brand} · {supplyPendingVariant.itemName}
                    </p>
                    {supplyPendingMode === 'option' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Adding as select-one option
                      </p>
                    )}
                  </div>
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

              {/* Add buttons */}
              {!addingSupply && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  <button
                    onClick={() => setSupplyMultiOpen(true)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs text-muted-foreground',
                      'hover:text-foreground transition-colors py-1 px-1',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add supply item
                  </button>
                  {optionSupplyLinks.length === 0 && (
                    <button
                      onClick={() => openSupplyPicker('option')}
                      className={cn(
                        'flex items-center gap-1.5 text-xs text-muted-foreground',
                        'hover:text-foreground transition-colors py-1 px-1',
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add option
                    </button>
                  )}
                </div>
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

              <button
                onClick={() => setConsumableMultiOpen(true)}
                className={cn(
                  'flex items-center gap-1.5 text-xs text-muted-foreground',
                  'hover:text-foreground transition-colors py-1 px-1',
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add consumable
              </button>
            </div>
          </section>

          </>
          )}
        </div>
      </div>

      {/* ── Pickers (rendered outside the panel div to avoid clipping) ── */}

      {/* Multi-select — add several supply items at once */}
      <InventoryMultiPicker
        open={supplyMultiOpen}
        onOpenChange={setSupplyMultiOpen}
        allVariants={allVariants}
        onAdd={handleAddSupplyBatch}
        title="Add supply items"
        linkedVariantIds={linkedVariantIds}
        isAdding={addBatch.isPending}
      />

      {/* Multi-select — add several consumables at once */}
      <InventoryMultiPicker
        open={consumableMultiOpen}
        onOpenChange={setConsumableMultiOpen}
        allVariants={allVariants}
        onAdd={handleAddConsumableBatch}
        title="Add consumables"
        linkedVariantIds={linkedVariantIds}
        isAdding={addBatch.isPending}
      />

      {/* Column picker — specialised select-one "option" flow */}
      <InventoryColumnPicker
        open={supplyPickerOpen}
        onOpenChange={setSupplyPickerOpen}
        allVariants={allVariants}
        onSelect={handleSupplyPicked}
        title="Add Option (Select One)"
        linkedVariantIds={linkedVariantIds}
      />
    </>
  )
}
