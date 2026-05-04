'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, Satellite, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnassignVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehicleSlot({ team }: { team: TeamFull }) {
  const unassign = useUnassignVehicle()
  const { openLogPanel } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `vehicle-slot-${team.id}`,
    data: { zone: 'team-vehicle', teamId: team.id },
  })
  const vehicle = team.vehicle

  if (!vehicle) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-10 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}>
        <Truck className="h-3 w-3 mr-1" /> Drop vehicle
      </div>
    )
  }

  return (
    <DraggableVehicleChip
      vehicle={vehicle}
      teamId={team.id}
      onUnassign={() => unassign.mutate({ vehicleId: vehicle.id, fromTeamId: team.id })}
      onLog={() => openLogPanel(vehicle.id, 'vehicle')}
      dropRef={setNodeRef}
      isOver={isOver}
    />
  )
}

function DraggableVehicleChip({ vehicle, teamId, onUnassign, onLog, dropRef, isOver }: {
  vehicle: NonNullable<TeamFull['vehicle']>
  teamId: string
  onUnassign: () => void
  onLog: () => void
  dropRef: (n: HTMLElement | null) => void
  isOver: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vehicle-draggable-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: teamId } satisfies DragData,
  })
  // traccar_device_id may not be in generated types — cast safely
  const traccarId = (vehicle as unknown as { traccar_device_id?: string | null }).traccar_device_id ?? null

  return (
    <div
      ref={(n) => { setNodeRef(n); dropRef(n) }}
      {...attributes}
      className={cn(
        'group flex items-center gap-2 h-10 px-2 rounded border bg-muted/50 text-sm transition-opacity',
        isDragging && 'opacity-50',
        isOver && 'ring-2 ring-primary bg-primary/5'
      )}
    >
      <div {...listeners} className="cursor-grab touch-none shrink-0">
        <Truck className="h-3 w-3 text-muted-foreground" />
      </div>
      <span className="flex-1 truncate font-mono text-xs">{vehicle.plate}</span>
      {traccarId && <Satellite className="h-3 w-3 text-blue-500" />}
      <div className="hidden group-hover:flex items-center gap-1">
        <button onClick={onLog} className="p-0.5 hover:text-primary" type="button">
          <Clock className="h-3 w-3" />
        </button>
        <button onClick={onUnassign} className="p-0.5 hover:text-destructive" type="button">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
