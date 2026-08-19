'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PackageCheck } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useReturnToolFromRepair, type ReturnOutcome } from '@/hooks/useToolRepair'
import { useReturnDestinations } from '@/hooks/useReturnDestinations'

/**
 * Close a tool's repair: Usable → back to a store (Repaired); Writeoff → retire +
 * post its cost to the P&L "Scrap & Defective" line. Repair is never charged.
 */
export function ReturnToolFromRepairDialog({ transfer, onClose }: { transfer: { id: string; label: string }; onClose: () => void }) {
  const { data: stores = [], isLoading } = useReturnDestinations()
  const [outcome, setOutcome] = useState<ReturnOutcome | ''>('')
  const [toStore, setToStore] = useState('')
  const [notes, setNotes] = useState('')
  const ret = useReturnToolFromRepair()

  useEffect(() => { if (stores.length === 1) setToStore(stores[0].id) }, [stores])

  const needsStore = outcome === 'usable'
  const canSubmit = !!outcome && (!needsStore || !!toStore) && !ret.isPending

  async function handleReturn() {
    if (!outcome) return
    try {
      await ret.mutateAsync({
        transferId: transfer.id,
        outcome,
        toLocationId: needsStore ? toStore : undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(outcome === 'usable' ? `${transfer.label} back in service` : `${transfer.label} written off`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to return tool')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 shrink-0 text-emerald-600" /> Return {transfer.label}
          </DialogTitle>
          <DialogDescription>
            Did the vendor fix it? Repair is never charged — only the outcome matters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Outcome</label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as ReturnOutcome)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Select outcome…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usable">Usable — back to a store (Repaired)</SelectItem>
                <SelectItem value="writeoff">Write-off — beyond repair (retire + scrap)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsStore && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Return to store</label>
              <Select value={toStore} onValueChange={(v) => setToStore(v ?? '')} disabled={isLoading || stores.length <= 1}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={isLoading ? 'Loading…' : 'Select store…'} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Repair summary, condition…"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={outcome === 'writeoff' ? 'destructive' : 'default'}
            onClick={handleReturn}
            disabled={!canSubmit}
          >
            {ret.isPending ? 'Recording…' : outcome === 'writeoff' ? 'Write off' : 'Return to service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
