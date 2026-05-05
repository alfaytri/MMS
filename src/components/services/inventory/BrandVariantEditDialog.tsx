'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Warehouse as WarehouseIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, useVariantWarehouseStock, type BrandVariant } from '@/hooks/useInventory'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useQueryClient } from '@tanstack/react-query'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
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

  const { data: warehouses = [] } = useWarehouses()
  const { data: whStockData } = useVariantWarehouseStock(isEdit ? variant?.id : undefined)
  const currentWhStock = whStockData?.perWarehouse ?? []
  const unassignedQty = whStockData?.unassigned ?? 0

  // True when the system manages avg cost (stock received via PO)
  const avgCostLocked = isEdit && (variant?.stock_level ?? 0) > 0

  // Build a lookup of warehouse name → qty for display
  const whStockMap = useMemo(() => {
    const m = new Map<string, number>()
    currentWhStock.forEach((ws) => m.set(ws.warehouse_id, ws.qty))
    return m
  }, [currentWhStock])

  const totalStock = useMemo(
    () => currentWhStock.reduce((sum, ws) => sum + ws.qty, 0) + unassignedQty,
    [currentWhStock, unassignedQty],
  )

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
      ...(!avgCostLocked && { average_cost: avgCost !== '' ? Number(avgCost) : null }),
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['variant_warehouse_stock'] })
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
          onSuccess: () => {
            toast.success('Variant added')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

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

          {/* Warehouse Stock — read-only display */}
          {isEdit && warehouses.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm">
                  <WarehouseIcon className="h-3.5 w-3.5 text-primary" />
                  Warehouse Stock
                </Label>
                <span className="text-xs font-semibold">
                  Total: {totalStock}
                </span>
              </div>
              <div className="space-y-1">
                {warehouses.map((wh) => {
                  const qty = whStockMap.get(wh.id) ?? 0
                  return (
                    <div key={wh.id} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/40">
                      <span className="text-xs text-muted-foreground truncate">{wh.name}</span>
                      <span className="text-xs font-medium tabular-nums">{qty}</span>
                    </div>
                  )
                })}
                {unassignedQty > 0 && (
                  <div className="flex items-center justify-between py-1 px-1.5 rounded bg-warning/10 border border-warning/20">
                    <span className="text-xs text-warning font-medium">Unassigned</span>
                    <span className="text-xs font-semibold text-warning tabular-nums">{unassignedQty}</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Stock is updated via PO receivals. To reduce stock, an admin adjustment is required.
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
