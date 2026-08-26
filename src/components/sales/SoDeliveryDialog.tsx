'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateDelivery, type SaleOrder, type SOLineItem } from '@/hooks/useSaleOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { brandOriginText } from '@/lib/inventory/variantPickerLabel'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  'products':    { label: 'Product',    className: 'bg-blue-100 text-blue-700' },
  'spare-parts': { label: 'Spare Part', className: 'bg-amber-100 text-amber-700' },
  'consumables': { label: 'Consumable', className: 'bg-green-100 text-green-700' },
  'tools':       { label: 'Tool',       className: 'bg-purple-100 text-purple-700' },
}

interface SoDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoDeliveryDialog({ open, onOpenChange, so }: SoDeliveryDialogProps) {
  const createDelivery = useCreateDelivery()
  const { data: warehouses } = useWarehouses()
  const lines = so.sale_order_lines ?? []
  const bvIds = useMemo(
    () => (so.sale_order_lines ?? []).map((l) => l.brand_variant_id).filter(Boolean) as string[],
    [so.sale_order_lines],
  )

  const [warehouseId, setWarehouseId] = useState('')
  const [subContainerId, setSubContainerId] = useState<string>('')
  const initialDate = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(initialDate)
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: subContainers = [] } = useQuery({
    queryKey: ['sub-containers-by-warehouse', warehouseId || null],
    enabled: !!warehouseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_warehouse_sub_containers', {
        p_warehouse_id: warehouseId,
      })
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        name: string
        division_id: string | null
        division_name: string | null
        is_active: boolean
      }>
    },
  })
  const activeSubContainers = useMemo(
    () => subContainers.filter((sc) => sc.is_active),
    [subContainers],
  )

  const { data: whStockMap } = useWarehouseStockByItems(bvIds, subContainerId || null)

  const warehouseOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>()
    if (Array.isArray(warehouses)) {
      for (const w of warehouses) byId.set(w.id, { id: w.id, name: w.name })
    }
    for (const arr of whStockMap.values()) {
      for (const w of arr) {
        if (byId.has(w.warehouse_id)) continue
        if (!w.warehouse_name) continue
        byId.set(w.warehouse_id, { id: w.warehouse_id, name: w.warehouse_name })
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [warehouses, whStockMap])

  useEffect(() => {
    if (open) {
      setWarehouseId('')
      setSubContainerId('')
      setDate(new Date().toISOString().split('T')[0])
      setQtys({})
    }
  }, [open])

  useEffect(() => {
    setSubContainerId((prev) => {
      if (!warehouseId) return ''
      if (activeSubContainers.length === 1) return activeSubContainers[0].id
      if (prev && activeSubContainers.some((sc) => sc.id === prev)) return prev
      return ''
    })
  }, [warehouseId, activeSubContainers])

  // Dirty when the operator picks a warehouse, edits any qty, or changes the
  // date. Sub-container auto-selects for single-sub warehouses so we treat
  // manual multi-sub picks as dirty via the warehouseId branch.
  const anyQty = Object.values(qtys).some((n) => n > 0)
  const isDirty =
    warehouseId !== '' ||
    date !== initialDate ||
    anyQty

  function maxDeliverable(line: SOLineItem): number {
    return Math.max(0, line.qty - line.delivered_qty)
  }

  function handleSubmit() {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    if (activeSubContainers.length > 1 && !subContainerId) {
      toast.error('Select a sub-container')
      return
    }
    const items = lines
      .map((l) => ({ ...l, deliveryQty: qtys[l.id] ?? 0 }))
      .filter((l) => l.deliveryQty > 0)

    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }

    const warehouse = warehouseOptions.find((w) => w.id === warehouseId)

    createDelivery.mutate(
      {
        so_id: so.id,
        warehouse_id: warehouseId,
        warehouse_name: warehouse?.name ?? '',
        date,
        items: items.map((i) => ({
          item_name: i.item_name,
          sku: i.sku,
          qty_delivered: i.deliveryQty,
          brand_variant_id: i.brand_variant_id,
        })),
        sub_container_id: subContainerId || null,
      },
      {
        onSuccess: () => {
          toast.success('Delivery created')
          guardRef.current?.closeAfterSubmit()
          setQtys({})
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      }
    )
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Delivery — {so.so_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Warehouse + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="delivery-warehouse">Warehouse *</Label>
              <select
                id="delivery-warehouse"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select warehouse…</option>
                {warehouseOptions.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery-date">Date *</Label>
              <Input id="delivery-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {warehouseId && activeSubContainers.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="delivery-sub-container">
                Sub-container {activeSubContainers.length > 1 && <span className="text-destructive">*</span>}
              </Label>
              {activeSubContainers.length === 1 ? (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm min-h-9">
                  <span className="truncate">
                    {activeSubContainers[0].name}
                    {activeSubContainers[0].division_name && (
                      <span className="text-muted-foreground ml-1">— {activeSubContainers[0].division_name}</span>
                    )}
                  </span>
                </div>
              ) : (
                <select
                  id="delivery-sub-container"
                  value={subContainerId}
                  onChange={(e) => setSubContainerId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Select sub-container…</option>
                  {activeSubContainers.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                      {sc.division_name ? ` — ${sc.division_name}` : ''}
                      {so.division_id && sc.division_id !== so.division_id ? ' (shared)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Line items */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Items</Label>
            {lines.map((line) => {
              const max = maxDeliverable(line)
              const bv = line.inventory_item_brand_variants
              const bvLabel = brandOriginText(bv?.brand ?? null, bv?.country_codes?.name ?? null)
              const cat = bv?.inventory_items?.inventory_categories
              const chain = cat?.ancestor_chain ?? []
              const typeBadge = cat?.type ? TYPE_BADGE[cat.type] : null
              return (
                <div key={line.id} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    {chain.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground leading-tight flex-wrap mb-0.5">
                        {chain.map((name, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-muted-foreground/40">›</span>}
                            <span>{name}</span>
                          </span>
                        ))}
                        {typeBadge && (
                          <Badge variant="secondary" className={cn('h-4 text-[9px] px-1 border-0 ml-0.5', typeBadge.className)}>
                            {typeBadge.label}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="text-sm font-medium truncate">
                      {line.item_name}
                      {bvLabel && <span className="text-xs text-muted-foreground font-normal"> — {bvLabel}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ordered: {line.qty} · Delivered: {line.delivered_qty} · Max: {max}
                    </div>
                    {line.brand_variant_id && (() => {
                      const whEntries = whStockMap.get(line.brand_variant_id!) ?? []
                      return whEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {whEntries.map((w) => {
                            const whName =
                              w.warehouse_name ||
                              (warehouses ?? []).find((wh) => wh.id === w.warehouse_id)?.name ||
                              '?'
                            return (
                              <span key={w.warehouse_id} className="text-[10px] text-muted-foreground">
                                {whName}: <span className="font-medium text-foreground">{w.qty}</span>
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-600 mt-0.5">No stock in any warehouse</div>
                      )
                    })()}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={max}
                    value={qtys[line.id] ?? 0}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [line.id]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    className="w-20 text-right"
                    disabled={max === 0}
                  />
                </div>
              )
            })}
            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground">No line items on this order.</p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={createDelivery.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createDelivery.isPending}>
            {createDelivery.isPending ? 'Creating…' : 'Create Delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
