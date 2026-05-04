'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
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

  // Batch tool count maps — avoids N+1 per-employee/per-team queries
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
}

const TeamsPageContext = createContext<TeamsPageContextValue | null>(null)

export function TeamsPageProvider({ children }: { children: ReactNode }) {
  const [teamDialog,     setTeamDialog]     = useState<TeamDialogState>({ open: false, team: null })
  const [employeeDialog, setEmployeeDialog] = useState<EmployeeDialogState>({ open: false, employee: null })
  const [vehicleDialog,  setVehicleDialog]  = useState<VehicleDialogState>({ open: false, vehicle: null })
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({ open: false, teamId: null })
  const [logPanel,       setLogPanel]       = useState<LogPanelState>({ open: false, entityId: null, entityType: null })
  const [toolsSheet,     setToolsSheet]     = useState<ToolsSheetState>({ open: false, teamId: null, teamName: null })
  const [searchQuery,    setSearch]         = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null)
  const [density,        setDensity]        = useState<'card' | 'list'>('card')

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
