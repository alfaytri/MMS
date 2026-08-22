'use client'

import { Users, Truck, Calendar, Plus, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTeams, useEmployees, useVehicles, useTeamActivityLogCount } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'

export function TopBar() {
  const { data: teams     = [] } = useTeams()
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()
  const { data: logCount  = 0  } = useTeamActivityLogCount()
  const { openTeamDialog, openEmployeeDialog, openVehicleDialog, openScheduleDialog, openLogPanel } = useTeamsPage()

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Team &amp; Employee
        </h1>
        <Badge variant="secondary">{teams.length} teams</Badge>
        <Badge variant="outline">{employees.length} employees</Badge>
        <Badge variant="outline" className="flex items-center gap-1">
          <Truck className="h-3 w-3" />{vehicles.length} vehicles
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openLogPanel()}>
          <Activity className="h-4 w-4 mr-1" /> Logs ({logCount})
        </Button>
        <Button variant="outline" size="sm" onClick={() => openScheduleDialog()}>
          <Calendar className="h-4 w-4 mr-1" /> Schedules
        </Button>
        <Button variant="outline" size="sm" onClick={() => openVehicleDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Vehicle
        </Button>
        <Button variant="outline" size="sm" onClick={() => openEmployeeDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
        <Button size="sm" onClick={() => openTeamDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Team
        </Button>
      </div>
    </div>
  )
}
