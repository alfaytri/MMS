// src/components/map/MapSidebar.tsx
'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  RefreshCw, Search, MapPin, Navigation, Clock, WifiOff,
  AlertTriangle, Car,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamLocation, TeamLocationStatus } from '@/hooks/useTeamLocations'

// ── Status config ────────────────────────────────────────────────

const STATUS_CONFIG: Record<TeamLocationStatus, {
  bg: string
  text: string
  icon: typeof Navigation
  label: string
  dotBg: string
}> = {
  moving:  { bg: 'bg-success',           text: 'text-success-foreground', icon: Navigation,   label: 'Moving',  dotBg: 'bg-success' },
  idle:    { bg: 'bg-warning',           text: 'text-warning-foreground', icon: Clock,         label: 'Idle',    dotBg: 'bg-warning' },
  stopped: { bg: 'bg-destructive',       text: 'text-destructive-foreground', icon: MapPin,    label: 'Stopped', dotBg: 'bg-destructive' },
  offline: { bg: 'bg-muted',             text: 'text-muted-foreground',  icon: WifiOff,       label: 'Offline', dotBg: 'bg-muted-foreground' },
}

// ── Helper: format last update time ──────────────────────────────

function formatLastUpdate(updatedAt: string | null): string {
  if (!updatedAt) return '—'
  return new Date(updatedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  return Date.now() - new Date(updatedAt).getTime() > 5 * 60_000
}

// ── Props ────────────────────────────────────────────────────────

interface MapSidebarProps {
  teams: TeamLocation[]
  search: string
  onSearchChange: (value: string) => void
  selectedTeamId: string | null
  onSelectTeam: (team: TeamLocation) => void
  showOrders: boolean
  onToggleOrders: () => void
  orderCount: number
  onRefresh: () => void
  isRefreshing: boolean
  // Date filter
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
}

export function MapSidebar({
  teams,
  search,
  onSearchChange,
  selectedTeamId,
  onSelectTeam,
  showOrders,
  onToggleOrders,
  orderCount,
  onRefresh,
  isRefreshing,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: MapSidebarProps) {
  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams
    const q = search.trim().toLowerCase()
    return teams.filter(
      (t) =>
        t.teamName.toLowerCase().includes(q) ||
        t.driverName.toLowerCase().includes(q) ||
        t.vehiclePlate.toLowerCase().includes(q)
    )
  }, [teams, search])

  return (
    <div className="bg-card border-r flex flex-col w-full md:w-80 max-h-[40vh] md:max-h-none">
      {/* ── Header block ──────────────────────────────────────── */}
      <div className="p-3 border-b space-y-2">
        {/* Row A — Title + Refresh */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Live Fleet Tracking</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* Row B — Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Row C — Status legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {(['moving', 'idle', 'stopped', 'offline'] as TeamLocationStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].dotBg)} />
              {STATUS_CONFIG[s].label}
            </span>
          ))}
        </div>

        {/* Row D — Orders toggle + date filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
              showOrders
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
            onClick={onToggleOrders}
          >
            <MapPin className="h-3 w-3" />
            Orders ({orderCount})
          </button>

          {showOrders && (
            <div className="flex items-center gap-1 text-[10px]">
              <input
                type="date"
                className="h-6 px-1 text-[10px] border rounded bg-background"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                className="h-6 px-1 text-[10px] border rounded bg-background"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Team list ─────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredTeams.map((team) => {
            const cfg = STATUS_CONFIG[team.status]
            const StatusIcon = cfg.icon
            const selected = team.id === selectedTeamId

            return (
              <button
                key={team.id}
                className={cn(
                  'w-full text-left rounded-md p-2.5 transition-colors',
                  selected
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-muted/50'
                )}
                onClick={() => onSelectTeam(team)}
              >
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {/* Status badge */}
                    <div
                      className={cn(
                        'h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                        cfg.bg,
                        cfg.text
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                    </div>
                    {/* Name stack */}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{team.teamName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {team.driverName}
                      </div>
                    </div>
                  </div>
                  {/* Plate badge */}
                  <Badge variant="outline" className="text-[9px] h-4 shrink-0 ml-2">
                    {team.vehiclePlate}
                  </Badge>
                </div>

                {/* Current task */}
                {team.currentTask && (
                  <p className="text-[10px] text-muted-foreground mt-1 ml-8 truncate">
                    📍 {team.currentTask}
                  </p>
                )}

                {/* Bottom detail row */}
                <div className="flex items-center gap-3 mt-1 ml-8 text-[10px] text-muted-foreground">
                  {team.status === 'moving' && team.speed != null && (
                    <span className="flex items-center gap-0.5">
                      <Car className="h-3 w-3" />
                      {Math.round(team.speed)} km/h
                    </span>
                  )}
                  <span>⏱ {formatLastUpdate(team.lastUpdate)}</span>
                  {isStale(team.lastUpdate) && (
                    <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                  )}
                </div>
              </button>
            )
          })}

          {filteredTeams.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No teams found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
