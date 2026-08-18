'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAssignableToolUnits, useAssignToolUnit } from '@/hooks/useToolAssignments'

export function AssignToolUnitDialog({
  open, onClose, teamId, teamName, divisionId,
}: {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  divisionId: string
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  // Available tools in this division OR not yet tied to a division (established on assign).
  const { data: units = [], isLoading } = useAssignableToolUnits(open ? divisionId : null, search)
  const assign = useAssignToolUnit()

  function handleClose() {
    setSearch('')
    setSelected('')
    onClose()
  }

  async function handleAssign() {
    try {
      await assign.mutateAsync({ unitId: selected, teamId })
      toast.success(`Assigned to ${teamName}`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign tool')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg rounded-none sm:rounded-lg flex flex-col gap-0">
        <DialogHeader>
          <DialogTitle className="truncate">Assign a tool to {teamName}</DialogTitle>
          <DialogDescription>
            Pick an available tool. Tools not yet tied to a division will join this team’s division.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col py-3 space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial number or item name…"
            className="h-10"
          />
          <div className="flex-1 min-h-[12rem] max-h-[50vh] overflow-y-auto rounded-md border divide-y">
            {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && units.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                No available tools{search ? ' match your search' : ' in this division'}.
              </p>
            )}
            {units.map((u) => (
              <button
                key={u.unit_id}
                type="button"
                onClick={() => setSelected(u.unit_id)}
                className={`w-full text-left p-2.5 flex items-center justify-between gap-2 hover:bg-accent ${selected === u.unit_id ? 'bg-accent' : ''}`}
              >
                <span className="min-w-0 truncate">
                  {u.item_name ?? 'Tool'}{' '}
                  <span className="font-mono text-xs text-muted-foreground">{u.serial_number}</span>
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">{u.condition}</span>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-background pt-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!selected || assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
