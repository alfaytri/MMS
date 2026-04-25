'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCreateToolAssetItem, useUpdateToolAssetItem,
  useCreateToolAssetUnit, useUpdateToolAssetUnit,
  useStaffProfiles,
  type ToolAssetItem, type ToolAssetUnit,
} from '@/hooks/useInventory'

type ItemProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  item?: ToolAssetItem | null
}

export function ToolAssetItemEditDialog({ open, onOpenChange, item }: ItemProps) {
  const isEdit = !!item
  const create = useCreateToolAssetItem()
  const update = useUpdateToolAssetItem()
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
      create.mutate(payload, {
        onSuccess: () => { toast.success('Tool created'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Tool/Asset' : 'New Tool/Asset'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label>Name (English) *</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Power Drill" />
          </div>
          <div className="space-y-1">
            <Label>Name (Arabic)</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </div>
          <DialogFooter>
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
  unit?: ToolAssetUnit | null
}

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Under Repair']

export function ToolAssetUnitEditDialog({ open, onOpenChange, itemId, unit }: UnitProps) {
  const isEdit = !!unit
  const create = useCreateToolAssetUnit()
  const update = useUpdateToolAssetUnit()
  const { data: staffProfiles = [] } = useStaffProfiles()
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState('')
  const [condition, setCondition] = useState('Good')
  const [expiry, setExpiry] = useState('')
  const [status, setStatus] = useState('available')
  const [assignedTo, setAssignedTo] = useState<string>('')

  useEffect(() => {
    if (open) {
      setSerial(unit?.serial_number ?? '')
      setBrand(unit?.brand ?? '')
      setCondition(unit?.condition ?? 'Good')
      setExpiry(unit?.expiry ?? '')
      setStatus(unit?.status ?? 'available')
      setAssignedTo(unit?.assigned_to ?? '')
    }
  }, [open, unit])

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
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Unit' : 'Add Unit'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label>Serial Number *</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: string) => { setStatus(v); if (v !== 'assigned') setAssignedTo('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
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
              <Label>Assigned To *</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member…">
                    {staffProfiles.find((p) => p.id === assignedTo)?.full_name ?? 'Select staff member…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
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
            <Label>Expiry Date</Label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <DialogFooter>
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
