'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCalendarSchedule, useDivisionSchedule, useAllDivisionSchedules } from '@/hooks/useCalendarSchedule'
import { useCalendarVisits, groupVisitsByTeam, filterVisitsByType } from '@/hooks/useCalendarVisits'
import {
  useWeekCapacity,
  computeDayCapacity,
  buildWeekDates,
  getWeekStart,
} from '@/hooks/useWeekCapacity'
import { useTeams } from '@/hooks/useTeams'
import { useTeamSkills } from '@/hooks/useTeamSkills'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { CalendarToolbar } from './CalendarToolbar'
import { WeekCapacityStrip } from './WeekCapacityStrip'
import { TimelineGrid } from './TimelineGrid'
import { TeamCardList } from './TeamCardList'
import { SwapTeamDialog } from './SwapTeamDialog'
import { VisitDetailPanel } from './VisitDetailPanel'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Permission hook
// ---------------------------------------------------------------------------

function useCalendarPermissions() {
  const { data: perms = [] } = useQuery({
    queryKey: ['calendar-permissions'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      return ((profile?.user_custom_roles ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
        .flatMap(r => r.custom_roles?.permissions ?? [])
    },
  })
  return {
    canView: perms.includes('calendar.view') || perms.length === 0,
    canEdit: perms.includes('calendar.edit-order'),
    canSwap: perms.includes('calendar.swap-teams'),
  }
}

// ---------------------------------------------------------------------------
// CalendarPage
// ---------------------------------------------------------------------------

export function CalendarPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [fitMode, setFitMode] = useState(false)
  const [activeVisitTypes, setActiveVisitTypes] = useState<Set<string>>(new Set())
  const [swapVisit, setSwapVisit] = useState<CalendarVisit | null>(null)
  const [selectedVisit, setSelectedVisit] = useState<CalendarVisit | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)

  const { isSuperViewer, divisions } = useUserDivisionScope()
  const [activeDivisionSlug, setActiveDivisionSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!activeDivisionSlug && divisions.length > 0) {
      setActiveDivisionSlug(divisions[0].slug)
    }
  }, [divisions, activeDivisionSlug])

  // Derived week window
  const { weekStart, weekDates } = useMemo(() => {
    const ws = getWeekStart(new Date(date))
    return { weekStart: ws, weekDates: buildWeekDates(ws) }
  }, [date])

  // Data hooks
  const { data: globalSchedule } = useCalendarSchedule()
  const { data: divisionSchedule } = useDivisionSchedule(activeDivisionSlug)
  // Division schedule takes priority over global setting
  const schedule = divisionSchedule ?? globalSchedule
  // Per-division schedules for per-team dimming in the timeline
  const divisionSchedules = useAllDivisionSchedules()
  const { data: rawVisits = [] } = useCalendarVisits(date, activeDivisionSlug)
  const { data: weekVisitsRaw = {} } = useWeekCapacity(weekStart, activeDivisionSlug, activeVisitTypes)
  const { data: allTeams = [] } = useTeams({ divisionId: activeDivisionSlug })
  const { data: teamSkills = new Map() } = useTeamSkills(activeDivisionSlug)
  const { canView, canEdit, canSwap } = useCalendarPermissions()

  const scheduleData = useMemo(
    () => schedule ?? { mode: 'normal' as const, day_start: 7, day_end: 18, scroll_to: 7, label: '' },
    [schedule],
  )

  const visits = useMemo(
    () => filterVisitsByType(rawVisits, activeVisitTypes),
    [rawVisits, activeVisitTypes],
  )
  const visitsByTeam = useMemo(() => groupVisitsByTeam(visits), [visits])
  const teams = useMemo(() => (allTeams as TeamFull[]).filter(t => !t.is_qc), [allTeams])

  const divisionColors = useMemo(
    () => Object.fromEntries(divisions.map(d => [d.slug, d.color ?? '#94a3b8'])),
    [divisions],
  )

  const capacityByDate = useMemo(() => {
    return weekDates.reduce<Record<string, ReturnType<typeof computeDayCapacity>>>((acc, d) => {
      const dayOfWeek = new Date(d).getDay()
      const daySchedule = {
        enabled: dayOfWeek !== 5,
        start: `${String(scheduleData.day_start).padStart(2, '0')}:00`,
        end: `${String(scheduleData.day_end).padStart(2, '0')}:00`,
        break_minutes: 60,
      }
      acc[d] = computeDayCapacity(weekVisitsRaw[d] ?? [], daySchedule)
      return acc
    }, {})
  }, [weekDates, weekVisitsRaw, scheduleData.day_start, scheduleData.day_end])

  const capacityByTeam = useMemo(() => {
    const todayDayOfWeek = new Date(date).getDay()
    const daySchedule = {
      enabled: todayDayOfWeek !== 5,
      start: `${String(scheduleData.day_start).padStart(2, '0')}:00`,
      end: `${String(scheduleData.day_end).padStart(2, '0')}:00`,
      break_minutes: 60,
    }
    return new Map(
      teams.map(t => {
        const teamVisits = visitsByTeam.get(t.id) ?? []
        return [
          t.id,
          computeDayCapacity(
            teamVisits.map(v => ({ start_time: v.start_time, end_time: v.end_time })),
            daySchedule,
          ),
        ]
      }),
    )
  }, [teams, visitsByTeam, date, scheduleData.day_start, scheduleData.day_end])

  // Track grid container width for TimelineGrid body calculation.
  // ResizeObserver covers desktop resizes; the window 'resize' listener
  // covers mobile orientation changes where iOS Safari fires RO too early.
  useEffect(() => {
    const el = gridContainerRef.current
    if (!el) return

    const update = () => {
      if (gridContainerRef.current) {
        setGridWidth(gridContainerRef.current.getBoundingClientRect().width - 192)
      }
    }

    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // Realtime: invalidate on any calendar_visits change
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('calendar-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_visits' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['calendar-visits'] })
          queryClient.invalidateQueries({ queryKey: ['week-capacity'] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  function toggleVisitType(type: string) {
    setActiveVisitTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  /** Open detail panel instead of navigating away. */
  function handleEdit(visit: CalendarVisit) {
    setSelectedVisit(visit)
  }

  /** Navigate to the order edit page from the detail panel. */
  function handleEditNavigate(visit: CalendarVisit) {
    if (visit.order_number) {
      router.push(`/orders?q=${encodeURIComponent(visit.order_number)}`)
    }
  }

  /** Click on empty calendar cell → open order creation prefilled with date, team, and hour. */
  function handleCellClick(teamId: string, hour: number) {
    router.push(`/orders/create?date=${date}&teamId=${encodeURIComponent(teamId)}&hour=${hour}`)
  }

  function handleDivisionChange(slug: string) {
    setActiveDivisionSlug(slug || null)
  }

  // Resolve team name for the detail panel
  const selectedTeamName = useMemo(() => {
    if (!selectedVisit) return null
    const team = teams.find(t => t.id === selectedVisit.team_id)
    return team ? (team.name_en ?? team.name) : null
  }, [selectedVisit, teams])

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        You do not have permission to view the calendar.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      <CalendarToolbar
        date={date}
        onDateChange={setDate}
        schedule={scheduleData}
        isSuperViewer={isSuperViewer}
        activeDivisionSlug={activeDivisionSlug}
        divisions={divisions}
        onDivisionChange={handleDivisionChange}
        activeVisitTypes={activeVisitTypes}
        onVisitTypeToggle={toggleVisitType}
        fitMode={fitMode}
        onFitModeToggle={() => setFitMode(f => !f)}
        showFitToggle
        onCreateOrder={() => router.push('/orders/create')}
      />

      <WeekCapacityStrip
        weekDates={weekDates}
        capacityByDate={capacityByDate}
        selectedDate={date}
        onDateSelect={setDate}
      />

      <div ref={gridContainerRef} className="flex-1 overflow-hidden">
        {/* Desktop timeline */}
        <div className="hidden md:flex flex-col h-full">
          <TimelineGrid
            schedule={scheduleData}
            divisionSchedules={divisionSchedules}
            teams={teams}
            visitsByTeam={visitsByTeam}
            fitMode={fitMode}
            date={date}
            canEdit={canEdit}
            canSwap={canSwap}
            onEdit={handleEdit}
            onSwap={setSwapVisit}
            bodyWidth={gridWidth}
            divisionColors={divisionColors}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Mobile card list */}
        <div className="md:hidden overflow-y-auto h-full">
          <TeamCardList
            teams={teams}
            visitsByTeam={visitsByTeam}
            capacityByTeam={capacityByTeam}
            date={date}
            canEdit={canEdit}
            canSwap={canSwap}
            onEdit={handleEdit}
            onSwap={setSwapVisit}
            divisionColors={divisionColors}
          />
        </div>
      </div>

      {/* Visit detail panel */}
      {selectedVisit && (
        <VisitDetailPanel
          visit={selectedVisit}
          teamName={selectedTeamName}
          canEdit={canEdit}
          canSwap={canSwap}
          onEdit={handleEditNavigate}
          onSwap={setSwapVisit}
          onClose={() => setSelectedVisit(null)}
        />
      )}

      {/* Swap-team dialog */}
      {swapVisit && (
        <SwapTeamDialog
          visit={swapVisit}
          assignmentId={swapVisit.id}
          teams={teams}
          allDayVisits={rawVisits}
          teamSkills={teamSkills}
          onClose={() => setSwapVisit(null)}
        />
      )}
    </div>
  )
}
