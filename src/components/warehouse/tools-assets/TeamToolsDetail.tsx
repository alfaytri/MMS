'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRightLeft, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useReturnToolUnit } from '@/hooks/useToolAssignments'
import { useTeamToolUnitsV2 } from '@/hooks/useToolInspections'
import { InspectionVerdictButtons } from './InspectionVerdictButtons'
import { MoveToolUnitDialog } from './MoveToolUnitDialog'
import { AssignToolUnitDialog } from './AssignToolUnitDialog'

type TeamRef = { id: string; name: string; divisionId: string; divisionName: string | null }

// Human-readable status (not the raw enum). "Under repair" is amber so a unit
// pulled for repair reads clearly (and it also shows in the Repair tab).
const STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned:    { label: 'In service',   cls: 'border-border text-foreground' },
  available:   { label: 'Available',    cls: 'border-border text-muted-foreground' },
  maintenance: { label: 'Under repair', cls: 'border-amber-500/40 text-amber-700 bg-amber-500/10' },
  retired:     { label: 'Retired',      cls: 'border-border text-muted-foreground' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'border-border text-muted-foreground' }
  return <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-normal ${m.cls}`}>{m.label}</Badge>
}

export function TeamToolsDetail({ team, onBack }: { team: TeamRef; onBack: () => void }) {
  const { data: units = [], isLoading, error } = useTeamToolUnitsV2(team.id)
  const returnUnit = useReturnToolUnit()
  const [moveUnit, setMoveUnit] = useState<{ id: string; label: string } | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)

  async function handleReturn(unitId: string, label: string) {
    try {
      await returnUnit.mutateAsync({ unitId })
      toast.success(`Returned ${label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to return tool')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="h-8 gap-1 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Teams
          </Button>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{team.name}</div>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
              {team.divisionName ?? 'Unassigned'}
            </Badge>
          </div>
        </div>
        <Button size="sm" className="h-9 gap-1 shrink-0" onClick={() => setAssignOpen(true)}>
          <Plus className="h-4 w-4" /> Assign tool
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : units.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No tools assigned to this team yet. Use “Assign tool” to give this team a tool.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Item</th>
                <th className="p-2 font-medium">Serial</th>
                <th className="p-2 font-medium hidden lg:table-cell">Brand</th>
                <th className="p-2 font-medium">Condition</th>
                <th className="p-2 font-medium hidden sm:table-cell">Status</th>
                <th className="p-2 font-medium hidden md:table-cell">Checked</th>
                <th className="p-2 font-medium">Condition check</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const label = `${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}`
                return (
                  <tr key={u.unit_id} className="border-b last:border-0 align-top">
                    <td className="p-2 min-w-0">{u.item_name ?? '—'}</td>
                    <td className="p-2 font-mono text-xs">{u.serial_number ?? '—'}</td>
                    <td className="p-2 hidden lg:table-cell">{u.brand ?? '—'}</td>
                    <td className="p-2">{u.condition}</td>
                    <td className="p-2 hidden sm:table-cell"><StatusBadge status={u.status} /></td>
                    <td className="p-2 hidden md:table-cell whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">
                        {u.last_inspected_at ? new Date(u.last_inspected_at).toLocaleDateString() : 'Never'}
                      </span>
                      {u.inspection_due && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 bg-amber-500/10">Due</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      <InspectionVerdictButtons unitId={u.unit_id} label={label} />
                    </td>
                    <td className="p-2 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => setMoveUnit({ id: u.unit_id, label })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Move
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => handleReturn(u.unit_id, label)}
                        disabled={returnUnit.isPending}
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Return
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {moveUnit && (
        <MoveToolUnitDialog
          unit={moveUnit}
          fromTeamId={team.id}
          divisionId={team.divisionId}
          onClose={() => setMoveUnit(null)}
        />
      )}
      <AssignToolUnitDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        teamId={team.id}
        teamName={team.name}
        divisionId={team.divisionId}
      />
    </div>
  )
}
