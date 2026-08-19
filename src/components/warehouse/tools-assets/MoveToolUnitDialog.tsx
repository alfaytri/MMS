'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useMoveToolUnit, useTeamsWithToolCounts } from '@/hooks/useToolAssignments'

export function MoveToolUnitDialog({
  unit, fromTeamId, divisionId, onClose,
}: {
  unit: { id: string; label: string }
  fromTeamId: string
  divisionId: string
  onClose: () => void
}) {
  // Destination teams: same division only (the tool's division never changes on a move).
  const { data: teams = [] } = useTeamsWithToolCounts([divisionId])
  const options = useMemo(() => teams.filter((t) => t.team_id !== fromTeamId), [teams, fromTeamId])
  const [toTeam, setToTeam] = useState('')
  const move = useMoveToolUnit()

  // Pre-select + lock when exactly one destination exists (don't make the user pick the only choice).
  useEffect(() => {
    if (options.length === 1) setToTeam(options[0].team_id)
  }, [options])

  async function handleMove() {
    try {
      await move.mutateAsync({ unitId: unit.id, toTeamId: toTeam })
      toast.success('Tool moved')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move tool')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Move {unit.label}</DialogTitle>
          <DialogDescription>
            Move to another team in the same division. The tool’s owning division does not change.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2">
          <label className="text-sm font-medium">Destination team</label>
          <Select value={toTeam} onValueChange={(v) => setToTeam(v ?? '')} disabled={options.length <= 1}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Select team…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t.team_id} value={t.team_id}>{t.team_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground">No other team in this division to move to.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleMove} disabled={!toTeam || move.isPending}>
            {move.isPending ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
