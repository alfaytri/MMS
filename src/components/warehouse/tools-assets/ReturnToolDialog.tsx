'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useReturnToolUnit } from '@/hooks/useToolAssignments'
import { useReturnDestinations } from '@/hooks/useReturnDestinations'

/**
 * Return a tool from a team to a store. The chosen store is stamped on the custody
 * history so "where did it go" is always answerable.
 */
export function ReturnToolDialog({ unit, onClose }: { unit: { id: string; label: string }; onClose: () => void }) {
  const { data: stores = [], isLoading } = useReturnDestinations()
  const [toStore, setToStore] = useState('')
  const [notes, setNotes] = useState('')
  const ret = useReturnToolUnit()

  // Pre-select + lock when exactly one store exists.
  useEffect(() => {
    if (stores.length === 1) setToStore(stores[0].id)
  }, [stores])

  async function handleReturn() {
    try {
      await ret.mutateAsync({ unitId: unit.id, toLocationId: toStore, notes: notes.trim() || undefined })
      toast.success(`Returned ${unit.label}`)
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
            <Undo2 className="h-4 w-4 shrink-0" /> Return {unit.label}
          </DialogTitle>
          <DialogDescription>
            Take this tool back from the team and store it. Choose where it goes — it’s recorded in
            the tool’s history.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
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
            {!isLoading && stores.length === 0 && (
              <p className="text-xs text-muted-foreground">No store warehouse is set up to return tools to.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Condition on return…"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReturn} disabled={!toStore || ret.isPending}>
            {ret.isPending ? 'Returning…' : 'Return to store'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
