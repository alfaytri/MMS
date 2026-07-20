'use client'

import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, pointerWithin, type DragStartEvent } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TeamsPageProvider } from '@/components/teams/TeamsPageContext'
import { useDnDHandlers, type DragData } from '@/components/teams/useDnDHandlers'
import { TopBar } from '@/components/teams/v2/TopBar'
import { TeamList } from '@/components/teams/v2/TeamList'
import { TeamDetail } from '@/components/teams/v2/TeamDetail'
import { PoolsPanel } from '@/components/teams/v2/PoolsPanel'
import { ActivityLog } from '@/components/teams/v2/ActivityLog'
import { TeamEditDialog } from '@/components/teams/dialogs/TeamEditDialog'
import { EmployeeEditDialog } from '@/components/teams/dialogs/EmployeeEditDialog'
import { VehicleEditDialog } from '@/components/teams/dialogs/VehicleEditDialog'
import { ScheduleDialog } from '@/components/teams/dialogs/ScheduleDialog'
import { TeamToolsSheet } from '@/components/teams/dialogs/TeamToolsSheet'
import { Truck } from 'lucide-react'
import { useEmployees, useVehicles } from '@/hooks/useTeams'

function TeamsPageInner() {
  const { handleDragStart, handleDragEnd, activeItem } = useDnDHandlers()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function onDragStart(event: DragStartEvent) {
    handleDragStart(event.active.data.current as DragData)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <TeamList />
          <TeamDetail />
          <PoolsPanel />
        </div>
      </div>

      {/* zIndex 9999 so overlay renders above all dialogs/sheets */}
      <DragOverlay style={{ zIndex: 9999 }}>
        {activeItem && <DragOverlayContent item={activeItem} />}
      </DragOverlay>

      <TeamEditDialog />
      <EmployeeEditDialog />
      <VehicleEditDialog />
      <ScheduleDialog />
      <ActivityLog />
      <TeamToolsSheet />
    </DndContext>
  )
}

function DragOverlayContent({ item }: { item: DragData }) {
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  if (item.type === 'employee') {
    const emp = employees.find(e => e.id === item.employeeId)
    const initials = emp?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border/60 shadow-sm ring-1 ring-black/5 text-sm pointer-events-none">
        {emp?.avatar_url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={emp.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
          : <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials}</div>
        }
        <span>{emp?.name ?? 'Employee'}</span>
      </div>
    )
  }

  if (item.type === 'vehicle') {
    const veh = vehicles.find(v => v.id === item.vehicleId)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border/60 shadow-sm ring-1 ring-black/5 text-sm pointer-events-none">
        <Truck className="h-4 w-4" />
        <span className="font-mono">{veh?.plate ?? 'Vehicle'}</span>
      </div>
    )
  }

  return null
}

export default function TeamsPage() {
  return (
    <TooltipProvider>
      <TeamsPageProvider>
        <TeamsPageInner />
      </TeamsPageProvider>
    </TooltipProvider>
  )
}
