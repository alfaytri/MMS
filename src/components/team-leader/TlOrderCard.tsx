// src/components/team-leader/TlOrderCard.tsx
'use client'

import { useState } from 'react'
import { MapPin, Phone, Bell, Play, Users, AlertTriangle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { TlVisit, VisitType } from '@/types/team-leader'
import { CustomerUnavailableDialog } from './CustomerUnavailableDialog'

const TYPE_CONFIG: Record<VisitType, { label: string; color: string }> = {
  'order':              { label: 'Normal Order',          color: 'bg-primary text-primary-foreground' },
  'site-visit-single':  { label: 'Site Visit – Single',   color: 'bg-warning text-warning-foreground' },
  'site-visit-contract':{ label: 'Site Visit – Contract', color: 'bg-purple-600 text-white' },
  'contract':           { label: 'Contract Visit',        color: 'bg-green-600 text-white' },
  'backwork':           { label: 'Backwork',              color: 'bg-destructive text-destructive-foreground' },
  'follow-up':          { label: 'Follow-up',             color: 'bg-purple-600 text-white' },
  'qc':                 { label: 'QC Visit',              color: 'bg-secondary text-secondary-foreground' },
}

interface Props {
  visit: TlVisit
  teamId: string
  isStarted: boolean
  isCompleted: boolean
  onStart: (visitId: string) => void
  onTapCard: (visit: TlVisit) => void
}

export function TlOrderCard({ visit, teamId, isStarted, isCompleted, onStart, onTapCard }: Props) {
  const [unavailableOpen, setUnavailableOpen] = useState(false)
  const cfg = TYPE_CONFIG[visit.type] ?? TYPE_CONFIG['order']
  const shownServices = visit.services.slice(0, 3)
  const extraCount    = visit.services.length - 3

  function handleNavigate() {
    const url = visit.waze_link
      ?? `https://waze.com/ul?q=${encodeURIComponent(visit.address)}&navigate=yes`
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile) {
      window.location.href = url
    } else {
      window.open(url, '_blank')
    }
  }

  if (isCompleted) {
    return (
      <div className="rounded-xl border bg-muted/40 overflow-hidden opacity-60">
        <div className={cn('px-3 py-1.5 text-xs font-medium', cfg.color)}>{cfg.label}</div>
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{visit.customer_name}</p>
            <p className="text-xs text-muted-foreground">{visit.address}</p>
          </div>
          <Badge variant="outline" className="text-xs text-green-600 border-green-600">Completed</Badge>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Color header strip */}
        <button
          type="button"
          className={cn('w-full px-3 py-1.5 text-left text-xs font-medium', cfg.color)}
          onClick={() => onTapCard(visit)}
        >
          {cfg.label}
          {visit.team_ids.length > 1 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              <Users className="h-3 w-3" /> Multi-Team
            </span>
          )}
        </button>

        {/* Card body — tap to open detail */}
        <button
          type="button"
          className="w-full px-3 py-3 text-left space-y-2"
          onClick={() => onTapCard(visit)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{visit.customer_name}</p>
              <p className="text-xs text-muted-foreground truncate">{visit.address}</p>
            </div>
            {visit.scheduled_time && (
              <span className="flex items-center gap-1 shrink-0 text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-1">
                <Clock className="h-3 w-3" />
                {visit.scheduled_time}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {shownServices.map((s) => (
              <Badge key={s.id} variant="secondary" className="text-xs">{s.name}</Badge>
            ))}
            {extraCount > 0 && (
              <Badge variant="outline" className="text-xs">+{extraCount} more</Badge>
            )}
          </div>
        </button>

        {/* 2×2 action buttons */}
        <div className="grid grid-cols-2 gap-px bg-border border-t">
          <Button variant="ghost" className="rounded-none min-h-11 gap-1.5 text-xs" onClick={handleNavigate}>
            <MapPin className="h-4 w-4" /> Navigate
          </Button>
          <Button variant="ghost" className="rounded-none min-h-11 gap-1.5 text-xs" asChild>
            <a href={`tel:${visit.customer_phone ?? ''}`}>
              <Phone className="h-4 w-4" /> Customer
            </a>
          </Button>
          <Button variant="ghost" className="rounded-none min-h-11 gap-1.5 text-xs" asChild>
            <a href={`tel:${visit.location_phone ?? ''}`}>
              <Bell className="h-4 w-4" /> On Arrival
            </a>
          </Button>
          <Button
            variant={isStarted ? 'default' : 'ghost'}
            className={cn(
              'rounded-none min-h-11 gap-1.5 text-xs',
              isStarted && 'bg-warning text-warning-foreground hover:bg-warning/90'
            )}
            onClick={() => onStart(visit.id)}
          >
            <Play className="h-4 w-4" />
            {isStarted ? 'In Progress' : 'Start'}
          </Button>
        </div>

        {/* Customer Not Answering — only after start */}
        {isStarted && (
          <div className="border-t px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full min-h-11 gap-2 text-xs border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setUnavailableOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              Customer Not Answering
            </Button>
          </div>
        )}
      </div>

      <CustomerUnavailableDialog
        open={unavailableOpen}
        visitId={visit.id}
        teamId={teamId}
        sourceType={visit.source_type}
        sourceId={visit.source_id}
        onClose={() => setUnavailableOpen(false)}
      />
    </>
  )
}
