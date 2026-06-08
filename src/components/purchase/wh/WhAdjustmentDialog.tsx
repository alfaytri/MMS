'use client'

import { useState, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, X, ChevronsUpDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Warehouse } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile } from '@/hooks/useProfiles'
import { useAllBrandVariantsGrouped, type BrandVariantGrouped } from '@/hooks/useInventory'
import { queryKeys } from '@/lib/queryKeys'

const ADJUSTMENT_TYPES = [
  { value: 'increase',  label: 'Increase (Found/Returned)' },
  { value: 'decrease',  label: 'Decrease (Lost/Consumed)' },
  { value: 'damage',    label: 'Damage' },
  { value: 'write_off', label: 'Write Off' },
]

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
  children: React.ReactNode
}

export function WhAdjustmentDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [selectedVariant, setSelectedVariant] = useState<BrandVariantGrouped | null>(null)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [type, setType] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: allVariants = [] } = useAllBrandVariantsGrouped(open)

  const canSubmit = !!warehouseId && !!selectedVariant && !!type && !!qty && !!reason

  function handleClose() {
    setOpen(false)
    setWarehouseId('')
    setSelectedVariant(null)
    setItemPickerOpen(false)
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
    if (!canSubmit || !currentProfile || !selectedVariant) return
    setSubmitting(true)
    try {
      const supabase = createClient()

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

      const { error } = await supabase.from('stock_adjustments').insert({
        warehouse_id: warehouseId,
        brand_variant_id: selectedVariant.variantId,
        adjustment_type: type,
        qty: parseFloat(qty),
        reason,
        notes: notes || null,
        photo_urls: photoUrls,
        status: 'pending_approval',
        requested_by_name: currentProfile.full_name ?? currentProfile.email,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      toast.success('Adjustment submitted for approval')
      handleClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-full h-full rounded-none sm:w-auto sm:h-auto sm:rounded-lg sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-sm font-semibold">Stock Adjustment</DialogTitle>
          </DialogHeader>

          <div className="px-5 pb-5 space-y-4">
            {/* Warehouse */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item — single searchable picker */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Item *</Label>
              <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                <PopoverTrigger
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-[11px] ring-offset-background hover:bg-accent/50 cursor-pointer"
                >
                  {selectedVariant ? (
                    <span className="truncate">
                      <span className="font-medium">{selectedVariant.itemName}</span>
                      <span className="text-muted-foreground"> — {selectedVariant.brand}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search items...</span>
                  )}
                  <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <Command
                    filter={(value, search) => {
                      const item = allVariants.find((v) => v.variantId === value)
                      if (!item) return 0
                      const haystack = [
                        item.itemName,
                        item.brand,
                        item.catName,
                        item.itemSku,
                      ].filter(Boolean).join(' ').toLowerCase()
                      return haystack.includes(search.toLowerCase()) ? 1 : 0
                    }}
                  >
                    <CommandInput placeholder="Search by name, brand or category..." className="text-xs" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty className="py-4 text-[11px]">No items found.</CommandEmpty>
                      <CommandGroup>
                        {allVariants.map((v) => {
                          const isSelected = selectedVariant?.variantId === v.variantId
                          return (
                            <CommandItem
                              key={v.variantId}
                              value={v.variantId}
                              onSelect={() => {
                                setSelectedVariant(v)
                                setItemPickerOpen(false)
                              }}
                              className="py-1.5 text-[11px]"
                              data-checked={isSelected || undefined}
                            >
                              <div className="flex flex-col gap-0 min-w-0 flex-1">
                                <span className="text-[9px] text-muted-foreground truncate">
                                  {v.catName}
                                </span>
                                <span className="font-medium text-[11px] truncate">
                                  {v.itemName}
                                </span>
                                <span className="text-[9px] text-primary truncate">
                                  {v.brand}
                                  {v.itemSku && <span className="text-muted-foreground ml-1">({v.itemSku})</span>}
                                </span>
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Type + Qty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Quantity *</Label>
                <Input
                  type="number"
                  className="h-9 text-xs"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Reason *</Label>
              <Input
                className="h-9 text-xs"
                placeholder="Reason for adjustment..."
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Notes</Label>
              <Textarea
                className="text-[11px] min-h-[48px] resize-none"
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Photos */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Photos</Label>
              <div className="flex flex-wrap gap-1.5">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative h-12 w-12">
                    <img src={url} className="h-12 w-12 object-cover rounded border" alt="" />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      onClick={() => removePhoto(idx)}
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    type="button"
                    className="h-12 w-12 rounded border border-dashed border-border flex items-center justify-center hover:border-primary transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhoto} />
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-5 py-3 border-t bg-muted/30">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[11px] h-8"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
