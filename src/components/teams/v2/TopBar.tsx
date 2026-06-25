'use client'

import { Search, Plus, Calendar, Activity, Users, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTeams, useEmployees, useVehicles, useTeamActivityLogCount } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

export function TopBar() {
  const { data: teams     = [] } = useTeams()
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()
  const { data: logCount  = 0  } = useTeamActivityLogCount()
  const {
    searchQuery, setSearch,
    openTeamDialog, openEmployeeDialog, openVehicleDialog,
    openScheduleDialog, openLogPanel,
    togglePoolsDrawer,
  } = useTeamsPage()

  const unassignedCount =
    employees.filter(e => !e.team_id).length +
    vehicles.filter(v => !v.team_id).length

  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-border/60 bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold truncate">Team &amp; Employee</h1>
        <span className="hidden md:inline text-xs text-muted-foreground truncate">
          · {teams.length} teams · {employees.length} employees · {vehicles.length} vehicles
        </span>
      </div>

      <div className="flex-1" />

      <div className="relative hidden sm:block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search teams…"
          className="h-8 w-56 pl-8 text-sm"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-8 gap-1">
            <Plus className="h-4 w-4" /> New <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openTeamDialog()}>New team</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEmployeeDialog()}>New employee</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openVehicleDialog()}>New vehicle</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openScheduleDialog()}
        title="Schedules"
      >
        <Calendar className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => openLogPanel()}
        title="Activity log"
      >
        <Activity className="h-4 w-4" />
        {logCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
          >
            {logCount > 99 ? '99+' : logCount}
          </Badge>
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={togglePoolsDrawer}
        title="Pools"
      >
        <Users className="h-4 w-4" />
        {unassignedCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
          >
            {unassignedCount}
          </Badge>
        )}
      </Button>
    </div>
  )
}
