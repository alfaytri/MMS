// src/app/(dashboard)/map/page.tsx
'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useTeamLocations } from '@/hooks/useTeamLocations'
import { useOrderLocations } from '@/hooks/useOrderLocations'
import { MapSidebar } from '@/components/map/MapSidebar'
import type { TeamLocation } from '@/hooks/useTeamLocations'

// Leaflet must be loaded client-side only — it accesses `window` on import.
// Dynamic import with ssr:false prevents "window is not defined" crashes.
const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => ({ default: m.MapView })),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted animate-pulse" /> }
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

  // ── Data ───────────────────────────────────────────────────
  const {
    data: teams = [],
    refetch: refetchTeams,
    isFetching: isRefreshingTeams,
  } = useTeamLocations()

  const { data: orders = [] } = useOrderLocations({ dateFrom, dateTo })

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

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full">
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
      />
      <MapView
        teams={teams}
        orders={orders}
        showOrders={showOrders}
        search={search}
        selectedTeamId={selectedTeamId}
        flyTo={flyTo}
        onFlyToDone={handleFlyToDone}
      />
    </div>
  )
}
