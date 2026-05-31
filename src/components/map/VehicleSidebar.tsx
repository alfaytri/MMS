// src/components/map/VehicleSidebar.tsx
'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Car, Zap, ZapOff, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TraccarPosition } from '@/lib/traccar'
import type { VehicleMapData } from './VehicleMarkerLayer'
import { deriveVehicleStatus, type VehicleTrackingStatus } from './marker-icons'

const STATUS_CONFIG: Record<VehicleTrackingStatus, {
  label: string
  dotBg: string
}> = {
  moving:  { label: 'Moving',  dotBg: 'bg-success' },
  idle:    { label: 'Idle',    dotBg: 'bg-warning' },
  stopped: { label: 'Stopped', dotBg: 'bg-muted-foreground' },
}

interface VehicleSidebarProps {
  vehicles: VehicleMapData[]
  positions: TraccarPosition[]
  selectedVehicleId: string | null
  onSelectVehicle: (vehicleId: string) => void
  onViewHistory: (vehicleId: string, traccarDeviceId: number) => void
  onFlyTo: (lat: number, lng: number) => void
}

export function VehicleSidebar({
  vehicles,
  positions,
  selectedVehicleId,
  onSelectVehicle,
  onViewHistory,
  onFlyTo,
}: VehicleSidebarProps) {
  const [search, setSearch] = useState('')

  const positionMap = useMemo(() => {
    const map = new Map<number, TraccarPosition>()
    for (const p of positions) map.set(p.deviceId, p)
    return map
  }, [positions])

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter(v => v.plate.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
  }, [vehicles, search])

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search vehicles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Status legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {(['moving', 'idle', 'stopped'] as VehicleTrackingStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].dotBg)} />
              {STATUS_CONFIG[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Vehicle list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredVehicles.map((v) => {
            const pos = positionMap.get(v.traccarDeviceId)
            const status: VehicleTrackingStatus = pos
              ? deriveVehicleStatus(pos.attributes.motion, pos.attributes.ignition)
              : 'stopped'
            const cfg = STATUS_CONFIG[status]
            const selected = v.vehicleId === selectedVehicleId

            return (
              <button
                key={v.vehicleId}
                className={cn(
                  'w-full text-left rounded-md p-2.5 transition-colors',
                  selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                )}
                onClick={() => {
                  onSelectVehicle(v.vehicleId)
                  if (pos) onFlyTo(pos.latitude, pos.longitude)
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dotBg)} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{v.plate}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{v.type}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] h-4 shrink-0 ml-2">
                    {cfg.label}
                  </Badge>
                </div>

                {pos && (
                  <div className="flex items-center gap-3 mt-1 ml-5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Car className="h-3 w-3" /> {pos.speed} km/h
                    </span>
                    <span className="flex items-center gap-0.5">
                      {pos.attributes.ignition ? <Zap className="h-3 w-3 text-success" /> : <ZapOff className="h-3 w-3" />}
                      {pos.attributes.ignition ? 'On' : 'Off'}
                    </span>
                    <span>
                      ⏱ {new Date(pos.deviceTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {selected && pos && (
                  <div className="mt-2 ml-5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewHistory(v.vehicleId, v.traccarDeviceId)
                      }}
                    >
                      <History className="h-3 w-3 mr-1" />
                      View History
                    </Button>
                  </div>
                )}
              </button>
            )
          })}

          {filteredVehicles.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No tracked vehicles
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
