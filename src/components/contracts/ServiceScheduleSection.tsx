'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, DragEndEvent, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useContractSchedule } from '@/hooks/useContractSchedule'
import { useTeams } from '@/hooks/useTeams'
import { toast } from 'sonner'
import type { ScheduleService } from '@/types/contracts'

interface Props {
  contractId: string
  divisions: string[]
}

const HOURS = Array.from({ length: 12 }, (_, i) => 7 + i) // 07:00 … 18:00
const GRID_END = 19 // one past the last column (18:00 block can run to 19:00)

const hourOf = (t: string | null, fallback: number) => (t ? parseInt(t.slice(0, 2), 10) : fallback)
const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`

// ── draggable chip (unassigned pool) ────────────────────────────────────────
function DraggableChip({ service }: { service: ScheduleService }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: service.visitId, data: service })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 cursor-grab',
        isDragging && 'opacity-50',
      )}
    >
      {service.serviceName}
      {service.qty > 1 && <span className="font-semibold">×{service.qty}</span>}
      {service.location && <span className="text-blue-500">({service.location})</span>}
    </div>
  )
}

// ── droppable empty hour cell ───────────────────────────────────────────────
function DroppableCell({ teamId, hour }: { teamId: string; hour: number }) {
  const { isOver, setNodeRef } = useDroppable({ id: `${teamId}_${hour}`, data: { teamId, hour } })
  return <td ref={setNodeRef} className={cn('border p-0.5 h-11 align-top', isOver && 'bg-blue-50')} />
}

// ── a placed visit rendered as a block (draggable to move, click to edit) ────
function VisitBlock({ svc, onEdit }: { svc: ScheduleService; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: svc.visitId, data: svc })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onEdit}
      className={cn(
        'h-full w-full cursor-pointer rounded-md border border-primary/30 bg-primary/10 px-1.5 py-1 text-left transition-colors hover:bg-primary/20',
        isDragging && 'opacity-50',
      )}
    >
      <div className="truncate text-[11px] font-semibold leading-tight text-primary">
        {svc.serviceName}{svc.qty > 1 && ` ×${svc.qty}`}
      </div>
      <div className="text-[10px] text-muted-foreground">{svc.startTime}–{svc.endTime}</div>
    </div>
  )
}

export function ServiceScheduleSection({ contractId, divisions }: Props) {
  const { scheduleDates, isLoading, scheduleVisit, clearSchedule } = useContractSchedule(contractId)
  const { data: teamsData } = useTeams()

  const [selectedDateIdx, setSelectedDateIdx] = useState(0)
  const [editVisit, setEditVisit] = useState<ScheduleService | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const selectedDate = scheduleDates[selectedDateIdx] || null
  const unassigned = selectedDate?.services.filter((s) => !s.teamId || !s.startTime) || []
  const assigned = selectedDate?.services.filter((s) => s.teamId && s.startTime) || []

  const divisionTeams = useMemo(() => {
    const t = teamsData ?? []
    if (!Array.isArray(t)) return []
    return t.filter((tm) => divisions.some((d) => tm.division?.slug === d))
  }, [teamsData, divisions])

  const durationOf = (s: ScheduleService) => {
    const start = hourOf(s.startTime, 8)
    const end = hourOf(s.endTime, start + s.defaultDurationHours)
    return Math.max(1, end - start)
  }

  function place(svc: ScheduleService, teamId: string, startHour: number, durHours: number) {
    const endHour = Math.min(startHour + Math.max(1, durHours), 23)
    scheduleVisit.mutate(
      { visitId: svc.visitId, teamId, startTime: fmt(startHour), endTime: fmt(endHour) },
      {
        onSuccess: () => toast.success('Visit scheduled'),
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
      },
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const svc = event.active.data.current as ScheduleService | undefined
    const drop = event.over?.data.current as { teamId: string; hour: number } | undefined
    if (!svc || !drop) return
    // Keep an already-placed block's length; a fresh chip uses the service default.
    const dur = svc.startTime ? durationOf(svc) : svc.defaultDurationHours
    place(svc, drop.teamId, drop.hour, dur)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (scheduleDates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No visits to schedule. Generate visits from the contract detail page first.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      {/* Left: date list */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Schedule Dates</h4>
        <div className="max-h-[420px] space-y-1 overflow-y-auto">
          {scheduleDates.map((sd, idx) => (
            <button
              key={sd.date}
              onClick={() => setSelectedDateIdx(idx)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                idx === selectedDateIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <span>{sd.date}</span>
              <div className="flex items-center gap-1">
                <span className={cn('inline-block h-2 w-2 rounded-full', sd.allAssigned ? 'bg-green-500' : 'bg-yellow-500')} />
                <span className="text-xs">{sd.services.length}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> All placed (team + time)</div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> Some still unplaced</div>
        </div>
      </div>

      {/* Right: schedule grid */}
      <div className="space-y-4">
        {selectedDate && (
          <>
            <h4 className="text-sm font-semibold">
              {selectedDate.date} — {selectedDate.services.length} service(s), {assigned.length} placed
            </h4>

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {/* Unassigned pool */}
              {unassigned.length > 0 && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Unassigned ({unassigned.length}) — drag onto a team &amp; time
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((svc) => <DraggableChip key={svc.visitId} service={svc} />)}
                  </div>

                  {/* Mobile: tap a team to place the first unassigned at 08:00 */}
                  <div className="space-y-2 border-t pt-2 lg:hidden">
                    <p className="text-xs text-muted-foreground">Tap a team to place the first unassigned (08:00):</p>
                    <div className="flex flex-wrap gap-2">
                      {divisionTeams.map((team) => (
                        <Button
                          key={team.id} variant="outline" size="sm"
                          onClick={() => { if (unassigned[0]) place(unassigned[0], team.id, 8, unassigned[0].defaultDurationHours) }}
                        >
                          {team.name_en}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Team × Hour grid (desktop) */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="w-28 border bg-muted p-2 text-left">Team</th>
                      {HOURS.map((h) => (
                        <th key={h} className="border bg-muted p-1 text-center font-medium">{h}:00</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divisionTeams.map((team) => {
                      const teamSvcs = assigned.filter((s) => s.teamId === team.id)
                      const cells: ReactNode[] = []
                      let h = 7
                      while (h <= 18) {
                        const svc = teamSvcs.find((s) => hourOf(s.startTime, -1) === h)
                        if (svc) {
                          const span = Math.max(1, Math.min(durationOf(svc), GRID_END - h))
                          cells.push(
                            <td key={h} colSpan={span} className="h-11 border p-0.5 align-top">
                              <VisitBlock svc={svc} onEdit={() => setEditVisit(svc)} />
                            </td>,
                          )
                          h += span
                        } else {
                          cells.push(<DroppableCell key={h} teamId={team.id} hour={h} />)
                          h += 1
                        }
                      }
                      return (
                        <tr key={team.id}>
                          <td className="border p-2 font-medium">{team.name_en}</td>
                          {cells}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {divisionTeams.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No teams in this contract&apos;s division(s).</p>
                )}
              </div>
            </DndContext>
          </>
        )}
      </div>

      <EditTimeDialog
        svc={editVisit}
        onClose={() => setEditVisit(null)}
        saving={scheduleVisit.isPending}
        onSave={(from, to) => {
          if (!editVisit?.teamId) return
          scheduleVisit.mutate(
            { visitId: editVisit.visitId, teamId: editVisit.teamId, startTime: fmt(from), endTime: fmt(to) },
            {
              onSuccess: () => { toast.success('Time updated'); setEditVisit(null) },
              onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
            },
          )
        }}
        onRemove={() => {
          if (!editVisit) return
          clearSchedule.mutate(editVisit.visitId, {
            onSuccess: () => { toast.success('Removed from schedule'); setEditVisit(null) },
            onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
          })
        }}
      />
    </div>
  )
}

// ── from→to editor ───────────────────────────────────────────────────────────
function EditTimeDialog({
  svc, onClose, onSave, onRemove, saving,
}: {
  svc: ScheduleService | null
  onClose: () => void
  onSave: (fromHour: number, toHour: number) => void
  onRemove: () => void
  saving: boolean
}) {
  const initialFrom = hourOf(svc?.startTime ?? null, 8)
  const initialTo = hourOf(svc?.endTime ?? null, initialFrom + (svc?.defaultDurationHours ?? 2))
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  // Re-seed when a different block is opened.
  const key = svc?.visitId ?? ''
  const [seededFor, setSeededFor] = useState('')
  if (svc && key !== seededFor) {
    setSeededFor(key); setFrom(initialFrom); setTo(initialTo)
  }

  const startOptions = Array.from({ length: 12 }, (_, i) => 7 + i)          // 7..18
  const endOptions = Array.from({ length: 19 - (from + 1) + 1 }, (_, i) => from + 1 + i) // from+1..19

  return (
    <Dialog open={!!svc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 leading-snug">
            {svc?.serviceName}{svc && svc.qty > 1 ? ` ×${svc.qty}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={String(from)} onValueChange={(v) => { const n = Number(v); setFrom(n); if (to <= n) setTo(Math.min(n + 1, 19)) }}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {startOptions.map((h) => <SelectItem key={h} value={String(h)}>{fmt(h)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Select value={String(to)} onValueChange={(v) => setTo(Number(v))}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {endOptions.map((h) => <SelectItem key={h} value={String(h)}>{fmt(h)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="mr-1 h-4 w-4" /> Remove from schedule
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(from, to)} disabled={saving || to <= from}>
              {saving ? 'Saving…' : 'Save time'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
