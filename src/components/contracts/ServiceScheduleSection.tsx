'use client'

import { useState, useMemo } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Upload, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useContractSchedule } from '@/hooks/useContractSchedule'
import { useTeams } from '@/hooks/useTeams'
import { logActivity } from '@/lib/logActivity'
import { toast } from 'sonner'
import type { ScheduleDate, ScheduleService } from '@/types/contracts'

interface Props {
  contractId: string
  divisions: string[]
}

const HOURS = Array.from({ length: 12 }, (_, i) => 7 + i)

function DraggableChip({ service }: { service: ScheduleService }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: service.visitId,
    data: service,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-grab bg-blue-100 text-blue-800 border border-blue-200',
        isDragging && 'opacity-50',
      )}
    >
      {service.serviceName}
      {service.location && <span className="text-blue-500">({service.location})</span>}
    </div>
  )
}

function DroppableCell({ teamId, hour, children }: {
  teamId: string
  hour: number
  children?: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}_${hour}`,
    data: { teamId, hour },
  })

  return (
    <td
      ref={setNodeRef}
      className={cn(
        'border p-1 min-h-[40px] h-10 align-top',
        isOver && 'bg-blue-50',
      )}
    >
      {children}
    </td>
  )
}

export function ServiceScheduleSection({ contractId, divisions }: Props) {
  const { scheduleDates, isLoading, assignTeam, unassignTeam } = useContractSchedule(contractId)
  const { data: teamsData } = useTeams()
  const teams = (teamsData as any)?.data || teamsData || []

  const [selectedDateIdx, setSelectedDateIdx] = useState(0)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [pushDialogOpen, setPushDialogOpen] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const selectedDate = scheduleDates[selectedDateIdx] || null
  const unassigned = selectedDate?.services.filter((s) => !s.teamId) || []
  const assigned = selectedDate?.services.filter((s) => s.teamId) || []
  const assignedCount = assigned.length
  const totalCount = selectedDate?.services.length || 0

  const divisionTeams = useMemo(() => {
    if (!teams || !Array.isArray(teams)) return []
    return teams.filter((t: any) =>
      divisions.some((d) => t.divisions?.slug === d || t.division_slug === d),
    )
  }, [teams, divisions])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const visitId = active.id as string
    const dropData = over.data.current as { teamId: string; hour: number } | undefined
    if (!dropData) return

    assignTeam.mutate(
      { visitId, teamId: dropData.teamId },
      {
        onSuccess: () => toast.success('Team assigned'),
        onError: (err: any) => toast.error(err.message),
      },
    )
  }

  function handleTapAssign(visitId: string, teamId: string) {
    assignTeam.mutate(
      { visitId, teamId },
      {
        onSuccess: () => toast.success('Team assigned'),
        onError: (err: any) => toast.error(err.message),
      },
    )
  }

  function handlePushToCalendar() {
    if (assignedCount < totalCount) {
      setPushDialogOpen(true)
    } else {
      doPush()
    }
  }

  async function doPush() {
    setPushDialogOpen(false)
    toast.success(`${assignedCount} visit(s) pushed to calendar`)
    await logActivity({
      action: 'visits_pushed_to_calendar',
      module: 'contracts',
      entity_id: contractId,
      details: `${assignedCount} of ${totalCount} visits pushed for ${selectedDate?.date}`,
    })
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
      <p className="text-sm text-muted-foreground py-8 text-center">
        No visits to schedule. Generate visits from the contract detail page first.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Left: date list */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">Schedule Dates</h4>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {scheduleDates.map((sd, idx) => (
            <button
              key={sd.date}
              onClick={() => setSelectedDateIdx(idx)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between',
                idx === selectedDateIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <span>{sd.date}</span>
              <div className="flex items-center gap-1">
                <span className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  sd.allAssigned ? 'bg-green-500' : 'bg-yellow-500',
                )} />
                <span className="text-xs">{sd.services.length}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> All assigned
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> Partially assigned
          </div>
        </div>
      </div>

      {/* Right: DnD grid */}
      <div className="space-y-4">
        {selectedDate && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {selectedDate.date} — {selectedDate.services.length} service(s)
              </h4>
              <Button
                size="sm"
                onClick={handlePushToCalendar}
                disabled={assignedCount === 0}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Push {assignedCount} of {totalCount} to Calendar
              </Button>
            </div>

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {/* Unassigned pool */}
              {unassigned.length > 0 && (
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Unassigned ({unassigned.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((svc) => (
                      <DraggableChip key={svc.visitId} service={svc} />
                    ))}
                  </div>

                  {/* Mobile: tap-to-assign buttons */}
                  <div className="lg:hidden space-y-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Tap a team to assign:</p>
                    {divisionTeams.map((team: any) => (
                      <Button
                        key={team.id}
                        variant="outline"
                        size="sm"
                        className="mr-2"
                        onClick={() => {
                          if (unassigned[0]) handleTapAssign(unassigned[0].visitId, team.id)
                        }}
                      >
                        {team.name_en}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Team x Hour grid (desktop only) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-muted text-left w-32">Team</th>
                      {HOURS.map((h) => (
                        <th key={h} className="border p-2 bg-muted text-center w-16">
                          {h}:00
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divisionTeams.map((team: any) => (
                      <tr key={team.id}>
                        <td className="border p-2 font-medium">{team.name_en}</td>
                        {HOURS.map((h) => {
                          const cellServices = assigned.filter(
                            (s) => s.teamId === team.id,
                          )
                          return (
                            <DroppableCell key={`${team.id}_${h}`} teamId={team.id} hour={h}>
                              {h === 7 && cellServices.map((s) => (
                                <Badge
                                  key={s.visitId}
                                  variant="secondary"
                                  className="text-xs mb-0.5 block truncate"
                                >
                                  {s.serviceName}
                                </Badge>
                              ))}
                            </DroppableCell>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DndContext>
          </>
        )}
      </div>

      {/* Partial push confirmation */}
      <AlertDialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Partial Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Only {assignedCount} of {totalCount} services have teams assigned.
              The remaining {totalCount - assignedCount} will not be pushed to the calendar.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setPushDialogOpen(false)}>Cancel</Button>
            <Button onClick={doPush}>Push {assignedCount} Visits</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
