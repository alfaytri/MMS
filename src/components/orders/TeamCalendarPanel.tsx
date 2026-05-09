// src/components/orders/TeamCalendarPanel.tsx
'use client'
import { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { useTeams } from '@/hooks/useTeams'
import { useCalendarVisits, type CalendarVisit } from '@/hooks/useCalendarVisits'

import { AllocateQuantityDialog } from './AllocateQuantityDialog'
import type { OrderServiceDraft, TeamAssignmentDraft, OrderMode } from '@/types/orders'
import { cn } from '@/lib/utils'

// TeamFull extends TeamRaw = DBTable<'teams'>, but DBTable is a broken re-export in
// this codebase — the Row fields (id, name, name_en, …) are not visible to TS.
// We define a local alias with the fields we need so we can cast safely.
interface TeamRow {
  id: string
  name: string
  name_en: string | null
  name_ar: string | null
  members: Array<{ skills: string[] | null }>
}

/** Hours shown in the grid: 7 AM – 6 PM (inclusive). */
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7)

interface PendingDrop {
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
}

interface Props {
  visitDate: string
  mode: OrderMode
  onModeChange: (mode: OrderMode) => void
  assignments: TeamAssignmentDraft[]
  draggingService: OrderServiceDraft | null
  onAssign: (assignment: Omit<TeamAssignmentDraft, 'id'>) => void
  onDateChange: (date: string) => void
}

// ---------------------------------------------------------------------------
// DroppableCell
// ---------------------------------------------------------------------------

interface DroppableCellProps {
  teamId: string
  hour: number
  isSkillMatch: boolean | null
  children?: React.ReactNode
}

function DroppableCell({ teamId, hour, isSkillMatch, children }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}-${hour}`,
    data: { teamId, hour },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative h-12 w-16 shrink-0 border-r border-slate-100 transition-colors',
        isOver && 'bg-orange-50 ring-1 ring-inset ring-orange-300',
        isSkillMatch === true && 'bg-green-50',
        isSkillMatch === false && 'opacity-40',
      )}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TeamCalendarPanel
// ---------------------------------------------------------------------------

export function TeamCalendarPanel({
  visitDate,
  mode,
  onModeChange,
  assignments,
  draggingService,
  onAssign,
  onDateChange,
}: Props) {
  // Cast the query result to our local TeamRow shape — TeamFull extends TeamRaw which
  // is typed as DBTable<'teams'>, a broken re-export in this codebase. The data at
  // runtime is correct; we cast here to make TS happy without touching shared files.
  const { data: teamsRaw } = useTeams()
  const teams = (teamsRaw ?? []) as unknown as TeamRow[]

  // Pass null for divisionSlug — the panel shows all divisions in the order context.
  const { data: visits } = useCalendarVisits(visitDate, null)

  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

  const date = useMemo(() => new Date(visitDate), [visitDate])

  // Build a map of teamId → flat array of skill strings from all members.
  const teamSkillMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    teams.forEach((t) => {
      map[t.id] = t.members.flatMap((e) => e.skills ?? [])
    })
    return map
  }, [teams])

  /** Returns true if the team has the required skill, false if not, null if no skill required. */
  function getSkillMatch(teamId: string): boolean | null {
    if (!draggingService?.rootSkillId) return null
    return (teamSkillMap[teamId] ?? []).includes(draggingService.rootSkillId)
  }

  function getVisitsForCell(teamId: string, hour: number): CalendarVisit[] {
    return (visits ?? []).filter(
      (v) => v.team_id === teamId && v.start_time !== null && parseInt(v.start_time) === hour,
    )
  }

  function getAssignmentsForCell(teamId: string, hour: number): TeamAssignmentDraft[] {
    return assignments.filter(
      (a) => a.teamId === teamId && parseInt(a.timeSlot) === hour,
    )
  }

  /** Resolves the best display name for a team (prefers Arabic-script-aware name_en). */
  function teamDisplayName(team: TeamRow): string {
    return team.name_en ?? team.name
  }

  function formatHour(hour: number): string {
    if (hour < 12) return `${hour}AM`
    if (hour === 12) return '12PM'
    return `${hour - 12}PM`
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous day"
            onClick={() => onDateChange(format(subDays(date, 1), 'yyyy-MM-dd'))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-medium">
            {format(date, 'EEE, MMM d')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next day"
            onClick={() => onDateChange(format(addDays(date, 1), 'yyyy-MM-dd'))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Mode switcher */}
        <div className="flex gap-1">
          {(['normal', 'emergency', 'waitlist'] as OrderMode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? 'default' : 'outline'}
              className="h-7 capitalize text-xs"
              onClick={() => onModeChange(m)}
            >
              {m === 'normal' ? 'Normal' : m === 'emergency' ? 'Emergency' : 'Wait List'}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-max">
          {/* Team label column */}
          <div className="w-32 shrink-0 border-r">
            {/* Corner cell */}
            <div className="flex h-8 items-center border-b bg-slate-50 px-2 text-xs font-medium text-slate-500">
              Teams / Time
            </div>

            {/* One row per team */}
            {(teams ?? []).map((team: TeamRow) => (
              <div
                key={team.id}
                className={cn(
                  'flex h-12 items-center border-b px-2 text-sm transition-opacity',
                  draggingService && getSkillMatch(team.id) === false && 'opacity-40',
                )}
              >
                <p className="max-w-[110px] truncate font-medium text-slate-900">
                  {teamDisplayName(team)}
                </p>
              </div>
            ))}
          </div>

          {/* Time columns */}
          <div className="flex flex-1">
            {HOURS.map((hour) => (
              <div key={hour} className="w-16 shrink-0">
                {/* Hour header */}
                <div className="flex h-8 items-center justify-center border-b border-r bg-slate-50 text-xs text-slate-500">
                  {formatHour(hour)}
                </div>

                {/* One droppable cell per team */}
                {(teams ?? []).map((team: TeamRow) => (
                  <DroppableCell
                    key={team.id}
                    teamId={team.id}
                    hour={hour}
                    isSkillMatch={draggingService ? getSkillMatch(team.id) : null}
                  >
                    {/* Existing calendar visits */}
                    {getVisitsForCell(team.id, hour).map((v: CalendarVisit) => (
                      <div
                        key={v.id}
                        title={v.customer_name ?? v.id}
                        className="absolute inset-0 m-0.5 truncate rounded bg-blue-100 p-0.5 text-xs text-blue-800"
                      >
                        {v.customer_name ?? v.id}
                      </div>
                    ))}

                    {/* Draft assignments added in this order form */}
                    {getAssignmentsForCell(team.id, hour).map((a: TeamAssignmentDraft) => (
                      <div
                        key={a.id}
                        title={`${a.services.reduce((sum, s) => sum + s.qty, 0)}× new`}
                        className="absolute inset-0 m-0.5 truncate rounded bg-orange-100 p-0.5 text-xs text-orange-800"
                      >
                        {a.services.reduce((sum, s) => sum + s.qty, 0)}× new
                      </div>
                    ))}
                  </DroppableCell>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Allocate Quantity Dialog ── */}
      {pendingDrop && (
        <AllocateQuantityDialog
          open
          onOpenChange={(v) => { if (!v) setPendingDrop(null) }}
          service={pendingDrop.service}
          teamId={pendingDrop.teamId}
          teamName={pendingDrop.teamName}
          timeSlot={pendingDrop.timeSlot}
          onConfirm={(allocs) => {
            allocs.forEach((a) =>
              onAssign({
                teamId: a.teamId,
                teamName: a.teamName,
                services: [
                  {
                    serviceId: pendingDrop.service.serviceId,
                    qty: a.qty,
                  },
                ],
                timeSlot: a.timeSlot,
                duration: pendingDrop.service.duration,
              }),
            )
            setPendingDrop(null)
          }}
        />
      )}
    </div>
  )
}
