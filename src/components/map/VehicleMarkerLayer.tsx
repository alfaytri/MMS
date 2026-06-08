// src/components/map/VehicleMarkerLayer.tsx
'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { getVehicleIcon, buildVehiclePopup, deriveVehicleStatus } from './marker-icons'
import type { VehicleTrackingStatus } from './marker-icons'
import type { TraccarPosition } from '@/lib/traccar'

export interface VehicleMapData {
  vehicleId: string
  name: string | null
  plate: string
  type: string
  traccarDeviceId: number
}

interface VehicleMarkerLayerProps {
  map: L.Map | null
  vehicles: VehicleMapData[]
  positions: TraccarPosition[]
  selectedVehicleId: string | null
  onSelectVehicle: (vehicleId: string) => void
}

export function VehicleMarkerLayer({
  map,
  vehicles,
  positions,
  selectedVehicleId,
  onSelectVehicle,
}: VehicleMarkerLayerProps) {
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map())

  // Initialise layer group
  useEffect(() => {
    if (!map) return
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
      markerMapRef.current.clear()
    }
  }, [map])

  // Diff-based marker updates
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const markerMap = markerMapRef.current
    const positionMap = new Map<number, TraccarPosition>()
    for (const p of positions) {
      positionMap.set(p.deviceId, p)
    }

    const currentIds = new Set<string>()

    for (const v of vehicles) {
      const pos = positionMap.get(v.traccarDeviceId)
      if (!pos) continue

      currentIds.add(v.vehicleId)
      const latLng: L.LatLngTuple = [pos.latitude, pos.longitude]
      const status = deriveVehicleStatus(pos.attributes.motion, pos.attributes.ignition, pos.speed)
      const existing = markerMap.get(v.vehicleId)

      const popupData = {
        name: v.name,
        plate: v.plate,
        type: v.type,
        speed: pos.speed,
        ignition: pos.attributes.ignition ?? false,
        motion: pos.attributes.motion ?? false,
        lastUpdate: pos.deviceTime,
      }

      if (existing) {
        existing.setLatLng(latLng)
        const prevStatus = existing._vehicleStatus as VehicleTrackingStatus | undefined
        if (prevStatus !== status) {
          existing.setIcon(getVehicleIcon(status))
          ;existing._vehicleStatus = status
        }
        const popup = existing.getPopup()
        if (popup) popup.setContent(buildVehiclePopup(popupData))
      } else {
        const marker = L.marker(latLng, { icon: getVehicleIcon(status) })
          .bindPopup(buildVehiclePopup(popupData))
        ;marker._vehicleStatus = status
        const vehicleId = v.vehicleId
        marker.on('click', () => onSelectVehicle(vehicleId))
        layer.addLayer(marker)
        markerMap.set(v.vehicleId, marker)
      }
    }

    // Remove markers for vehicles no longer tracked
    for (const [id, marker] of markerMap) {
      if (!currentIds.has(id)) {
        layer.removeLayer(marker)
        markerMap.delete(id)
      }
    }
  }, [vehicles, positions, onSelectVehicle])

  // Highlight selected vehicle
  useEffect(() => {
    // Future: could add a selection ring or bounce animation
  }, [selectedVehicleId])

  return null // Pure imperative Leaflet layer — no React DOM
}
