// src/app/(dashboard)/map/page.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { useTeamLocations } from '@/hooks/useTeamLocations'
import { useOrderLocations } from '@/hooks/useOrderLocations'
import { useVehicles } from '@/hooks/useTeams'
import { useTraccarPositions, useTraccarGeofences, useTraccarHistory } from '@/hooks/useTraccar'
import { parseTraccarId } from '@/lib/traccar'
import { MapSidebar } from '@/components/map/MapSidebar'
import { Button } from '@/components/ui/button'
import type { TeamLocation } from '@/hooks/useTeamLocations'
import type { GeofenceResponse, LeafletGeometry } from '@/lib/traccar'
import type { VehicleMapData } from '@/components/map/VehicleMarkerLayer'

// Leaflet must be loaded client-side only — it accesses `window` on import.
// Dynamic import with ssr:false prevents "window is not defined" crashes.
const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => ({ default: m.MapView })),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted animate-pulse" /> }
)

const VehicleMarkerLayer = dynamic(
  () => import('@/components/map/VehicleMarkerLayer').then(m => ({ default: m.VehicleMarkerLayer })),
  { ssr: false }
)
const VehicleTrail = dynamic(
  () => import('@/components/map/VehicleTrail').then(m => ({ default: m.VehicleTrail })),
  { ssr: false }
)
const GeofenceLayer = dynamic(
  () => import('@/components/map/GeofenceLayer').then(m => ({ default: m.GeofenceLayer })),
  { ssr: false }
)
const GeofenceDrawer = dynamic(
  () => import('@/components/map/GeofenceDrawer').then(m => ({ default: m.GeofenceDrawer })),
  { ssr: false }
)

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function MapPage() {
  // ── State ──────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)
  const [showOrders, setShowOrders] = useState(true)
  const [dateFrom, setDateFrom] = useState(getToday)
  const [dateTo, setDateTo] = useState(getTomorrow)

  // Leaflet map instance
  const [leafletMap, setLeafletMap] = useState<L.Map | null>(null)

  // Vehicle tracking state
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [isDrawingGeofence, setIsDrawingGeofence] = useState(false)
  const [drawnGeometry, setDrawnGeometry] = useState<LeafletGeometry | null>(null)
  const [selectedGeofence, setSelectedGeofence] = useState<GeofenceResponse | null>(null)

  // Route history state
  const [historyState, setHistoryState] = useState<{
    vehicleId: string
    traccarDeviceId: number
    from: string
    to: string
  } | null>(null)

  // ── Data ───────────────────────────────────────────────────
  const {
    data: teams = [],
    refetch: refetchTeams,
    isFetching: isRefreshingTeams,
  } = useTeamLocations()

  const { data: orders = [] } = useOrderLocations({ dateFrom, dateTo })

  // Vehicle tracking data
  const { data: allVehicles = [] } = useVehicles()

  const trackedVehicles: VehicleMapData[] = useMemo(() => {
    return allVehicles
      .filter(v => v.traccar_device_id)
      .map(v => ({
        vehicleId: v.id,
        name: v.name ?? null,
        plate: v.plate ?? '',
        type: v.type ?? '',
        traccarDeviceId: parseTraccarId(v.traccar_device_id)!,
      }))
  }, [allVehicles])

  const traccarDeviceIds = useMemo(
    () => trackedVehicles.map(v => v.traccarDeviceId),
    [trackedVehicles]
  )

  const { data: vehiclePositions = [] } = useTraccarPositions(traccarDeviceIds)

  const { data: historyPositions = [] } = useTraccarHistory(
    historyState?.traccarDeviceId ?? null,
    historyState?.from ?? null,
    historyState?.to ?? null
  )

  // Geofences
  const { data: geofences = [] } = useTraccarGeofences()
  const [showGeofences] = useState(true)

  // ── Callbacks ──────────────────────────────────────────────
  const handleSelectTeam = useCallback((team: TeamLocation) => {
    setSelectedTeamId(team.id)
    if (team.lat != null && team.lng != null) {
      setFlyTo({ lat: team.lat, lng: team.lng })
    }
  }, [])

  const handleFlyToDone = useCallback(() => {
    setFlyTo(null)
  }, [])

  const handleRefresh = useCallback(() => {
    refetchTeams()
  }, [refetchTeams])

  const handleToggleOrders = useCallback(() => {
    setShowOrders((prev) => !prev)
  }, [])

  const handleMapReady = useCallback((map: L.Map) => setLeafletMap(map), [])

  const handleSelectVehicle = useCallback((vehicleId: string) => {
    setSelectedVehicleId(vehicleId)
  }, [])

  const handleViewHistory = useCallback((vehicleId: string, traccarDeviceId: number) => {
    const today = new Date()
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
    setHistoryState({ vehicleId, traccarDeviceId, from, to })
  }, [])

  const handleCloseHistory = useCallback(() => setHistoryState(null), [])

  const handleFlyToVehicle = useCallback((lat: number, lng: number) => {
    setFlyTo({ lat, lng })
  }, [])

  const handleDrawComplete = useCallback((geometry: LeafletGeometry) => {
    setDrawnGeometry(geometry)
    setIsDrawingGeofence(false)
  }, [])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0">
      <MapSidebar
        teams={teams}
        search={search}
        onSearchChange={setSearch}
        selectedTeamId={selectedTeamId}
        onSelectTeam={handleSelectTeam}
        showOrders={showOrders}
        onToggleOrders={handleToggleOrders}
        orderCount={orders.length}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshingTeams}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        trackedVehicles={trackedVehicles}
        vehiclePositions={vehiclePositions}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        onViewHistory={handleViewHistory}
        onFlyToVehicle={handleFlyToVehicle}
        geofences={geofences}
        isDrawingGeofence={isDrawingGeofence}
        drawnGeometry={drawnGeometry}
        onStartDrawing={() => setIsDrawingGeofence(true)}
        onCancelDrawing={() => { setIsDrawingGeofence(false); setDrawnGeometry(null) }}
        onClearDrawnGeometry={() => setDrawnGeometry(null)}
        selectedGeofence={selectedGeofence}
        onSelectGeofence={setSelectedGeofence}
      />
      <div className="relative flex-1 min-h-0 h-full">
        <MapView
          teams={teams}
          orders={orders}
          showOrders={showOrders}
          search={search}
          selectedTeamId={selectedTeamId}
          flyTo={flyTo}
          onFlyToDone={handleFlyToDone}
          onMapReady={handleMapReady}
        />
        <VehicleMarkerLayer
          map={leafletMap}
          vehicles={trackedVehicles}
          positions={vehiclePositions}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
        />
        <VehicleTrail
          map={leafletMap}
          positions={historyPositions}
          visible={historyState !== null}
        />
        <GeofenceLayer
          map={leafletMap}
          geofences={geofences}
          visible={showGeofences}
          onSelectGeofence={setSelectedGeofence}
        />
        <GeofenceDrawer
          map={leafletMap}
          active={isDrawingGeofence}
          onDrawComplete={handleDrawComplete}
          onCancel={() => setIsDrawingGeofence(false)}
        />
        {historyState && (
          <div className="absolute top-4 right-4 z-[1000]">
            <Button size="sm" variant="secondary" onClick={handleCloseHistory}>
              Close History
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
