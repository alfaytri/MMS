'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSendToolToRepairBucket } from '@/hooks/useToolRepair'

/**
 * Collect a team's tool for repair. Confirms the operator has physically taken
 * the tool from the team, then moves it into the Repair bucket (awaiting vendor).
 */
export function SendToRepairDialog({ unit, onClose }: { unit: { id: string; label: string }; onClose: () => void }) {
  const [notes, setNotes] = useState('')
  const send = useSendToolToRepairBucket()

  async function handleSend() {
    try {
      await send.mutateAsync({ unitId: unit.id, notes: notes.trim() || undefined })
      toast.success(`${unit.label} → Repair bucket`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send to repair')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 shrink-0 text-amber-600" /> Send {unit.label} for repair
          </DialogTitle>
          <DialogDescription>
            Have you collected this tool from the team? It leaves the team’s active tools and moves
            to the <strong>Repair</strong> bucket, where you can send it to a vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What’s wrong with it…"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Yes, collected — send to repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
