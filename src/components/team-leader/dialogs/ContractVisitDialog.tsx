// src/components/team-leader/dialogs/ContractVisitDialog.tsx
'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Building2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture }       from '../shared/PhotoCapture'
import { DamageReport }       from '../shared/DamageReport'
import type { TlVisit, OrderCompletionData, BuildingNode } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function ContractVisitDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [openFloors,  setOpenFloors]  = useState<Set<string>>(new Set())
  const [statuses,    setStatuses]    = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [photos,      setPhotos]      = useState<Blob[]>([])
  const [damage,      setDamage]      = useState({ noted: false })

  const building: BuildingNode = visit.building_node ?? {
    name: 'Building',
    floors: [{
      name: 'Ground Floor',
      rooms: visit.services.map((s) => ({ name: s.name, serviceId: s.id })),
    }],
  }

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
      serviceStatuses: statuses, inventoryUsage: {}, photos, damageReport: damage,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Contract Visit</DialogTitle>
          <Badge className="w-fit bg-green-600 text-white">Contract</Badge>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
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
            <DamageReport visitId={visit.id} value={damage} onChange={setDamage} />
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button className="w-full min-h-11" onClick={handleSubmit}>Complete Contract Visit</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
