'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
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
import { useDivisions } from '@/hooks/useDivisions'

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
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) { setNameEn(item?.name_en ?? ''); setNameAr(item?.name_ar ?? '') }
  }, [open, item])

  const isDirty =
    nameEn !== (item?.name_en ?? '') ||
    nameAr !== (item?.name_ar ?? '')

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    const payload = { name_en: nameEn.trim(), name_ar: nameAr.trim() || null }
    if (isEdit && item) {
      update.mutate({ id: item.id, ...payload }, {
        onSuccess: () => { toast.success('Tool updated'); guardRef.current?.closeAfterSubmit() },
        onError: (err) => toast.error(err.message),
      })
    } else {
      if (!categoryId) { toast.error('Category is required to create a tool'); return }
      create.mutate({ ...payload, category_id: categoryId }, {
        onSuccess: () => { toast.success('Tool created'); guardRef.current?.closeAfterSubmit() },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
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
            <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
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
  const { data: divisions = [] } = useDivisions()
  const { data: existingUnits = [] } = useToolAssetUnits(!isEdit && open ? itemId : null)
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState('')
  const [condition, setCondition] = useState('Good')
  const [expiry, setExpiry] = useState('')
  const [status, setStatus] = useState('available')
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [divisionId, setDivisionId] = useState<string>('')
  const [seededSerial, setSeededSerial] = useState('')
  const [seededDivisionId, setSeededDivisionId] = useState('')
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) {
      let seeded: string
      if (isEdit) {
        seeded = unit?.serial_number ?? ''
      } else {
        const prefix = itemSku?.trim() || `TOOL-${itemId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
        const next   = (existingUnits.length + 1).toString().padStart(3, '0')
        seeded = `${prefix}-${next}`
      }
      setSerial(seeded)
      setSeededSerial(seeded)
      setBrand(unit?.brand ?? '')
      setCondition(unit?.condition ?? 'Good')
      setExpiry(unit?.expiry ?? '')
      setStatus(unit?.status ?? 'available')
      setAssignedTo(unit?.assigned_to ?? '')
      // Division owns the unit; person (assigned_to, above) holds it — independent fields.
      // Pre-select when exactly one division exists (nothing else to pick); otherwise
      // fall back to the unit's own division_id, or unassigned for new/unset units.
      const seededDivision = unit?.division_id ?? (divisions.length === 1 ? divisions[0].id : '')
      setDivisionId(seededDivision)
      setSeededDivisionId(seededDivision)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit, isEdit, itemId, itemSku, existingUnits.length, divisions.length])

  const isDirty =
    serial !== seededSerial ||
    brand !== (unit?.brand ?? '') ||
    condition !== (unit?.condition ?? 'Good') ||
    expiry !== (unit?.expiry ?? '') ||
    status !== (unit?.status ?? 'available') ||
    assignedTo !== (unit?.assigned_to ?? '') ||
    divisionId !== seededDivisionId

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
      division_id: divisionId || null,
    }
    if (isEdit && unit) {
      update.mutate({ id: unit.id, item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit updated'); guardRef.current?.closeAfterSubmit() },
        onError: (err) => toast.error(err.message),
      })
    } else {
      create.mutate({ item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit added'); guardRef.current?.closeAfterSubmit() },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
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
              <div className="space-y-1">
                <Label htmlFor="tool-division">Division</Label>
                <Select
                  value={divisionId || '__none__'}
                  onValueChange={(v) => { if (v !== null) setDivisionId(v === '__none__' ? '' : v) }}
                  disabled={divisions.length <= 1}
                >
                  <SelectTrigger id="tool-division" className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {divisions.find((d) => d.id === divisionId)?.name ?? 'Unassigned'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
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
            <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
  )
}
