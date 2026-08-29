'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { Camera, X, ChevronsUpDown, Package } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { WhItemPicker, type PickerItem } from './WhItemPicker'
import { Warehouse } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile } from '@/hooks/useProfiles'
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'
import { useCreateStockAdjustmentV2, useWarehouseStock, type WarehouseStockItem } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers, useWarehouseDivisionSets } from '@/hooks/useWarehouseSubContainers'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'
import { useVariantCategoryPaths } from '@/hooks/useVariantCategoryPaths'
import { ReasonSelect } from '@/components/shared/ReasonSelect'

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
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [type, setType] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const createAdjustment = useCreateStockAdjustmentV2()

  // Scope the item picker to stock physically in the chosen warehouse + sub-
  // container (not the full catalog) — matches the transfer picker, and the rows
  // carry item_type + origin so the picker groups by type and shows origin.
  const { data: containerStock = [] } = useWarehouseStock(warehouseId || undefined, subContainerId)

  // Division scope (top-bar view): only adjust the active division's stock, so a
  // single-division operator can't decrease/damage/write-off another division's
  // shelf. "All" = no filter.
  const { viewDivisionIds } = useActiveDivision()
  const { data: whDivisionSets } = useWarehouseDivisionSets()
  const visibleWarehouses = useMemo(() => {
    if (viewDivisionIds.size === 0) return warehouses
    return warehouses.filter((w) => {
      const divs = whDivisionSets?.get(w.id)
      if (!divs) return false
      for (const d of viewDivisionIds) if (divs.has(d)) return true
      return false
    })
  }, [warehouses, whDivisionSets, viewDivisionIds])

  useEffect(() => {
    if (warehouseId && !visibleWarehouses.some((w) => w.id === warehouseId)) setWarehouseId('')
  }, [warehouseId, visibleWarehouses])

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const eligibleSubs = useMemo(
    () => allSubs.filter((sc) =>
      sc.is_active && (viewDivisionIds.size === 0 || (sc.division_id != null && viewDivisionIds.has(sc.division_id)))),
    [allSubs, viewDivisionIds],
  )

  useEffect(() => {
    if (eligibleSubs.length === 1) setSubContainerId(eligibleSubs[0].id)
    else if (eligibleSubs.length === 0) setSubContainerId(null)
    else if (subContainerId && !eligibleSubs.some((sc) => sc.id === subContainerId)) setSubContainerId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, eligibleSubs.length])

  // Clear the picked item whenever the container scope changes.
  useEffect(() => { setSelectedVariantId(null) }, [warehouseId, subContainerId])

  // Full category breadcrumbs for the picker header ("Root > … > Leaf"). One
  // bounded, cached read over the sub's stock variants — resolved client-side so
  // it works regardless of which columns warehouse_stock_summary carries.
  const stockVariantIds = useMemo(() => containerStock.map((s) => s.brand_variant_id), [containerStock])
  const categoryPaths = useVariantCategoryPaths(stockVariantIds)

  const pickerItems: PickerItem[] = useMemo(() => {
    if (!warehouseId) return []
    // One entry per variant (a variant can span sub-containers when none is
    // picked yet); first row wins for the display fields.
    const seen = new Map<string, WarehouseStockItem>()
    for (const s of containerStock) if (!seen.has(s.brand_variant_id)) seen.set(s.brand_variant_id, s)
    return [...seen.values()].map((s) => ({
      id:          s.brand_variant_id,
      name:        s.item_name ?? '(No name)',
      brand:       s.brand ?? null,
      countryName: s.country_name ?? null,
      sku:         s.sku ?? null,
      category:    s.category_name ?? null,
      categoryPath: categoryPaths.get(s.brand_variant_id) ?? null,
      type:        s.item_type ?? null,
      qty:         s.qty,
      imageUrl:    s.image_url ?? null,
    }))
  }, [containerStock, warehouseId, categoryPaths])

  const selectedItem = selectedVariantId ? pickerItems.find((p) => p.id === selectedVariantId) ?? null : null
  const selVarLabel = selectedItem
    ? variantPickerLabel({ brand: selectedItem.brand, country_name: selectedItem.countryName })
    : null

  const subResolved = eligibleSubs.length > 0 && (eligibleSubs.length === 1 || !!subContainerId)
  const canSubmit = !!warehouseId && subResolved && !!selectedVariantId && !!type && !!qty && !!reason

  function handleClose() {
    setOpen(false)
    setWarehouseId('')
    setSubContainerId(null)
    setSelectedVariantId(null)
    setItemPickerOpen(false)
    setType('')
    setQty('')
    setReason('')
    setNotes('')
    setPhotos([])
    setPreviews([])
  }

  const isDirty =
    warehouseId !== '' ||
    subContainerId !== null ||
    selectedVariantId !== null ||
    type !== '' ||
    qty !== '' ||
    reason !== '' ||
    notes !== '' ||
    photos.length > 0

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty,
    onOpenChange: (next) => { if (!next) handleClose(); else setOpen(true) },
  })

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (photos.length + files.length > 5) {
      toast.error('Maximum 5 photos allowed')
      e.target.value = ''
      return
    }
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        toast.error(`${f.name}: unsupported type (JPG / PNG / WEBP / GIF only)`)
        e.target.value = ''
        return
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name}: file exceeds 10 MB`)
        e.target.value = ''
        return
      }
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
    if (!canSubmit || !currentProfile || !selectedVariantId) return
    if (eligibleSubs.length === 0) { toast.error('Warehouse has no active sub-container'); return }
    if (eligibleSubs.length > 1 && !subContainerId) { toast.error('Pick a sub-container'); return }
    setSubmitting(true)
    try {
      const supabase = createClient()

      const MIME_EXT: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png':  'png',
        'image/webp': 'webp',
        'image/gif':  'gif',
      }
      const photoUrls: string[] = []
      const uploadedPaths: string[] = []
      try {
        for (const file of photos) {
          const nameExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
          const ext = MIME_EXT[file.type] ?? (nameExt || 'bin')
          const path = `${currentProfile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('adjustment-photos')
            .upload(path, file, { contentType: file.type })
          if (uploadErr) throw uploadErr
          uploadedPaths.push(path)
          photoUrls.push(path)
        }
      } catch (uploadErr) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('adjustment-photos').remove(uploadedPaths).catch(() => {})
        }
        throw uploadErr
      }

      await createAdjustment.mutateAsync({
        warehouseId:      warehouseId,
        subContainerId:   subContainerId,
        brandVariantId:   selectedVariantId,
        adjustmentType:   type as 'increase' | 'decrease' | 'damage' | 'write_off',
        qty:              parseFloat(qty),
        reason,
        notes:            notes || null,
        photoUrls,
        requestedBy:      currentProfile.id,
        requestedByName:  currentProfile.full_name,
      })
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
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[36rem] sm:h-[80vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-sm font-semibold">Stock Adjustment</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2 space-y-4">
            {/* Warehouse */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {visibleWarehouses.length === 0 ? (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      No warehouse holds this division&apos;s stock.
                    </div>
                  ) : (
                    visibleWarehouses.map(wh => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {warehouseId && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap min-h-7 pt-0.5">
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    <Package className="h-3 w-3" />
                    Sub-container:
                  </span>
                  {eligibleSubs.length === 0 ? (
                    <span className="italic text-destructive">No active sub-container in this warehouse.</span>
                  ) : eligibleSubs.length === 1 ? (
                    <>
                      <span className="font-medium text-foreground truncate max-w-[300px]" title={eligibleSubs[0].name}>
                        {eligibleSubs[0].name}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">Auto</Badge>
                    </>
                  ) : (
                    <Select value={subContainerId ?? ''} onValueChange={(v) => setSubContainerId(v || null)}>
                      <SelectTrigger className="h-7 text-[11px] w-auto min-w-[220px] max-w-[320px]">
                        <SelectValue placeholder="Pick sub-container…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {eligibleSubs.map((sc) => (
                          <SelectItem key={sc.id} value={sc.id} className="text-[11px]">
                            {sc.name}{sc.division_name && !sc.name.includes(sc.division_name) ? ` — ${sc.division_name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* Item — single searchable picker */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Item *</Label>
              <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                <PopoverTrigger
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-[11px] ring-offset-background hover:bg-accent/50 cursor-pointer"
                >
                  {selectedItem && selVarLabel ? (
                    <span className="truncate">
                      <span className="font-medium">{selectedItem.name}</span>
                      <span className="text-muted-foreground"> — {selVarLabel.primary}{selVarLabel.origin ? ` · ${selVarLabel.origin}` : ''}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{warehouseId ? 'Search items…' : 'Select a warehouse first'}</span>
                  )}
                  <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-auto"
                  align="start"
                  side="bottom"
                  collisionAvoidance={{ side: 'none' }}
                >
                  <WhItemPicker
                    items={pickerItems}
                    currentValue={selectedVariantId ?? ''}
                    onSelect={(id) => {
                      setSelectedVariantId(id)
                      setItemPickerOpen(false)
                    }}
                    showQty
                  />
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
                  <SelectContent className="max-h-60 overflow-y-auto">
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
              <ReasonSelect
                category="adjustment"
                value={reason}
                onChange={setReason}
                placeholder="Select a reason…"
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
          <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => guardedOnOpenChange(false)}>
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
      {confirmDialog}
    </>
  )
}
