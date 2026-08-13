'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { createClient } from '@/lib/supabase/client'
import { useRepairVendors } from '@/hooks/useRepairVendors'
import { useSendDamagedForRepair } from '@/hooks/useSendDamagedForRepair'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

interface SendForRepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dispositionId: string
  warehouseId: string
  warehouseName?: string | null
  itemName?: string | null
  qty?: number | null
  returnId?: string | null
  onComplete?: () => void
}

type SubContainerOption = {
  id: string
  name: string
  division_id: string
  division_name: string
}

type DispositionSourceContext = {
  return_number:        string | null
  source_type:          'sale_order' | 'purchase_order' | null
  source_number:        string | null
  /** Division derived from the item's ORIGINAL outgoing fifo_cost_layer.sub_container. */
  source_division_id:   string | null
  /** Division declared on the return header (if the return has one). */
  source_division_name: string | null
}

function defaultExpectedReturn() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Step 2 of the send-for-repair flow. The disposition row already exists;
 * this dialog collects the vendor, division/sub-container, expected return
 * date, then fires rpc_send_damaged_for_repair.
 */
export function SendForRepairDialog({
  open, onOpenChange, dispositionId, warehouseId, warehouseName, itemName, qty, returnId, onComplete,
}: SendForRepairDialogProps) {
  const { data: vendors = [], isLoading: vendorsLoading } = useRepairVendors({ activeOnly: true })
  const { activeDivisionId } = useActiveDivision()
  const send = useSendDamagedForRepair()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: sourceCtx } = useQuery<DispositionSourceContext | null>({
    queryKey: ['send-for-repair', 'source-ctx', dispositionId],
    enabled: open && !!dispositionId,
    queryFn: async () => {
      const supabase = createClient()
      const { data: disp, error: dispErr } = await supabase
        .from('return_line_inventory_dispositions')
        .select('return_lines!inner(id, brand_variant_id, sale_delivery_line_id, so_po_returns!inner(return_number, source_type, source_id, company_divisions(name)))')
        .eq('id', dispositionId)
        .maybeSingle()
      if (dispErr) throw dispErr
      const rlNode = disp?.return_lines
      const rl = Array.isArray(rlNode) ? rlNode[0] : rlNode
      const rNode = rl?.so_po_returns
      const r = Array.isArray(rNode) ? rNode[0] : rNode
      if (!r) return null

      const source_type = (r.source_type as 'sale_order' | 'purchase_order' | null) ?? null
      const divNode = r.company_divisions
      const div = Array.isArray(divNode) ? divNode[0] : divNode

      let source_number: string | null = null
      if (source_type === 'sale_order' && r.source_id) {
        const { data } = await supabase.from('sale_orders').select('so_number').eq('id', r.source_id).maybeSingle()
        source_number = data?.so_number ?? null
      } else if (source_type === 'purchase_order' && r.source_id) {
        const { data } = await supabase.from('purchase_orders').select('po_number').eq('id', r.source_id).maybeSingle()
        source_number = data?.po_number ?? null
      }

      let source_division_id: string | null = null
      if (rl?.sale_delivery_line_id && rl.brand_variant_id) {
        const { data: sdl } = await supabase
          .from('sale_delivery_lines')
          .select('sale_delivery_id')
          .eq('id', rl.sale_delivery_line_id)
          .maybeSingle()
        if (sdl?.sale_delivery_id) {
          const { data: ces } = await supabase
            .from('cogs_entries')
            .select('source_id, division_id, created_at')
            .eq('sale_delivery_id', sdl.sale_delivery_id)
            .eq('brand_variant_id', rl.brand_variant_id)
            .order('created_at', { ascending: true })
            .limit(1)
          const ce = ces?.[0]
          if (ce?.source_id) {
            const { data: fcl } = await supabase
              .from('fifo_cost_layers')
              .select('sub_container_id, warehouse_sub_containers(division_id)')
              .eq('id', ce.source_id)
              .maybeSingle()
            const wscNode = fcl?.warehouse_sub_containers
            const wsc = Array.isArray(wscNode) ? wscNode[0] : wscNode
            source_division_id = wsc?.division_id ?? null
          }
          if (!source_division_id && ce?.division_id) source_division_id = ce.division_id
        }
      }

      return {
        return_number:        r.return_number ?? null,
        source_type,
        source_number,
        source_division_id,
        source_division_name: div?.name ?? null,
      }
    },
  })

  const { data: subContainers = [], isLoading: subsLoading } = useQuery<SubContainerOption[]>({
    queryKey: ['send-for-repair', 'sub-containers', warehouseId],
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
  const [divisionId, setDivisionId] = useState('')
  const [expectedReturn, setExpectedReturn] = useState<string>(defaultExpectedReturn)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) {
      setVendorId('')
      setDivisionId('')
      setNotes('')
      setExpectedReturn(defaultExpectedReturn())
    }
  }, [open])

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
    const originMatch = sourceCtx?.source_division_id
      ? uniqueDivisions.find((d) => d.division_id === sourceCtx.source_division_id)
      : undefined
    if (originMatch) {
      setDivisionId(originMatch.division_id)
      return
    }
    const returnDivMatch = sourceCtx?.source_division_name
      ? uniqueDivisions.find((d) => d.division_name === sourceCtx.source_division_name)
      : undefined
    if (returnDivMatch) {
      setDivisionId(returnDivMatch.division_id)
      return
    }
    const activeMatch = uniqueDivisions.find((d) => d.division_id === activeDivisionId)
    if (activeMatch) setDivisionId(activeMatch.division_id)
  }, [
    open, divisionId, uniqueDivisions, activeDivisionId,
    sourceCtx?.source_division_id, sourceCtx?.source_division_name,
  ])

  const singleDivision = uniqueDivisions.length === 1
  const needsDivisionPick = uniqueDivisions.length > 1
  const selectedSub = useMemo(
    () => (divisionId ? subContainers.find((s) => s.division_id === divisionId) ?? null : null),
    [divisionId, subContainers],
  )

  const canSubmit =
    !!vendorId &&
    !!expectedReturn &&
    !!dispositionId &&
    !!warehouseId &&
    (uniqueDivisions.length === 0 || !!divisionId)

  // Dirty check: prompt only if the operator has clearly typed something.
  // Vendor / division are auto-set for the single-option case; treat as
  // manual input only when there are choices AND user picked something.
  const isDirty =
    notes.trim().length > 0 ||
    expectedReturn !== defaultExpectedReturn() ||
    (!singleVendor && vendors.length > 0 && vendorId !== '') ||
    (!singleDivision && uniqueDivisions.length > 0 && divisionId !== '')

  function handleSubmit() {
    send.mutate(
      {
        dispositionId,
        repairVendorId: vendorId,
        warehouseId,
        expectedReturnDate: expectedReturn,
        notes: notes.trim() || null,
        sourceDivisionId: divisionId || null,
        returnId,
      },
      {
        onSuccess: () => {
          toast.success('Sent for repair — transfer created')
          guardRef.current?.closeAfterSubmit()
          onComplete?.()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:rounded-lg p-0 gap-0 flex flex-col sm:max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-600" />
              Send for Repair
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {itemName && <div className="break-words">{itemName}{qty ? ` — ${qty} unit${qty === 1 ? '' : 's'}` : ''}</div>}
              {warehouseName && (
                <div>
                  From: <span className="text-foreground">{warehouseName}</span>
                  {selectedSub && (
                    <span className="text-muted-foreground"> → <span className="text-foreground">{selectedSub.name}</span></span>
                  )}
                </div>
              )}
              {sourceCtx?.return_number && (
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    Return {sourceCtx.return_number}
                  </span>
                  {sourceCtx.source_number && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {sourceCtx.source_type === 'sale_order' ? 'SO' : 'PO'} {sourceCtx.source_number}
                    </span>
                  )}
                  {sourceCtx.source_division_name && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      {sourceCtx.source_division_name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="sfr-vendor">Repair Vendor *</Label>
            <Select
              value={vendorId}
              onValueChange={(v) => v && setVendorId(v)}
              disabled={vendorsLoading || vendors.length === 0}
            >
              <SelectTrigger id="sfr-vendor" className="w-full h-10">
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
              <Label htmlFor="sfr-division">
                Source Division {needsDivisionPick ? '*' : ''}
              </Label>
              <Select
                value={divisionId}
                onValueChange={(v) => v && setDivisionId(v)}
                disabled={subsLoading || singleDivision}
              >
                <SelectTrigger id="sfr-division" className="w-full h-10">
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
            <Label htmlFor="sfr-date">Expected Return Date *</Label>
            <Input
              id="sfr-date"
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sfr-notes">Notes</Label>
            <Textarea
              id="sfr-notes"
              rows={3}
              className="resize-none"
              placeholder="Damage description, quoted repair cost, contact person…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-5 gap-3 sm:justify-end sm:space-x-0">
          <Button variant="outline" size="lg" onClick={() => guardRef.current?.requestClose()} disabled={send.isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={!canSubmit || send.isPending}>
            {send.isPending ? 'Sending...' : 'Send for Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
