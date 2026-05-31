'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import type { LeafletGeometry } from '@/lib/traccar'

interface GeofenceDrawerProps {
  map: L.Map | null
  active: boolean
  onDrawComplete: (geometry: LeafletGeometry) => void
  onCancel: () => void
}

export function GeofenceDrawer({ map, active, onDrawComplete, onCancel }: GeofenceDrawerProps) {
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const drawnLayerRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (!map) return

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnLayerRef.current = drawnItems

    return () => {
      map.removeLayer(drawnItems)
      drawnLayerRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!map || !drawnLayerRef.current) return

    if (active) {
      const drawControl = new L.Control.Draw({
        draw: {
          polyline: false,
          rectangle: false,
          marker: false,
          circlemarker: false,
          polygon: { shapeOptions: { color: '#3B82F6' } },
          circle: { shapeOptions: { color: '#3B82F6' } },
        },
        edit: { featureGroup: drawnLayerRef.current },
      })
      map.addControl(drawControl)
      drawControlRef.current = drawControl

      const handleCreated = (e: L.LeafletEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = (e as any).layer
        if (layer instanceof L.Polygon) {
          const latLngs = (layer.getLatLngs()[0] as L.LatLng[])
          onDrawComplete({
            type: 'polygon',
            coordinates: latLngs.map(ll => [ll.lat, ll.lng]),
          })
        } else if (layer instanceof L.Circle) {
          const center = layer.getLatLng()
          onDrawComplete({
            type: 'circle',
            center: [center.lat, center.lng],
            radius: layer.getRadius(),
          })
        }
        drawnLayerRef.current?.clearLayers()
      }

      map.on(L.Draw.Event.CREATED, handleCreated)

      return () => {
        map.off(L.Draw.Event.CREATED, handleCreated)
        map.removeControl(drawControl)
        drawControlRef.current = null
      }
    } else {
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current)
        drawControlRef.current = null
      }
      drawnLayerRef.current?.clearLayers()
    }
  }, [map, active, onDrawComplete, onCancel])

  return null
}
