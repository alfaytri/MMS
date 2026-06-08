'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, Edit2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateGeofence, useUpdateGeofence, useDeleteGeofence } from '@/hooks/useTraccar'
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [editMode, setEditMode] = useState(false)

  const createGeofence = useCreateGeofence()
  const updateGeofence = useUpdateGeofence()
  const deleteGeofence = useDeleteGeofence()

  async function handleSaveNew() {
    if (!drawnGeometry || !name.trim()) return
    await createGeofence.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      geometry: drawnGeometry,
    })
    setName('')
    setDescription('')
    setColor('#3B82F6')
    onClearDrawnGeometry()
  }

  async function handleUpdate() {
    if (!selectedGeofence || !name.trim()) return
    await updateGeofence.mutateAsync({
      traccarGeofenceId: selectedGeofence.traccarGeofenceId,
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    })
    setEditMode(false)
    onSelectGeofence(null)
  }

  async function handleDelete(gf: GeofenceResponse) {
    await deleteGeofence.mutateAsync(gf.traccarGeofenceId)
    if (selectedGeofence?.traccarGeofenceId === gf.traccarGeofenceId) {
      onSelectGeofence(null)
    }
  }

  function startEdit(gf: GeofenceResponse) {
    onSelectGeofence(gf)
    setName(gf.name)
    setDescription(gf.description ?? '')
    setColor(gf.color)
    setEditMode(true)
  }

  if (drawnGeometry) {
    return (
      <div className="p-3 space-y-3">
        <h3 className="text-xs font-semibold">New Geofence</h3>
        <div className="space-y-2">
          <div>
            <Label htmlFor="geo-new-name" className="text-[10px]">Name</Label>
            <Input
              id="geo-new-name"
              className="h-7 text-xs"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Zone name"
            />
          </div>
          <div>
            <Label htmlFor="geo-new-description" className="text-[10px]">Description</Label>
            <Input
              id="geo-new-description"
              className="h-7 text-xs"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="geo-new-color" className="text-[10px]">Color</Label>
            <input
              id="geo-new-color"
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-7 w-full rounded border cursor-pointer"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleSaveNew}
            disabled={!name.trim() || createGeofence.isPending}
          >
            {createGeofence.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => { onClearDrawnGeometry(); onCancelDrawing() }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (editMode && selectedGeofence) {
    return (
      <div className="p-3 space-y-3">
        <h3 className="text-xs font-semibold">Edit Geofence</h3>
        <div className="space-y-2">
          <div>
            <Label htmlFor="geo-edit-name" className="text-[10px]">Name</Label>
            <Input
              id="geo-edit-name"
              className="h-7 text-xs"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="geo-edit-description" className="text-[10px]">Description</Label>
            <Input
              id="geo-edit-description"
              className="h-7 text-xs"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="geo-edit-color" className="text-[10px]">Color</Label>
            <input
              id="geo-edit-color"
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-7 w-full rounded border cursor-pointer"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleUpdate}
            disabled={!name.trim() || updateGeofence.isPending}
          >
            {updateGeofence.isPending ? 'Saving...' : 'Update'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => { setEditMode(false); onSelectGeofence(null) }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onStartDrawing}
          disabled={isDrawing}
        >
          {isDrawing ? (
            <><X className="h-3 w-3 mr-1" /> Drawing... (use map)</>
          ) : (
            <><Plus className="h-3 w-3 mr-1" /> Add Geofence</>
          )}
        </Button>
        {isDrawing && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs mt-2"
            onClick={onCancelDrawing}
          >
            Cancel Drawing
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {geofences.map((gf) => (
            <div
              key={gf.traccarGeofenceId}
              className={cn(
                'flex items-center justify-between rounded-md p-2 transition-colors',
                selectedGeofence?.traccarGeofenceId === gf.traccarGeofenceId
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: gf.color }}
                />
                <span className="text-xs truncate">{gf.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => startEdit(gf)}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => handleDelete(gf)}
                  disabled={deleteGeofence.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          {geofences.length === 0 && !isDrawing && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No geofences yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
