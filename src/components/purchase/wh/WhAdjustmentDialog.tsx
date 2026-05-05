'use client'

import { useState, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Warehouse } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import {
  useInventoryCategories,
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
} from '@/hooks/useInventory'

const ADJUSTMENT_TYPES = [
  { value: 'increase',  label: 'Increase (Found/Returned)' },
  { value: 'decrease',  label: 'Decrease (Lost/Consumed)' },
  { value: 'damage',    label: 'Damage' },
  { value: 'write_off', label: 'Write Off' },
]

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
  children: React.ReactNode
}

export function WhAdjustmentDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  // Cascading item selection
  const [categoryId, setCategoryId] = useState('')
  const [itemId, setItemId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [selectedItem, setSelectedItem] = useState<InventoryLookupResult | null>(null)
  const [type, setType] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: categories = [] } = useInventoryCategories()
  const { data: items = [] } = useInventoryItemsByCategory(categoryId || null)
  const { data: variants = [] } = useInventoryBrandVariants(itemId || null)

  const canSubmit = !!warehouseId && !!selectedItem && !!type && !!qty && !!reason

  function handleCategoryChange(id: string) {
    setCategoryId(id)
    setItemId('')
    setVariantId('')
    setSelectedItem(null)
  }

  function handleItemChange(id: string) {
    setItemId(id)
    setVariantId('')
    setSelectedItem(null)
  }

  function handleVariantChange(id: string) {
    setVariantId(id)
    const variant = variants.find((v) => v.id === id)
    const item = items.find((i) => i.id === itemId)
    if (!variant || !item) { setSelectedItem(null); return }
    setSelectedItem({
      brand_variant_id: variant.id,
      item_name:        `${item.name_en} · ${variant.brand}`,
      item_name_ar:     null,
      sku:              (item as any).sku ?? null,
      unit:             (item as any).unit ?? 'pcs',
      cost_price:       (variant as any).cost_price ?? 0,
    })
  }

  function handleClose() {
    setOpen(false)
    setWarehouseId('')
    setCategoryId('')
    setItemId('')
    setVariantId('')
    setSelectedItem(null)
    setType('')
    setQty('')
    setReason('')
    setNotes('')
    setPhotos([])
    setPreviews([])
  }

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (photos.length + files.length > 5) {
      toast.error('Maximum 5 photos allowed')
      return
    }
    const newFiles = [...photos, ...files].slice(0, 5)
    setPhotos(newFiles)
    setPreviews(newFiles.map(f => URL.createObjectURL(f)))
    e.target.value = ''
  }

  function removePhoto(idx: number) {
    const updated = photos.filter((_, i) => i !== idx)
    setPhotos(updated)
    setPreviews(updated.map(f => URL.createObjectURL(f)))
  }

  async function handleSubmit() {
    if (!canSubmit || !currentProfile) return
    setSubmitting(true)
    try {
      const supabase = createClient()

      // Upload photos to adjustment-photos bucket
      const photoUrls: string[] = []
      for (const file of photos) {
        const ext = file.name.split('.').pop()
        const path = `${currentProfile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('adjustment-photos')
          .upload(path, file)
        if (uploadErr) throw uploadErr
        const { data: signed } = await supabase.storage
          .from('adjustment-photos')
          .createSignedUrl(path, 60 * 60 * 24 * 365)
        if (signed?.signedUrl) photoUrls.push(signed.signedUrl)
      }

      // Insert adjustment record
      const { error } = await (supabase as any).from('stock_adjustments').insert({
        warehouse_id: warehouseId,
        brand_variant_id: selectedItem!.brand_variant_id,
        adjustment_type: type,
        qty: parseFloat(qty),
        reason,
        notes: notes || null,
        photo_urls: photoUrls,
        status: 'pending_approval',
        requested_by_name: currentProfile.full_name ?? currentProfile.email,
      })
      if (error) throw error

      toast.success('Adjustment submitted for approval')
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Stock Adjustment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warehouse */}
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item — cascading Category → Item → Brand */}
            <div className="space-y-1.5">
              <Label className="text-xs">Item *</Label>
              <div className="space-y-2">
                {/* Row 1: Category (full width) */}
                <Select value={categoryId} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Row 2: Item (grows) + Brand (fixed) */}
                <div className="grid grid-cols-[1fr_140px] gap-2">
                  <Select value={itemId} onValueChange={handleItemChange} disabled={!categoryId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select item…" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((i) => (
                        <SelectItem key={i.id} value={i.id} className="text-xs">
                          {i.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={variantId} onValueChange={handleVariantChange} disabled={!itemId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          {(v as any).brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Type + Qty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity *</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min="0"
                  step="0.01"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Reason for adjustment…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Photos */}
            <div className="space-y-1.5">
              <Label className="text-xs">Evidence Photos (max 5)</Label>
              <div className="flex flex-wrap gap-2">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative h-16 w-16">
                    <img src={url} className="h-16 w-16 object-cover rounded-md border" alt="" />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      onClick={() => removePhoto(idx)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    type="button"
                    className="h-16 w-16 rounded-md border-2 border-dashed border-border flex items-center justify-center hover:border-primary transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhoto} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
