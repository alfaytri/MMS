'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, Satellite, Clock, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnassignVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull, Vehicle } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehicleSlot({ team }: { team: TeamFull }) {
  const unassign = useUnassignVehicle()
  const { openLogPanel, openVehicleDialog } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `vehicle-slot-${team.id}`,
    data: { zone: 'team-vehicle', teamId: team.id },
  })
  const vehicles = team.vehicles

  if (!vehicles.length) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-20 rounded-md border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary border-2 bg-primary/5',
      )}>
        <Truck className="h-3.5 w-3.5 mr-1.5" /> Drop vehicle here
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {vehicles.map(vehicle => (
        <VehicleChip
          key={vehicle.id}
          vehicle={vehicle}
          teamId={team.id}
          onUnassign={() => unassign.mutate({ vehicleId: vehicle.id, fromTeamId: team.id })}
          onLog={() => openLogPanel(vehicle.id, 'vehicle')}
          onEdit={() => openVehicleDialog(vehicle)}
        />
      ))}
      <div
        ref={setNodeRef}
        className={cn(
          'h-9 rounded border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
          isOver && 'border-primary border-2 bg-primary/5',
        )}
      >
        <Truck className="h-3 w-3 mr-1" /> Drop another vehicle
      </div>
    </div>
  )
}

function VehicleChip({ vehicle, teamId, onUnassign, onLog, onEdit }: {
  vehicle: Vehicle
  teamId: string
  onUnassign: () => void
  onLog: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vehicle-draggable-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: teamId } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-3 h-20 px-3 rounded-md border border-border/60 bg-background text-sm transition-opacity cursor-grab touch-none',
        isDragging && 'opacity-50',
      )}
    >
      <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-base font-medium truncate">{vehicle.plate}</p>
        <p className="text-xs text-muted-foreground truncate">
          {vehicle.name ?? vehicle.type ?? 'Vehicle'}
        </p>
      </div>
      {vehicle.traccar_device_id && <Satellite className="h-4 w-4 text-blue-500" />}
      <div className="hidden group-hover:flex items-center gap-0.5" onPointerDown={e => e.stopPropagation()}>
        <button onClick={onEdit} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onLog} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button onClick={onUnassign} className="p-1.5 hover:text-destructive text-muted-foreground" type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
