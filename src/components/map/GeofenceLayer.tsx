'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { GeofenceResponse } from '@/lib/traccar'

interface GeofenceLayerProps {
  map: L.Map | null
  geofences: GeofenceResponse[]
  visible: boolean
  onSelectGeofence: (geofence: GeofenceResponse) => void
}

export function GeofenceLayer({ map, geofences, visible, onSelectGeofence }: GeofenceLayerProps) {
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!map) return
    const layer = L.layerGroup()
    if (visible) layer.addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !map) return
    if (visible && !map.hasLayer(layer)) map.addLayer(layer)
    if (!visible && map.hasLayer(layer)) map.removeLayer(layer)
  }, [visible, map])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !visible) return
    layer.clearLayers()

    for (const gf of geofences) {
      if (!gf.geometry) continue
      const color = gf.color || '#3B82F6'

      if (gf.geometry.type === 'polygon') {
        const polygon = L.polygon(
          gf.geometry.coordinates.map(([lat, lng]) => [lat, lng] as L.LatLngTuple),
          { color, fillColor: color, fillOpacity: 0.15, weight: 2 }
        )
        polygon.bindTooltip(gf.name, { permanent: false, direction: 'center' })
        polygon.on('click', () => onSelectGeofence(gf))
        layer.addLayer(polygon)
      } else if (gf.geometry.type === 'circle') {
        const circle = L.circle(
          gf.geometry.center as L.LatLngTuple,
          { radius: gf.geometry.radius, color, fillColor: color, fillOpacity: 0.15, weight: 2 }
        )
        circle.bindTooltip(gf.name, { permanent: false, direction: 'center' })
        circle.on('click', () => onSelectGeofence(gf))
        layer.addLayer(circle)
      }
    }
  }, [geofences, visible, onSelectGeofence])

  return null
}
