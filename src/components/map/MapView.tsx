// src/components/map/MapView.tsx
'use client'

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { TeamLocation } from '@/hooks/useTeamLocations'
import type { OrderLocation } from '@/hooks/useOrderLocations'
import {
  getTeamIcon,
  getOrderIcon,
  buildTeamPopup,
  buildOrderPopup,
  createClusterIcon,
} from './marker-icons'
import './map-styles.css'

// ── Fix Leaflet default icon paths for Vite/Next.js bundler ──────
// Without this, Leaflet's bundled marker PNGs 404 under Vite.
// We use custom DivIcons so this only matters if someone adds a
// default marker elsewhere.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ── Doha fallback center ─────────────────────────────────────────
const DOHA_CENTER: L.LatLngTuple = [25.2854, 51.5310]
const DEFAULT_ZOOM = 12

interface MapViewProps {
  teams: TeamLocation[]
  orders: OrderLocation[]
  showOrders: boolean
  search: string
  selectedTeamId: string | null
  flyTo: { lat: number; lng: number } | null
  onFlyToDone: () => void
}

export function MapView({
  teams,
  orders,
  showOrders,
  search,
  selectedTeamId,
  flyTo,
  onFlyToDone,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const teamClusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const orderLayerRef = useRef<L.LayerGroup | null>(null)
  const teamMarkerMapRef = useRef<Map<string, L.Marker>>(new Map())
  const initialBoundsSet = useRef(false)

  // ── Map initialization (one-time) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: false })
      .setView(DOHA_CENTER, DEFAULT_ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    // Team markers use MarkerClusterGroup
    const teamCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 11,
      iconCreateFunction: createClusterIcon,
      animate: true,
      spiderfyOnMaxZoom: true,
    })
    map.addLayer(teamCluster)

    // Order markers use a plain LayerGroup
    const orderLayer = L.layerGroup().addTo(map)

    mapRef.current = map
    teamClusterRef.current = teamCluster
    orderLayerRef.current = orderLayer

    return () => {
      map.remove()
      mapRef.current = null
      teamClusterRef.current = null
      orderLayerRef.current = null
      teamMarkerMapRef.current.clear()
      initialBoundsSet.current = false
    }
  }, [])

  // ── Auto-fit bounds on first data load ───────────────────────
  useEffect(() => {
    if (initialBoundsSet.current || !mapRef.current) return
    const withCoords = teams.filter((t) => t.lat != null && t.lng != null)
    if (withCoords.length === 0) return

    const bounds = L.latLngBounds(
      withCoords.map((t) => [t.lat!, t.lng!] as L.LatLngTuple)
    )
    mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    initialBoundsSet.current = true
  }, [teams])

  // ── Diff-based team marker updates ───────────────────────────
  useEffect(() => {
    const cluster = teamClusterRef.current
    if (!cluster) return

    const markerMap = teamMarkerMapRef.current
    const currentIds = new Set<string>()

    // Normalize search for dimming
    const q = search.trim().toLowerCase()

    for (const team of teams) {
      if (team.lat == null || team.lng == null) continue
      currentIds.add(team.id)

      const latLng: L.LatLngTuple = [team.lat, team.lng]
      const existing = markerMap.get(team.id)

      // Check if this marker should be dimmed
      const isDimmed = q.length > 0 && !(
        team.teamName.toLowerCase().includes(q) ||
        team.driverName.toLowerCase().includes(q) ||
        team.vehiclePlate.toLowerCase().includes(q)
      )

      if (existing) {
        // Update position
        existing.setLatLng(latLng)

        // Update icon if status changed (stored as data attribute)
        const prevStatus = (existing as any)._teamStatus
        if (prevStatus !== team.status) {
          existing.setIcon(getTeamIcon(team.status))
          ;(existing as any)._teamStatus = team.status
        }

        // Update popup content
        const popup = existing.getPopup()
        if (popup) popup.setContent(buildTeamPopup(team))

        // Update dimming
        const el = (existing as any)._icon as HTMLElement | null
        if (el) {
          el.classList.toggle('marker-dimmed', isDimmed)
        }
      } else {
        // Create new marker
        const marker = L.marker(latLng, { icon: getTeamIcon(team.status) })
          .bindPopup(buildTeamPopup(team))
        ;(marker as any)._teamStatus = team.status
        cluster.addLayer(marker)
        markerMap.set(team.id, marker)

        // Apply dimming to new marker after it renders
        if (isDimmed) {
          marker.on('add', () => {
            const el = (marker as any)._icon as HTMLElement | null
            if (el) el.classList.add('marker-dimmed')
          })
        }
      }
    }

    // Remove markers for teams no longer in data
    for (const [id, marker] of markerMap) {
      if (!currentIds.has(id)) {
        cluster.removeLayer(marker)
        markerMap.delete(id)
      }
    }
  }, [teams, search])

  // ── Order markers (clearLayers is fine — orders change less) ──
  useEffect(() => {
    const layer = orderLayerRef.current
    if (!layer) return

    layer.clearLayers()
    if (!showOrders) return

    for (const order of orders) {
      const marker = L.marker([order.lat, order.lng], {
        icon: getOrderIcon(order.status),
      }).bindPopup(buildOrderPopup(order))
      layer.addLayer(marker)
    }
  }, [orders, showOrders])

  // ── FlyTo effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo([flyTo.lat, flyTo.lng], 15, { duration: 1 })
    onFlyToDone()
  }, [flyTo, onFlyToDone])

  return <div ref={containerRef} className="h-full w-full z-0" />
}
