'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useResolveRepair } from '@/hooks/useToolRepair'

/** Confirm + scrap a unit under repair: retire + post cost to the P&L Scrap line. */
export function ScrapToolDialog({ unit, onClose }: { unit: { id: string; label: string }; onClose: () => void }) {
  const [notes, setNotes] = useState('')
  const scrap = useResolveRepair()

  async function handleScrap() {
    try {
      await scrap.mutateAsync({ unitId: unit.id, outcome: 'scrap', notes: notes.trim() || undefined })
      toast.success(`Scrapped ${unit.label}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scrap tool')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">Scrap {unit.label}</DialogTitle>
          <DialogDescription>
            Retires this unit permanently and posts its cost to the P&amp;L “Scrap &amp; Defective” line
            (from its receival cost — zero if no cost is on record). This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Reason / condition on scrap…"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleScrap} disabled={scrap.isPending}>
            {scrap.isPending ? 'Scrapping…' : 'Scrap unit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
