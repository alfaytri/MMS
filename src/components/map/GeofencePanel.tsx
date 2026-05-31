// src/components/map/GeofencePanel.tsx
'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Shield, PlusCircle, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeofenceResponse, LeafletGeometry } from '@/lib/traccar'

interface GeofencePanelProps {
  geofences: GeofenceResponse[]
  isDrawing: boolean
  drawnGeometry: LeafletGeometry | null
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onClearDrawnGeometry: () => void
  selectedGeofence: GeofenceResponse | null
  onSelectGeofence: (gf: GeofenceResponse | null) => void
}

export function GeofencePanel({
  geofences,
  isDrawing,
  drawnGeometry,
  onStartDrawing,
  onCancelDrawing,
  onClearDrawnGeometry,
  selectedGeofence,
  onSelectGeofence,
}: GeofencePanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="p-2 border-b flex items-center gap-2">
        {isDrawing ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={onCancelDrawing}
          >
            <X className="h-3 w-3 mr-1" />
            Cancel Drawing
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onStartDrawing}
          >
            <PlusCircle className="h-3 w-3 mr-1" />
            Draw Geofence
          </Button>
        )}

        {drawnGeometry && !isDrawing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive"
            onClick={onClearDrawnGeometry}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Geofence list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {geofences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Shield className="h-8 w-8 opacity-30" />
              <p className="text-xs">No geofences yet</p>
              <p className="text-[10px] text-center">
                Click &quot;Draw Geofence&quot; to create one on the map
              </p>
            </div>
          ) : (
            geofences.map((gf) => {
              const selected = selectedGeofence?.id === gf.id
              return (
                <button
                  key={gf.id}
                  className={cn(
                    'w-full text-left rounded-md p-2.5 transition-colors',
                    selected
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => onSelectGeofence(selected ? null : gf)}
                >
                  <div className="flex items-center gap-2">
                    {/* Color swatch */}
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: gf.color ?? '#6366f1' }}
                    />
                    <span className="text-xs font-medium truncate">{gf.name}</span>
                  </div>
                  {gf.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-5 truncate">
                      {gf.description}
                    </p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
