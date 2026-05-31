// src/components/map/VehicleTrail.tsx
'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { TraccarPosition } from '@/lib/traccar'

interface VehicleTrailProps {
  map: L.Map | null
  positions: TraccarPosition[]
  visible: boolean
}

function speedToColor(speedKmh: number): string {
  if (speedKmh > 100) return '#ef4444' // red — high speed
  if (speedKmh > 60) return '#f59e0b'  // orange — moderate
  return '#22c55e'                      // green — normal
}

export function VehicleTrail({ map, positions, visible }: VehicleTrailProps) {
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

  // Toggle visibility
  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !map) return
    if (visible) {
      if (!map.hasLayer(layer)) map.addLayer(layer)
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer)
    }
  }, [visible, map])

  // Draw trail segments
  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !visible || positions.length < 2) {
      layer?.clearLayers()
      return
    }

    layer.clearLayers()

    // Draw speed-colored segments
    for (let i = 0; i < positions.length - 1; i++) {
      const from = positions[i]
      const to = positions[i + 1]
      const color = speedToColor(from.speed)

      L.polyline(
        [[from.latitude, from.longitude], [to.latitude, to.longitude]],
        { color, weight: 4, opacity: 0.8 }
      ).addTo(layer)
    }

    // Add clickable dots at intervals for detail
    const step = Math.max(1, Math.floor(positions.length / 30))
    for (let i = 0; i < positions.length; i += step) {
      const p = positions[i]
      L.circleMarker([p.latitude, p.longitude], {
        radius: 4,
        color: speedToColor(p.speed),
        fillColor: speedToColor(p.speed),
        fillOpacity: 1,
        weight: 1,
      })
        .bindPopup(
          `<div style="font-size:12px;line-height:1.4;">` +
          `<div>🚗 ${p.speed} km/h</div>` +
          `<div>⏱ ${new Date(p.deviceTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>` +
          `</div>`
        )
        .addTo(layer)
    }

    // Fit map bounds to trail
    const bounds = L.latLngBounds(
      positions.map(p => [p.latitude, p.longitude] as L.LatLngTuple)
    )
    map?.fitBounds(bounds, { padding: [50, 50] })
  }, [positions, visible, map])

  return null
}
