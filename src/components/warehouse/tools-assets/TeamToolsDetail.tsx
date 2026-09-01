'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRightLeft, ChevronDown, ChevronRight, MoreVertical, Plus, Undo2, Wrench } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTeamToolUnitsV2, type TeamToolUnitV2 } from '@/hooks/useToolInspections'
import { useToolUnitItemMeta } from '@/hooks/useToolUnitCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { useSetToolLifecycle, type ToolLifecycle } from '@/hooks/useToolAssignments'
import { ToolLifecycleBadge } from './ToolBadges'
import { MoveToolUnitDialog } from './MoveToolUnitDialog'
import { AssignToolUnitDialog } from './AssignToolUnitDialog'
import { SendToRepairDialog } from './SendToRepairDialog'
import { ReturnToolDialog } from './ReturnToolDialog'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

type TeamRef = { id: string; name: string; divisionId: string; divisionName: string | null }
type UnitRef = { id: string; label: string }

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function unitLabel(u: TeamToolUnitV2): string {
  return `${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}`
}

export function TeamToolsDetail({ team, onBack }: { team: TeamRef; onBack: () => void }) {
  const { data: units = [], isLoading, error } = useTeamToolUnitsV2(team.id)
  const [moveUnit, setMoveUnit] = useState<UnitRef | null>(null)
  const [returnUnit, setReturnUnit] = useState<UnitRef | null>(null)
  const [repairUnit, setRepairUnit] = useState<UnitRef | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const setType = useSetToolLifecycle()
  // Category breadcrumb above each item group. Every unit in a group shares the
  // same item → same category, so the group's first unit resolves it.
  const unitMeta = useToolUnitItemMeta(units.map((u) => u.unit_id))

  async function setLifecycle(unitId: string, t: ToolLifecycle, label: string) {
    try {
      await setType.mutateAsync({ unitId, lifecycleType: t })
      toast.success(`${label}: ${t.charAt(0).toUpperCase()}${t.slice(1)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set type')
    }
  }

  // Tree: group the team's tools by item (mirrors the assign picker's item level).
  // A tool sent for repair LEAVES the team (custody cleared), so it never appears
  // here — it lives in the Repair tab until it comes back or is scrapped.
  const groups = useMemo(() => {
    const map = new Map<string, TeamToolUnitV2[]>()
    for (const u of units) {
      const key = u.item_name ?? 'Unknown item'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    for (const list of map.values()) list.sort((a, b) => COLLATOR.compare(a.serial_number ?? '', b.serial_number ?? ''))
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [units])

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
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
          No tools with this team yet. Use “Assign tool” to give this team a tool.
        </div>
      ) : (
        <div className="space-y-4">
          {/* In-service tree, grouped by item */}
          {groups.length > 0 && (
            <div className="rounded-lg border divide-y">
              {groups.map(([itemName, list]) => {
                const isCollapsed = collapsed.has(itemName)
                return (
                  <div key={itemName}>
                    <button
                      type="button"
                      onClick={() => toggle(itemName)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <ItemLabel
                        className="flex-1"
                        meta={unitMeta.get(list[0].unit_id)}
                        name={<span className="block truncate" title={itemName}>{itemName}</span>}
                        nameClassName="font-medium text-sm min-w-0"
                      />
                      <Badge variant="secondary" className="shrink-0 text-[10px] h-5 px-1.5 font-normal">{list.length}</Badge>
                    </button>

                    {!isCollapsed && (
                      <ul className="divide-y border-t bg-muted/20">
                        {list.map((u, i) => (
                          <li key={u.unit_id} className={cn('flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3', STAGGER_IN)} style={staggerDelay(i)}>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-mono text-xs shrink-0">{u.serial_number ?? '—'}</span>
                              <ToolLifecycleBadge type={u.lifecycle_type} />
                              <span className="text-xs text-muted-foreground">· {u.condition}</span>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                · assigned {u.assigned_at ? new Date(u.assigned_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-11 sm:h-8 gap-1 text-xs" onClick={() => setMoveUnit({ id: u.unit_id, label: unitLabel(u) })}>
                                <ArrowRightLeft className="h-3.5 w-3.5" /> Move
                              </Button>
                              <Button variant="ghost" size="sm" className="h-11 sm:h-8 gap-1 text-xs" onClick={() => setReturnUnit({ id: u.unit_id, label: unitLabel(u) })}>
                                <Undo2 className="h-3.5 w-3.5" /> Return
                              </Button>
                              <Button variant="ghost" size="sm" className="h-11 sm:h-8 gap-1 text-xs text-amber-700 hover:text-amber-700" onClick={() => setRepairUnit({ id: u.unit_id, label: unitLabel(u) })}>
                                <Wrench className="h-3.5 w-3.5" /> Repair
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  aria-label="More actions"
                                  className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-11 w-11 sm:h-8 sm:w-8 p-0 shrink-0' })}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuGroup>
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Set type (manual override)</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup value={u.lifecycle_type} onValueChange={(v) => setLifecycle(u.unit_id, v as ToolLifecycle, unitLabel(u))}>
                                      <DropdownMenuRadioItem value="new">New</DropdownMenuRadioItem>
                                      <DropdownMenuRadioItem value="used">Used</DropdownMenuRadioItem>
                                      <DropdownMenuRadioItem value="repaired">Repaired</DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                  </DropdownMenuGroup>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}

      {moveUnit && (
        <MoveToolUnitDialog unit={moveUnit} fromTeamId={team.id} divisionId={team.divisionId} onClose={() => setMoveUnit(null)} />
      )}
      {returnUnit && <ReturnToolDialog unit={returnUnit} onClose={() => setReturnUnit(null)} />}
      {repairUnit && <SendToRepairDialog unit={repairUnit} onClose={() => setRepairUnit(null)} />}
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
