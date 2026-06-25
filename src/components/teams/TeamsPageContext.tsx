'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { TeamFull, Employee, Vehicle } from '@/hooks/useTeams'
import { useToolCountMap } from '@/hooks/useTeams'

interface TeamDialogState     { open: boolean; team: TeamFull | null }
interface EmployeeDialogState { open: boolean; employee: Employee | null }
interface VehicleDialogState  { open: boolean; vehicle: Vehicle | null }
interface ScheduleDialogState { open: boolean; teamId: string | null }
interface LogPanelState       { open: boolean; entityId: string | null; entityType: string | null }
interface ToolsSheetState     { open: boolean; teamId: string | null; teamName: string | null }

interface TeamsPageContextValue {
  teamDialog:     TeamDialogState
  employeeDialog: EmployeeDialogState
  vehicleDialog:  VehicleDialogState
  scheduleDialog: ScheduleDialogState
  logPanel:       LogPanelState
  toolsSheet:     ToolsSheetState

  searchQuery:    string
  divisionFilter: string | null
  density:        'card' | 'list'

  // v2: selection + pools drawer
  selectedTeamId: string | null
  poolsDrawerOpen: boolean

  employeeToolCounts: Map<string, number>
  teamToolCounts:     Map<string, number>

  openTeamDialog:     (team?: TeamFull) => void
  closeTeamDialog:    () => void
  openEmployeeDialog: (employee?: Employee) => void
  closeEmployeeDialog:() => void
  openVehicleDialog:  (vehicle?: Vehicle) => void
  closeVehicleDialog: () => void
  openScheduleDialog: (teamId?: string) => void
  closeScheduleDialog:() => void
  openLogPanel:       (entityId?: string, entityType?: string) => void
  closeLogPanel:      () => void
  openToolsSheet:     (teamId: string, teamName: string) => void
  closeToolsSheet:    () => void
  setSearch:          (q: string) => void
  setDivisionFilter:  (id: string | null) => void
  setDensity:         (d: 'card' | 'list') => void

  // v2
  setSelectedTeamId:  (id: string | null) => void
  togglePoolsDrawer:  () => void
  setPoolsDrawerOpen: (open: boolean) => void
}

const TeamsPageContext = createContext<TeamsPageContextValue | null>(null)

export function TeamsPageProvider({ children }: { children: ReactNode }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [teamDialog,     setTeamDialog]     = useState<TeamDialogState>({ open: false, team: null })
  const [employeeDialog, setEmployeeDialog] = useState<EmployeeDialogState>({ open: false, employee: null })
  const [vehicleDialog,  setVehicleDialog]  = useState<VehicleDialogState>({ open: false, vehicle: null })
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({ open: false, teamId: null })
  const [logPanel,       setLogPanel]       = useState<LogPanelState>({ open: false, entityId: null, entityType: null })
  const [toolsSheet,     setToolsSheet]     = useState<ToolsSheetState>({ open: false, teamId: null, teamName: null })
  const [searchQuery,    setSearch]         = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null)
  const [density,        setDensity]        = useState<'card' | 'list'>('card')
  const [poolsDrawerOpen, setPoolsDrawerOpen] = useState(false)

  const selectedTeamId = searchParams.get('team')

  const setSelectedTeamId = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('team', id)
    else    params.delete('team')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const togglePoolsDrawer = useCallback(() => setPoolsDrawerOpen(o => !o), [])

  const { data: employeeToolCounts = new Map() } = useToolCountMap('employee')
  const { data: teamToolCounts     = new Map() } = useToolCountMap('team')

  return (
    <TeamsPageContext.Provider value={{
      teamDialog,
      employeeDialog,
      vehicleDialog,
      scheduleDialog,
      logPanel,
      toolsSheet,
      searchQuery,
      divisionFilter,
      density,
      selectedTeamId,
      poolsDrawerOpen,
      employeeToolCounts,
      teamToolCounts,
      openTeamDialog:      (team)     => setTeamDialog({ open: true, team: team ?? null }),
      closeTeamDialog:     ()         => setTeamDialog({ open: false, team: null }),
      openEmployeeDialog:  (employee) => setEmployeeDialog({ open: true, employee: employee ?? null }),
      closeEmployeeDialog: ()         => setEmployeeDialog({ open: false, employee: null }),
      openVehicleDialog:   (vehicle)  => setVehicleDialog({ open: true, vehicle: vehicle ?? null }),
      closeVehicleDialog:  ()         => setVehicleDialog({ open: false, vehicle: null }),
      openScheduleDialog:  (teamId)   => setScheduleDialog({ open: true, teamId: teamId ?? null }),
      closeScheduleDialog: ()         => setScheduleDialog({ open: false, teamId: null }),
      openLogPanel:        (id, type) => setLogPanel({ open: true, entityId: id ?? null, entityType: type ?? null }),
      closeLogPanel:       ()         => setLogPanel({ open: false, entityId: null, entityType: null }),
      openToolsSheet:      (teamId, teamName) => setToolsSheet({ open: true, teamId, teamName }),
      closeToolsSheet:     ()         => setToolsSheet({ open: false, teamId: null, teamName: null }),
      setSearch,
      setDivisionFilter,
      setDensity,
      setSelectedTeamId,
      togglePoolsDrawer,
      setPoolsDrawerOpen,
    }}>
      {children}
    </TeamsPageContext.Provider>
  )
}

export function useTeamsPage() {
  const ctx = useContext(TeamsPageContext)
  if (!ctx) throw new Error('useTeamsPage must be used inside TeamsPageProvider')
  return ctx
}
