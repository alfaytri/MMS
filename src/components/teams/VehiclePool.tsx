'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, GripVertical, Satellite, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVehicles } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { Vehicle } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehiclePool() {
  const { data: vehicles = [] } = useVehicles()
  const pool = vehicles.filter(v => !v.team_id)
  const { setNodeRef, isOver } = useDroppable({ id: 'vehicle-pool', data: { zone: 'vehicle-pool' } })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <Truck className="h-4 w-4" /> Vehicle Pool · {pool.length} available
      </p>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[3.5rem] rounded border-2 border-dashed p-2 flex flex-col gap-1.5 transition-colors',
          pool.length === 0 && 'items-center justify-center text-sm text-muted-foreground',
          isOver && 'border-primary bg-primary/5'
        )}
      >
        {pool.length === 0 && 'Drop vehicles here to unassign'}
        {pool.map(v => <PoolVehicleChip key={v.id} vehicle={v} />)}
      </div>
    </div>
  )
}

function PoolVehicleChip({ vehicle }: { vehicle: Vehicle }) {
  const { openLogPanel } = useTeamsPage()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-vehicle-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: null } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded border bg-muted/50 text-sm cursor-grab',
        isDragging && 'opacity-50'
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate font-mono">{vehicle.plate}</span>
      {vehicle.traccar_device_id && <Satellite className="h-4 w-4 text-blue-500" />}
      <button
        onClick={() => openLogPanel(vehicle.id, 'vehicle')}
        className="hidden group-hover:block p-1 hover:text-primary"
        type="button"
      >
        <Clock className="h-4 w-4" />
      </button>
    </div>
  )
}
