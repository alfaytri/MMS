'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Warehouse as WarehouseIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'
import { useWarehouses } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
}

/** Per-warehouse qty from warehouse_stock_view */
function useVariantWarehouseStock(variantId: string | undefined) {
  return useQuery({
    queryKey: ['variant_warehouse_stock', variantId],
    queryFn: async () => {
      if (!variantId) return []
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('warehouse_stock_view')
        .select('warehouse_id, qty')
        .eq('brand_variant_id', variantId)
      if (error) throw error
      return (data ?? []) as { warehouse_id: string; qty: number }[]
    },
    enabled: !!variantId,
    staleTime: 30_000,
  })
}

export function BrandVariantEditDialog({ open, onOpenChange, itemId, variant }: Props) {
  const isEdit = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()
  const qc = useQueryClient()

  const [brand, setBrand] = useState('')
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [marginPercent, setMarginPercent] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [avgCost, setAvgCost] = useState('')

  // Warehouse stock allocation: { warehouseId → target qty string }
  const [whAlloc, setWhAlloc] = useState<Record<string, string>>({})
  const [allocating, setAllocating] = useState(false)

  const { data: warehouses = [] } = useWarehouses()
  const { data: currentWhStock = [] } = useVariantWarehouseStock(isEdit ? variant?.id : undefined)

  // True when the system manages avg cost (stock received via PO)
  const avgCostLocked = isEdit && (variant?.stock_level ?? 0) > 0

  // Build initial warehouse allocation map from current DB data
  useEffect(() => {
    if (open && isEdit && currentWhStock.length > 0) {
      const map: Record<string, string> = {}
      currentWhStock.forEach((ws) => {
        map[ws.warehouse_id] = String(ws.qty)
      })
      setWhAlloc(map)
    } else if (open && !isEdit) {
      setWhAlloc({})
    }
  }, [open, isEdit, currentWhStock])

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = variant as any
      setBrand(v?.brand ?? '')
      setCode(v?.code ?? '')
      setSellingPrice(v?.selling_price != null ? String(v.selling_price) : '')
      setMarginPercent(v?.margin_percent != null ? String(v.margin_percent) : '0')
      setReorderPoint(v ? String(v.reorder_point ?? 0) : '0')
      setAvgCost(variant?.average_cost != null ? String(variant.average_cost) : '')
    }
  }, [open, variant])

  // Computed total from warehouse allocations
  const computedStockLevel = useMemo(() => {
    return Object.values(whAlloc).reduce((sum, v) => sum + (parseInt(v) || 0), 0)
  }, [whAlloc])

  // Build a map of current DB qty per warehouse for delta detection
  const currentQtyMap = useMemo(() => {
    const m = new Map<string, number>()
    currentWhStock.forEach((ws) => m.set(ws.warehouse_id, ws.qty))
    return m
  }, [currentWhStock])

  function updateWhAlloc(whId: string, qty: string) {
    setWhAlloc((prev) => ({ ...prev, [whId]: qty }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brand.trim()) {
      toast.error('Brand name is required')
      return
    }

    const payload = {
      brand: brand.trim(),
      code: code.trim() || null,
      selling_price: sellingPrice ? Number(sellingPrice) : 0,
      margin_percent: Number(marginPercent) || 0,
      reorder_point: Number(reorderPoint),
      stock_level: computedStockLevel,
      ...(!avgCostLocked && { average_cost: avgCost !== '' ? Number(avgCost) : null }),
    }

    const unitCost = avgCost !== '' ? Number(avgCost) : 0

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: async () => {
            // Apply warehouse stock allocations
            await applyAllocations(variant.id, unitCost)
            toast.success('Variant updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: async (data) => {
            // Apply warehouse allocations to the newly created variant
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newId = (data as any)?.id
            if (newId) {
              await applyAllocations(newId, unitCost)
            }
            toast.success('Variant added')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  async function applyAllocations(variantId: string, unitCost: number) {
    const supabase = createClient()
    const changed: { warehouseId: string; targetQty: number }[] = []

    for (const wh of warehouses) {
      const target = parseInt(whAlloc[wh.id] ?? '0') || 0
      const current = currentQtyMap.get(wh.id) ?? 0
      if (target !== current) {
        changed.push({ warehouseId: wh.id, targetQty: target })
      }
    }

    if (changed.length === 0) return

    setAllocating(true)
    try {
      for (const { warehouseId, targetQty } of changed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc('allocate_warehouse_stock', {
          p_brand_variant_id: variantId,
          p_warehouse_id: warehouseId,
          p_target_qty: targetQty,
          p_unit_cost: unitCost,
        })
        if (error) throw error
      }
      // Invalidate related caches
      qc.invalidateQueries({ queryKey: ['variant_warehouse_stock'] })
      qc.invalidateQueries({ queryKey: ['warehouse_stock'] })
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      qc.invalidateQueries({ queryKey: ['brand_variants'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to allocate warehouse stock')
    } finally {
      setAllocating(false)
    }
  }

  const isPending = create.isPending || update.isPending || allocating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Brand Variant' : 'Add Brand Variant'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. LG, Alfacool"
            />
          </div>
          <div className="space-y-1">
            <Label>SKU Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto-generated if blank"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Selling Price (QAR)</Label>
              <Input
                type="number" min="0" step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Markup %</Label>
              <Input
                type="number" min="0" step="0.01"
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Used by LC price review: price = avg_cost × (1 + markup%)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Avg Cost (QAR)</Label>
              {avgCostLocked ? (
                <div className="space-y-1">
                  <Input
                    value={avgCost}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Auto-calculated from PO receivals</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number" min="0" step="0.01"
                    value={avgCost}
                    onChange={(e) => setAvgCost(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">Set initial cost — overwritten by first PO receival</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Reorder Point</Label>
              <Input
                type="number" min="0" step="1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
          </div>

          {/* Warehouse Stock Allocation */}
          {warehouses.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm">
                  <WarehouseIcon className="h-3.5 w-3.5 text-primary" />
                  Warehouse Stock
                </Label>
                <span className="text-xs text-muted-foreground font-medium">
                  Total: {computedStockLevel}
                </span>
              </div>
              <div className="space-y-1.5">
                {warehouses.map((wh) => {
                  const current = currentQtyMap.get(wh.id) ?? 0
                  const target = parseInt(whAlloc[wh.id] ?? '0') || 0
                  const changed = target !== current
                  return (
                    <div key={wh.id} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                      <span className="text-xs truncate">{wh.name}</span>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          className={`h-7 text-xs text-right ${changed ? 'border-primary ring-1 ring-primary/20' : ''}`}
                          value={whAlloc[wh.id] ?? '0'}
                          onChange={(e) => updateWhAlloc(wh.id, e.target.value)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Set how many units each warehouse holds. Changes are applied on save.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
