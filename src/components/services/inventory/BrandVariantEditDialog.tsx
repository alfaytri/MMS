'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

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

  const [brand, setBrand] = useState('')
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [marginPercent, setMarginPercent] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [stockLevel, setStockLevel] = useState('0')

  useEffect(() => {
    if (open) {
      setBrand((variant as any)?.brand ?? '')
      setCode((variant as any)?.code ?? '')
      setSellingPrice((variant as any)?.selling_price != null ? String((variant as any).selling_price) : '')
      setMarginPercent((variant as any)?.margin_percent != null ? String((variant as any).margin_percent) : '0')
      setReorderPoint(variant ? String((variant as any).reorder_point ?? 0) : '0')
      setStockLevel(variant ? String((variant as any).stock_level ?? 0) : '0')
    }
  }, [open, variant])

  function handleSubmit(e: React.FormEvent) {
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
      stock_level: Number(stockLevel) || 0,
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => { toast.success('Variant updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: () => { toast.success('Variant added'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
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
              <Label>Reorder Point</Label>
              <Input
                type="number" min="0" step="1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Stock on Hand</Label>
              <Input
                type="number" min="0" step="1"
                value={stockLevel}
                onChange={(e) => setStockLevel(e.target.value)}
              />
            </div>
          </div>
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
