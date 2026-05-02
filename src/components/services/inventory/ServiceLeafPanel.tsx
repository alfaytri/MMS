// src/components/services/inventory/ServiceLeafPanel.tsx
'use client'

import { useState, useMemo } from 'react'
import { X, Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useAddServiceInventoryLink,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useAllBrandVariantsGrouped,
  type BrandVariantGrouped,
} from '@/hooks/useInventory'
import type { ServiceInventoryLinkFull } from './serviceInventoryHelpers'

// ─── InventoryColumnPicker ────────────────────────────────────────────────────
// 3-column browser: Category → Item → Brand
// Opens as a Dialog; calls onSelect(variantId) and closes on brand click.

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

  // Item IDs that already have at least one linked variant for this service
  const linkedItemIds = useMemo(
    () => new Set(allVariants.filter((v) => linkedVariantIds.has(v.variantId)).map((v) => v.itemId)),
    [allVariants, linkedVariantIds],
  )

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
    // Reset for next open
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
                const alreadyLinked = linkedItemIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/30',
                      'flex items-center justify-between gap-1 hover:bg-muted/30 transition-colors',
                      selectedItemId === item.id && 'bg-primary/10 text-primary',
                      alreadyLinked && selectedItemId !== item.id && 'opacity-40',
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
              brands.map((v) => (
                <button
                  key={v.variantId}
                  onClick={() => handleBrandSelect(v.variantId)}
                  className="w-full text-left px-3 py-2.5 border-b border-border/30 flex items-center justify-between gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <span className="text-xs font-medium">{v.brand}</span>
                  {v.costPrice > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {v.costPrice.toLocaleString()} QAR
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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

  const supplyLink = links.find((l) => l.link_type === 'supply') ?? null
  const consumableLinks = links.filter((l) => l.link_type === 'consumable')

  // Set of already-linked brand_variant_ids — passed to pickers to dim used items
  const linkedVariantIds = useMemo(
    () => new Set(links.map((l) => l.brand_variant_id)),
    [links],
  )

  // Picker open state
  const [supplyPickerOpen, setSupplyPickerOpen] = useState(false)
  const [consumablePickerOpen, setConsumablePickerOpen] = useState(false)

  // Consumable add flow
  const [addingConsumable, setAddingConsumable] = useState(false)
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null)
  const [pendingQty, setPendingQty] = useState(1)

  function handleAddSupply(variantId: string) {
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: variantId,
        link_type: 'supply',
        quantity: 1,
        warranty_months: warranty ?? 0,
      },
      { onError: (err) => toast.error(err.message) },
    )
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

  // Resolve the pending variant's display name for the qty confirm step
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

            {supplyLink ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {supplyLink.inventory_brand_variants?.brand}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {supplyLink.inventory_brand_variants?.inventory_items?.name_en}
                    {' · '}
                    {supplyLink.inventory_brand_variants?.inventory_items?.sku}
                  </p>
                  {(supplyLink.inventory_brand_variants?.selling_price ?? 0) > 0 && (
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      QAR {supplyLink.inventory_brand_variants!.selling_price!.toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(supplyLink.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                  title="Remove supply item"
                  aria-label="Remove supply item"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSupplyPickerOpen(true)}
                className="w-full h-8 inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <span>Set supply item…</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
              </button>
            )}
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
        onOpenChange={setSupplyPickerOpen}
        allVariants={allVariants}
        onSelect={handleAddSupply}
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
