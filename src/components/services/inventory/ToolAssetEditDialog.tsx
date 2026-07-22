'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCreateToolItem, useUpdateInventoryItem,
  useCreateToolAssetUnit, useUpdateToolAssetUnit,
  useToolAssetUnits,
  useStaffProfiles,
  type InventoryItem, type ToolAssetUnit,
} from '@/hooks/useInventory'

type ItemProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  item?: InventoryItem | null
  categoryId?: string | null
}

export function ToolAssetItemEditDialog({ open, onOpenChange, item, categoryId }: ItemProps) {
  const isEdit = !!item
  const create = useCreateToolItem()
  const update = useUpdateInventoryItem()
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')

  useEffect(() => {
    if (open) { setNameEn(item?.name_en ?? ''); setNameAr(item?.name_ar ?? '') }
  }, [open, item])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    const payload = { name_en: nameEn.trim(), name_ar: nameAr.trim() || null }
    if (isEdit && item) {
      update.mutate({ id: item.id, ...payload }, {
        onSuccess: () => { toast.success('Tool updated'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    } else {
      if (!categoryId) { toast.error('Category is required to create a tool'); return }
      create.mutate({ ...payload, category_id: categoryId }, {
        onSuccess: () => { toast.success('Tool created'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Tool/Asset' : 'New Tool/Asset'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-1">
              <Label htmlFor="tool-name-en">Name (English) *</Label>
              <Input id="tool-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Power Drill" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tool-name-ar">Name (Arabic)</Label>
              <Input id="tool-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className="h-10" />
            </div>
          </div>
          <DialogFooter className="pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type UnitProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  itemSku?: string | null
  unit?: ToolAssetUnit | null
}

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Under Repair']

export function ToolAssetUnitEditDialog({ open, onOpenChange, itemId, itemSku, unit }: UnitProps) {
  const isEdit = !!unit
  const create = useCreateToolAssetUnit()
  const update = useUpdateToolAssetUnit()
  const { data: staffProfiles = [] } = useStaffProfiles()
  const { data: existingUnits = [] } = useToolAssetUnits(!isEdit && open ? itemId : null)
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState('')
  const [condition, setCondition] = useState('Good')
  const [expiry, setExpiry] = useState('')
  const [status, setStatus] = useState('available')
  const [assignedTo, setAssignedTo] = useState<string>('')

  useEffect(() => {
    if (open) {
      if (isEdit) {
        setSerial(unit?.serial_number ?? '')
      } else {
        const prefix = itemSku?.trim() || `TOOL-${itemId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
        const next   = (existingUnits.length + 1).toString().padStart(3, '0')
        setSerial(`${prefix}-${next}`)
      }
      setBrand(unit?.brand ?? '')
      setCondition(unit?.condition ?? 'Good')
      setExpiry(unit?.expiry ?? '')
      setStatus(unit?.status ?? 'available')
      setAssignedTo(unit?.assigned_to ?? '')
    }
  }, [open, unit, isEdit, itemId, itemSku, existingUnits.length])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!serial.trim()) { toast.error('Serial number is required'); return }
    if (!brand.trim()) { toast.error('Brand is required'); return }
    if (status === 'assigned' && !assignedTo) { toast.error('Select a staff member to assign to'); return }
    const payload = {
      serial_number: serial.trim(),
      brand: brand.trim(),
      condition,
      expiry: expiry || null,
      status,
      assigned_to: status === 'assigned' ? assignedTo : null,
    }
    if (isEdit && unit) {
      update.mutate({ id: unit.id, item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit updated'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    } else {
      create.mutate({ item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit added'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Unit' : 'Add Unit'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-1">
              <Label htmlFor="tool-serial">Serial Number *</Label>
              <Input id="tool-serial" value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tool-brand">Brand *</Label>
              <Input id="tool-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tool-condition">Condition</Label>
                <Select value={condition} onValueChange={(v) => { if (v !== null) setCondition(v) }}>
                  <SelectTrigger id="tool-condition" className="h-10 w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tool-status">Status</Label>
                <Select value={status} onValueChange={(v) => { if (v !== null) { setStatus(v); if (v !== 'assigned') setAssignedTo('') } }}>
                  <SelectTrigger id="tool-status" className="h-10 w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {status === 'assigned' && (
              <div className="space-y-1">
                <Label htmlFor="tool-assigned-to">Assigned To *</Label>
                <Select value={assignedTo} onValueChange={(v) => { if (v !== null) setAssignedTo(v) }}>
                  <SelectTrigger id="tool-assigned-to" className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {staffProfiles.find((p) => p.id === assignedTo)?.full_name ?? 'Select staff member…'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {staffProfiles.length === 0 && (
                      <SelectItem value="_none" disabled>No staff profiles found</SelectItem>
                    )}
                    {staffProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="tool-expiry">Expiry Date</Label>
              <Input id="tool-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter className="pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
