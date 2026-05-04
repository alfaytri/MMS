import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  useAssignEmployeeToTeam,
  useSetTeamLeader,
  useSetEmployeeStatus,
  useAssignVehicleToTeam,
  useUnassignVehicle,
  type EmployeeStatus,
  type Employee,
} from '@/hooks/useTeams'

export type DragData =
  | { type: 'employee'; employeeId: string; fromTeamId: string | null }
  | { type: 'vehicle'; vehicleId: string; fromTeamId: string | null }

export type DropData =
  | { zone: 'team-members'; teamId: string }
  | { zone: 'team-leader'; teamId: string }
  | { zone: 'team-vehicle'; teamId: string }
  | { zone: 'vehicle-pool' }
  | { zone: 'status-tab'; status: EmployeeStatus }

export function useDnDHandlers() {
  const [activeItem, setActiveItem] = useState<DragData | null>(null)
  const qc = useQueryClient()
  const assignEmployee = useAssignEmployeeToTeam()
  const setLeader = useSetTeamLeader()
  const setStatus = useSetEmployeeStatus()
  const assignVehicle = useAssignVehicleToTeam()
  const unassignVehicle = useUnassignVehicle()

  function handleDragStart(data: DragData) {
    setActiveItem(data)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    const drag = event.active.data.current as DragData | undefined
    const drop = event.over?.data.current as DropData | undefined
    if (!drag || !drop) return

    if (drag.type === 'employee' && drop.zone === 'team-members') {
      // Guard: no-op if already a member of this team
      if (drag.fromTeamId === drop.teamId) return
      assignEmployee.mutate({ employeeId: drag.employeeId, teamId: drop.teamId })
      return
    }

    if (drag.type === 'employee' && drop.zone === 'team-leader') {
      // Guard: block archived/vacation from becoming leader
      // Try both possible cache key forms
      const cached = (
        qc.getQueryData<Employee[]>(['employees']) ??
        qc.getQueryData<Employee[]>(['employees', undefined]) ??
        []
      )
      const emp = cached.find(e => e.id === drag.employeeId)
      if (emp && (emp.status === 'archived' || emp.status === 'vacation')) return
      setLeader.mutate({ teamId: drop.teamId, employeeId: drag.employeeId })
      return
    }

    if (drag.type === 'employee' && drop.zone === 'status-tab') {
      setStatus.mutate({ employeeId: drag.employeeId, status: drop.status })
      return
    }

    if (drag.type === 'vehicle' && drop.zone === 'team-vehicle') {
      assignVehicle.mutate({ vehicleId: drag.vehicleId, teamId: drop.teamId })
      return
    }

    if (drag.type === 'vehicle' && drop.zone === 'vehicle-pool' && drag.fromTeamId) {
      unassignVehicle.mutate({ vehicleId: drag.vehicleId, fromTeamId: drag.fromTeamId })
    }
  }

  return { handleDragStart, handleDragEnd, activeItem }
}
