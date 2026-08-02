'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRepairVendors } from '@/hooks/useRepairVendors'
import { useSendDamagedStockForRepair } from '@/hooks/useSendDamagedStockForRepair'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

interface Props {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  warehouseId:     string
  warehouseName?:  string | null
  brandVariantId:  string
  itemName?:       string | null
  sku?:            string | null
  onHandQty:       number
  onComplete?:     () => void
}

type SubContainerOption = {
  id:            string
  name:          string
  division_id:   string
  division_name: string
}

/**
 * Phase F — Ad-hoc Send-for-Repair from Damaged Stock On-hand. Fires
 * rpc_send_damaged_stock_for_repair with no disposition context.
 *
 * Structurally similar to SendForRepairDialog but simpler: no return_line
 * trace, no disposition context chips, adds a qty input capped at the
 * row's on-hand qty.
 */
export function SendDamagedStockForRepairDialog({
  open, onOpenChange, warehouseId, warehouseName, brandVariantId, itemName, sku, onHandQty, onComplete,
}: Props) {
  const { data: vendors = [], isLoading: vendorsLoading } = useRepairVendors({ activeOnly: true })
  const { activeDivisionId } = useActiveDivision()
  const send = useSendDamagedStockForRepair()

  const { data: subContainers = [], isLoading: subsLoading } = useQuery<SubContainerOption[]>({
    queryKey: ['send-damaged-stock-for-repair', 'sub-containers', warehouseId],
    enabled: open && !!warehouseId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .select('id, name, division_id, company_divisions!inner(name)')
        .eq('warehouse_id', warehouseId)
        .order('division_id')
      if (error) throw error
      return (data ?? [])
        .map((r) => {
          if (!r.division_id) return null
          const div = Array.isArray(r.company_divisions) ? r.company_divisions[0] : r.company_divisions
          if (!div) return null
          return { id: r.id, name: r.name, division_id: r.division_id, division_name: div.name }
        })
        .filter((r): r is SubContainerOption => r !== null)
    },
  })

  const [vendorId, setVendorId] = useState('')
  const [qty, setQty] = useState<number>(onHandQty)
  const [divisionId, setDivisionId] = useState('')
  const [expectedReturn, setExpectedReturn] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) {
      setVendorId('')
      setDivisionId('')
      setNotes('')
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setExpectedReturn(d.toISOString().slice(0, 10))
    }
    setQty(onHandQty)
  }, [open, onHandQty])

  const singleVendor = vendors.length === 1
  useEffect(() => {
    if (open && singleVendor && !vendorId) setVendorId(vendors[0].id)
  }, [open, singleVendor, vendors, vendorId])

  const uniqueDivisions = useMemo(() => {
    const seen = new Set<string>()
    return subContainers.filter((s) => {
      if (seen.has(s.division_id)) return false
      seen.add(s.division_id)
      return true
    })
  }, [subContainers])

  useEffect(() => {
    if (!open || divisionId || uniqueDivisions.length === 0) return
    if (uniqueDivisions.length === 1) {
      setDivisionId(uniqueDivisions[0].division_id)
      return
    }
    const activeMatch = uniqueDivisions.find((d) => d.division_id === activeDivisionId)
    if (activeMatch) setDivisionId(activeMatch.division_id)
  }, [open, divisionId, uniqueDivisions, activeDivisionId])

  const singleDivision = uniqueDivisions.length === 1
  const needsDivisionPick = uniqueDivisions.length > 1
  const selectedSub = useMemo(
    () => (divisionId ? subContainers.find((s) => s.division_id === divisionId) ?? null : null),
    [divisionId, subContainers],
  )

  const canSubmit =
    !!vendorId &&
    !!expectedReturn &&
    !!warehouseId &&
    !!brandVariantId &&
    qty > 0 &&
    qty <= onHandQty &&
    (uniqueDivisions.length === 0 || !!divisionId) &&
    !send.isPending

  function handleSubmit() {
    if (!divisionId) {
      toast.error('Pick a source division')
      return
    }
    send.mutate(
      {
        warehouseId,
        brandVariantId,
        qty,
        repairVendorId: vendorId,
        expectedReturnDate: expectedReturn,
        sourceDivisionId: divisionId,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Sent for repair — transfer created')
          onOpenChange(false)
          onComplete?.()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:rounded-lg p-0 gap-0 flex flex-col sm:max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-600" />
              Send for Repair
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {itemName && <div className="break-words">{itemName}{sku ? ` · ${sku}` : ''}</div>}
              {warehouseName && (
                <div>
                  From: <span className="text-foreground">{warehouseName}</span>
                  {selectedSub && (
                    <span className="text-muted-foreground"> → <span className="text-foreground">{selectedSub.name}</span></span>
                  )}
                </div>
              )}
              <div>On-hand damaged: <span className="text-foreground">{onHandQty}</span></div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto sm:flex-1 sm:min-h-0">
          <div className="space-y-2">
            <Label htmlFor="sdsr-qty">Qty to send *</Label>
            <Input
              id="sdsr-qty"
              type="number"
              min={1}
              max={onHandQty}
              value={qty}
              onChange={(e) => setQty(Math.max(0, Math.min(onHandQty, Number(e.target.value) || 0)))}
              className="w-full h-10"
            />
            <p className="text-[11px] text-muted-foreground">Max {onHandQty}.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sdsr-vendor">Repair Vendor *</Label>
            <Select
              value={vendorId}
              onValueChange={(v) => v && setVendorId(v)}
              disabled={vendorsLoading || vendors.length === 0}
            >
              <SelectTrigger id="sdsr-vendor" className="w-full h-10">
                <SelectValue placeholder={vendorsLoading ? 'Loading vendors…' : vendors.length === 0 ? 'No active vendors — add one first' : 'Select vendor'} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!vendorsLoading && vendors.length === 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Add a repair vendor at <span className="font-mono">/warehouse/repair-vendors</span> before sending units for repair.
              </p>
            )}
          </div>

          {uniqueDivisions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sdsr-division">
                Source Division {needsDivisionPick ? '*' : ''}
              </Label>
              <Select
                value={divisionId}
                onValueChange={(v) => v && setDivisionId(v)}
                disabled={subsLoading || singleDivision}
              >
                <SelectTrigger id="sdsr-division" className="w-full h-10">
                  <SelectValue placeholder={subsLoading ? 'Loading divisions…' : 'Pick source division'} />
                </SelectTrigger>
                <SelectContent>
                  {uniqueDivisions.map((d) => (
                    <SelectItem key={d.division_id} value={d.division_id}>{d.division_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsDivisionPick && (
                <p className="text-[11px] text-muted-foreground">
                  This warehouse holds stock for multiple divisions — pick which one owns the damaged unit.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sdsr-date">Expected Return Date *</Label>
            <Input
              id="sdsr-date"
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sdsr-notes">Notes</Label>
            <Textarea
              id="sdsr-notes"
              rows={3}
              className="resize-none"
              placeholder="Damage description, quoted repair cost, contact person…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-5 gap-3 sm:justify-end sm:space-x-0">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
            {send.isPending ? 'Sending...' : 'Send for Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
