// src/components/team-leader/dialogs/ContractVisitDialog.tsx
'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Building2 } from 'lucide-react'
import { BaseOrderDialog } from '../shared/BaseOrderDialog'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture } from '../shared/PhotoCapture'
import type { TlVisit, OrderCompletionData, BuildingNode } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function ContractVisitDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [openFloors, setOpenFloors] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [photos, setPhotos] = useState<Blob[]>([])

  const building: BuildingNode = visit.building_node ?? {
    name: 'Building',
    floors: [{
      name: 'Ground Floor',
      rooms: visit.services.map((s) => ({ name: s.name, serviceId: s.id })),
    }],
  }

  const otherTeams = (visit.team_ids ?? []).filter((t) => t !== visit.team_id)

  function toggleFloor(floorName: string) {
    setOpenFloors((prev) => {
      const next = new Set(prev)
      next.has(floorName) ? next.delete(floorName) : next.add(floorName)
      return next
    })
  }

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: statuses, inventoryUsage: {}, photos,
      damageReport: { noted: false },
    }
    onComplete(visit.id, data)
  }

  return (
    <BaseOrderDialog
      open
      onClose={onClose}
      headerLabel="Contract Visit"
      headerSubtitle={`${visit.scheduled_time ?? ''} · ${visit.customer_name}`}
      headerColorClass="bg-green-600 text-white"
      otherTeams={otherTeams}
      isLastTeam={otherTeams.length === 0}
      onComplete={handleSubmit}
      completeLabel="Complete Contract Visit"
    >
      {/* Building tree */}
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center gap-2 bg-muted px-4 py-2">
          <Building2 className="h-4 w-4" />
          <span className="font-medium text-sm">{building.name}</span>
        </div>

        {building.floors.map((floor) => {
          const open = openFloors.has(floor.name)
          return (
            <div key={floor.name} className="border-t">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
                onClick={() => toggleFloor(floor.name)}
              >
                {floor.name}
                {open
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>

              {open && floor.rooms.map((room) => (
                <div key={room.serviceId} className="border-t px-4 py-3 bg-background space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">{room.name}</p>
                  <ServiceStatusList
                    services={visit.services.filter((s) => s.id === room.serviceId)}
                    statuses={statuses}
                    onChange={(id, s) => setStatuses((p) => ({ ...p, [id]: s }))}
                  />
                  <PhotoCapture
                    visitId={`${visit.id}-${room.serviceId}`}
                    label={`${room.name} Photos`}
                    photos={[]}
                    onChange={() => {}}
                    maxPhotos={5}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <PhotoCapture visitId={visit.id} label="General Photos" photos={photos} onChange={setPhotos} />
    </BaseOrderDialog>
  )
}
