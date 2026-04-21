'use client'

import { useState } from 'react'
import { ArrowRightLeft, Bell, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Warehouse } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const UNITS = ['Piece', 'kg', 'Liter', 'm²', 'Roll', 'Box']

interface TransferItem {
  itemName: string
  sku: string
  qty: string
  unit: string
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
  children: React.ReactNode
}

export function WhTransferDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [items, setItems] = useState<TransferItem[]>([{ itemName: '', sku: '', qty: '', unit: 'Piece' }])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const qc = useQueryClient()

  const toWh = warehouses.find(w => w.id === toId)
  const fromWh = warehouses.find(w => w.id === fromId)
  const managerName = (toWh as any)?.manager_name ?? 'the warehouse manager'
  const showApprovalBanner = !!fromId && !!toId

  function handleClose() {
    setOpen(false)
    setFromId(''); setToId('')
    setItems([{ itemName: '', sku: '', qty: '', unit: 'Piece' }])
    setNotes('')
  }

  function addItem() {
    setItems(prev => [...prev, { itemName: '', sku: '', qty: '', unit: 'Piece' }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof TransferItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function handleSubmit() {
    if (!fromId || !toId) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const year = new Date().getFullYear()
      const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
      const transferNumber = `WT-${year}-${seq}`

      const validItems = items
        .filter(i => i.itemName && i.qty)
        .map(i => ({ item_name: i.itemName, sku: i.sku || null, qty: parseFloat(i.qty), unit: i.unit }))

      const { error } = await (supabase as any).from('warehouse_transfers').insert({
        transfer_number: transferNumber,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        from_warehouse_name: fromWh?.name ?? '',
        to_warehouse_name: toWh?.name ?? '',
        status: 'pending_approval',
        date: new Date().toISOString().split('T')[0],
        created_by_name: currentProfile?.full_name ?? currentProfile?.email ?? '',
        items: validItems,
        notes: notes || null,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['warehouse_transfers'] })
      toast.success(`Transfer submitted — awaiting approval from ${managerName}`)
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!fromId && !!toId && items.some(i => i.itemName && i.qty)

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Create Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From Warehouse *</Label>
                <Select value={fromId} onValueChange={v => setFromId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== toId).map(wh => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To Warehouse *</Label>
                <Select value={toId} onValueChange={v => setToId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== fromId).map(wh => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Approval banner */}
            {showApprovalBanner && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs">
                <Bell className="h-3 w-3 text-primary flex-shrink-0" />
                <span>Notification will be sent to <strong>{managerName}</strong> for approval.</span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <Label className="text-xs">Items</Label>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px_auto] gap-2 items-center">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Item name"
                    value={item.itemName}
                    onChange={e => updateItem(idx, 'itemName', e.target.value)}
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="SKU"
                    value={item.sku}
                    onChange={e => updateItem(idx, 'sku', e.target.value)}
                  />
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    placeholder="Qty"
                    min="0"
                    value={item.qty}
                    onChange={e => updateItem(idx, 'qty', e.target.value)}
                  />
                  <Select value={item.unit} onValueChange={v => updateItem(idx, 'unit', v ?? 'Piece')}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => removeItem(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addItem}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
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
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? 'Creating…' : 'Create Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
