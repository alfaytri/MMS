'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { XCircle } from 'lucide-react'
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
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useRequestDamagedWriteoff } from '@/hooks/useRequestDamagedWriteoff'

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
 * Phase F — Write off damaged stock from the On-hand tab. Creates a
 * pending-approval stock_adjustments row via rpc_request_damaged_writeoff.
 */
export function WriteOffDamagedStockDialog({
  open, onOpenChange, warehouseId, warehouseName, brandVariantId, itemName, sku, onHandQty, onComplete,
}: Props) {
  const { data: profile } = useCurrentUserProfile()
  const { activeDivisionId } = useActiveDivision()
  const request = useRequestDamagedWriteoff()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: subContainers = [], isLoading: subsLoading } = useQuery<SubContainerOption[]>({
    queryKey: ['writeoff-damaged', 'sub-containers', warehouseId],
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

  const [qty, setQty] = useState<number>(onHandQty)
  const [subContainerId, setSubContainerId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) {
      setQty(onHandQty)
      setSubContainerId('')
      setReason('')
      setNotes('')
    } else {
      setQty(onHandQty)
    }
  }, [open, onHandQty])

  const singleSub = subContainers.length === 1
  useEffect(() => {
    if (!open || subContainerId || subContainers.length === 0) return
    if (singleSub) {
      setSubContainerId(subContainers[0].id)
      return
    }
    const activeMatch = subContainers.find((s) => s.division_id === activeDivisionId)
    if (activeMatch) setSubContainerId(activeMatch.id)
  }, [open, subContainerId, subContainers, singleSub, activeDivisionId])

  const selectedSub = useMemo(
    () => subContainers.find((s) => s.id === subContainerId) ?? null,
    [subContainers, subContainerId],
  )

  const canSubmit =
    !!warehouseId &&
    !!brandVariantId &&
    qty > 0 &&
    qty <= onHandQty &&
    !!subContainerId &&
    reason.trim().length > 0 &&
    !!profile?.id &&
    !request.isPending

  const isDirty =
    reason.trim().length > 0 ||
    notes.trim().length > 0 ||
    qty !== onHandQty ||
    (!singleSub && subContainers.length > 0 && subContainerId !== '' &&
      subContainers.find((s) => s.id === subContainerId)?.division_id !== activeDivisionId)

  function handleSubmit() {
    if (!profile?.id) {
      toast.error('Cannot resolve current user profile')
      return
    }
    request.mutate(
      {
        warehouseId,
        brandVariantId,
        qty,
        subContainerId,
        reason: reason.trim(),
        notes: notes.trim() || null,
        requestedBy: profile.id,
        requestedByName: profile.full_name ?? 'Unknown',
      },
      {
        onSuccess: () => {
          toast.success('Writeoff queued for approval')
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
              <XCircle className="h-4 w-4 text-red-600" />
              Write off damaged stock
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
            <Label htmlFor="wof-qty">Qty to write off *</Label>
            <Input
              id="wof-qty"
              type="number"
              min={1}
              max={onHandQty}
              value={qty}
              onChange={(e) => setQty(Math.max(0, Math.min(onHandQty, Number(e.target.value) || 0)))}
              className="w-full h-10"
            />
            <p className="text-[11px] text-muted-foreground">Max {onHandQty}.</p>
          </div>

          {subContainers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="wof-sub">Bookkeeping sub-container *</Label>
              <Select
                value={subContainerId}
                onValueChange={(v) => v && setSubContainerId(v)}
                disabled={subsLoading || singleSub}
              >
                <SelectTrigger id="wof-sub" className="w-full h-10">
                  <SelectValue placeholder={subsLoading ? 'Loading…' : 'Pick sub-container'} />
                </SelectTrigger>
                <SelectContent>
                  {subContainers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.division_name && !s.name.includes(s.division_name) ? ` — ${s.division_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Attributes the writeoff to a division for bookkeeping. Actual damaged pile is per warehouse only.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wof-reason">Reason *</Label>
            <Input
              id="wof-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. unrepairable water damage, expired warranty"
              className="w-full h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wof-notes">Notes</Label>
            <Textarea
              id="wof-notes"
              rows={3}
              className="resize-none"
              placeholder="Optional context for the approver"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-800 dark:text-amber-300">
            This queues a stock adjustment for approval. The damaged pile is consumed only after an approver signs off — the item stays on the On-hand tab until then.
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-5 gap-3 sm:justify-end sm:space-x-0">
          <Button variant="outline" size="lg" onClick={() => guardRef.current?.requestClose()} disabled={request.isPending}>
            Cancel
          </Button>
          <Button size="lg" variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {request.isPending ? 'Queueing…' : 'Queue for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
