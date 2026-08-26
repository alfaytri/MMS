'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PackageCheck } from 'lucide-react'
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
import { useReturnFromRepair } from '@/hooks/useDamagedStockOverview'

type Outcome = 'good' | 'writeoff' | 'mixed'

interface ReturnFromRepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transferId: string
  transferNumber: string
  itemName?: string | null
  sku?: string | null
  qty: number
  unitCost?: number | null
  warehouseName?: string | null
  vendorName?: string | null
  onComplete?: () => void
}

/**
 * Phase 9.7 — Close a damaged_repair_out transfer with a good/writeoff split.
 */
export function ReturnFromRepairDialog({
  open, onOpenChange, transferId, transferNumber,
  itemName, sku, qty, warehouseName, vendorName, onComplete,
}: ReturnFromRepairDialogProps) {
  const returnMut = useReturnFromRepair()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const [outcome, setOutcome]         = useState<Outcome | ''>('')
  const [qtyGoodStr, setQtyGoodStr]   = useState('')
  const [qtyWoStr, setQtyWoStr]       = useState('')
  const [notes, setNotes]             = useState('')

  // Reset on close
  useEffect(() => {
    if (!open) {
      setOutcome('')
      setQtyGoodStr('')
      setQtyWoStr('')
      setNotes('')
    }
  }, [open])

  // Auto-fill qty fields when outcome changes
  useEffect(() => {
    if (outcome === 'good') {
      setQtyGoodStr(String(qty))
      setQtyWoStr('0')
    } else if (outcome === 'writeoff') {
      setQtyGoodStr('0')
      setQtyWoStr(String(qty))
    } else if (outcome === 'mixed') {
      setQtyGoodStr('')
      setQtyWoStr('')
    }
  }, [outcome, qty])

  const qtyGoodNum = Number(qtyGoodStr || 0)
  const qtyWoNum   = Number(qtyWoStr   || 0)

  const sumMatches = qtyGoodNum + qtyWoNum === qty
  const validNumbers =
    Number.isFinite(qtyGoodNum) && qtyGoodNum >= 0 &&
    Number.isFinite(qtyWoNum)   && qtyWoNum   >= 0

  const canSubmit = !!outcome && sumMatches && validNumbers && !returnMut.isPending

  // Dirty: any user-picked value differs from the "just opened" state.
  // qtyGoodStr/qtyWoStr autofill from outcome, so tracking outcome + notes +
  // repairCost is sufficient — outcome !== '' implies the operator picked one.
  const isDirty =
    outcome !== '' ||
    notes.trim().length > 0

  const successCopy = useMemo(() => {
    if (outcome === 'good')     return `Return recorded — ${qtyGoodNum} unit${qtyGoodNum === 1 ? '' : 's'} back to stock`
    if (outcome === 'writeoff') return `Return recorded — ${qtyWoNum} unit${qtyWoNum === 1 ? '' : 's'} written off`
    return `Return recorded — ${qtyGoodNum} good / ${qtyWoNum} write-off`
  }, [outcome, qtyGoodNum, qtyWoNum])

  function handleSubmit() {
    if (!outcome) return
    returnMut.mutate(
      {
        transferId,
        outcome,
        qtyGood: qtyGoodNum,
        qtyWriteoff: qtyWoNum,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(successCopy)
          guardRef.current?.closeAfterSubmit()
          onComplete?.()
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      },
    )
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg p-0 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              Return from Repair
            </DialogTitle>
            <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2.5 text-xs space-y-2">
              {itemName && (
                <div className="font-medium text-foreground leading-snug">
                  {itemName}
                  {sku && <span className="ml-1.5 text-muted-foreground font-normal">({sku})</span>}
                </div>
              )}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                <span className="text-[10px] uppercase tracking-wide">Transfer</span>
                <span className="font-mono text-foreground">{transferNumber}</span>

                <span className="text-[10px] uppercase tracking-wide">Sent</span>
                <span className="text-foreground">{qty} unit{qty === 1 ? '' : 's'}</span>

                {vendorName && (
                  <>
                    <span className="text-[10px] uppercase tracking-wide">Vendor</span>
                    <span className="text-foreground truncate">{vendorName}</span>
                  </>
                )}

                {warehouseName && (
                  <>
                    <span className="text-[10px] uppercase tracking-wide">Returning to</span>
                    <span className="text-foreground truncate">{warehouseName}</span>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="rfr-outcome">Outcome *</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
              <SelectTrigger id="rfr-outcome" className="w-full h-10">
                <SelectValue placeholder="Select outcome…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good (all units usable)</SelectItem>
                <SelectItem value="writeoff">Writeoff (all units unusable)</SelectItem>
                <SelectItem value="mixed">Mixed (some good, some writeoff)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rfr-good">Qty Good</Label>
              <Input
                id="rfr-good"
                type="number"
                min={0}
                inputMode="numeric"
                value={qtyGoodStr}
                onChange={(e) => setQtyGoodStr(e.target.value)}
                disabled={outcome === 'writeoff'}
                className="w-full h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfr-wo">Qty Writeoff</Label>
              <Input
                id="rfr-wo"
                type="number"
                min={0}
                inputMode="numeric"
                value={qtyWoStr}
                onChange={(e) => setQtyWoStr(e.target.value)}
                disabled={outcome === 'good'}
                className="w-full h-10"
              />
            </div>
          </div>
          {outcome && !sumMatches && (
            <p className="text-[11px] text-red-600 dark:text-red-400 -mt-3">
              Must sum to {qty}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="rfr-notes">Notes</Label>
            <Textarea
              id="rfr-notes"
              rows={3}
              className="resize-none"
              placeholder="Repair summary, invoice ref, condition of returned units…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={returnMut.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {returnMut.isPending ? 'Recording…' : 'Record Return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
