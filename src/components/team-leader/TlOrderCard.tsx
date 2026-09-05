// src/components/team-leader/TlOrderCard.tsx
'use client'

import { useState } from 'react'
import {
  MapPin, Phone, Bell, Play, Users, AlertTriangle, Clock,
  FileText, Eye, Pencil, CheckCircle2, Hash, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TlVisit, VisitType } from '@/types/team-leader'
import { CustomerUnavailableDialog } from './CustomerUnavailableDialog'

const TYPE_CONFIG: Record<VisitType, { label: string; color: string }> = {
  'order':               { label: 'Normal Order',          color: 'bg-primary text-primary-foreground' },
  'site-visit-single':   { label: 'Site Visit – Single',   color: 'bg-warning text-warning-foreground' },
  'site-visit-contract': { label: 'Site Visit – Contract', color: 'bg-purple-600 text-white' },
  'contract':            { label: 'Contract Visit',        color: 'bg-green-600 text-white' },
  'backwork':            { label: 'Backwork',              color: 'bg-destructive text-destructive-foreground' },
  'follow-up':           { label: 'Follow-up',             color: 'bg-purple-600 text-white' },
  'qc':                  { label: 'QC Visit',              color: 'bg-secondary text-secondary-foreground' },
}

// Only real service jobs get invoiced. Assessment-type visits (QC of another
// team's work, contract visits covered by the contract, and site-visit
// assessments that produce a quotation) must NOT open the invoice flow — doing so
// created zero-total "paid" invoices for work that was never billed here.
const INVOICEABLE_TYPES: ReadonlySet<VisitType> = new Set<VisitType>([
  'order', 'backwork', 'follow-up',
])

interface Props {
  visit: TlVisit
  teamId: string
  isStarted: boolean
  isCompleted: boolean
  onStart: (visitId: string) => void
  onTapCard: (visit: TlVisit) => void
  onReviewWork?: (visit: TlVisit) => void
  onCreateInvoice?: (visit: TlVisit) => void
}

/**
 * Decode the small set of HTML entities we've seen in `orders.notes` and
 * `site_visits.notes` (they come pre-escaped from the office intake form).
 * Carriage returns / line feeds decode to `\n` so `whitespace-pre-line`
 * renders the notes with the same paragraph breaks the agent typed.
 */
function decodeNotes(text: string): string {
  return text
    .replace(/&#x0[Dd];/g, '\n')
    .replace(/&#x0[Aa];/g, '\n')
    .replace(/&#13;/g, '\n')
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function InfoLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

export function TlOrderCard({
  visit, teamId, isStarted, isCompleted, onStart, onTapCard, onReviewWork, onCreateInvoice,
}: Props) {
  const [unavailableOpen, setUnavailableOpen] = useState(false)
  const cfg = TYPE_CONFIG[visit.type] ?? TYPE_CONFIG['order']

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

  const canEditWork    = isCompleted && !visit.has_invoice
  const canInvoice     = canEditWork && INVOICEABLE_TYPES.has(visit.type)
  const decodedNotes   = visit.notes ? decodeNotes(visit.notes) : ''

  return (
    <>
      <div className={cn(
        'rounded-xl border bg-card overflow-hidden',
        isCompleted && 'ring-1 ring-emerald-500/30',
      )}>
        {/* Type header strip — tappable to open the visit detail dialog */}
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-medium',
            cfg.color,
          )}
          onClick={() => onTapCard(visit)}
        >
          <span className="inline-flex items-center gap-2">
            {cfg.label}
            {visit.team_ids.length > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                <Users className="h-3 w-3" /> Multi-Team
              </span>
            )}
          </span>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </span>
          )}
        </button>

        {/* Full-detail body — always visible, same for every status */}
        <div className="px-4 py-3 space-y-3">
          {/* Header row: Order No · Customer Name · Visit Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <InfoLabel>
                <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> Order No</span>
              </InfoLabel>
              <p className="mt-0.5 font-mono text-xs">{visit.order_id ?? '—'}</p>
            </div>
            <div>
              <InfoLabel>
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Customer Name</span>
              </InfoLabel>
              <p className="mt-0.5 text-sm font-semibold truncate">{visit.customer_name}</p>
            </div>
            <div>
              <InfoLabel>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Visit Time</span>
              </InfoLabel>
              <p className="mt-0.5 text-xs">{visit.scheduled_time ?? '—'}</p>
            </div>
          </div>

          {/* Phone rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <InfoLabel>Phone Number</InfoLabel>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-xs font-medium">{visit.customer_phone ?? '—'}</p>
                {visit.customer_phone && (
                  <a
                    href={`tel:${visit.customer_phone}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                    aria-label={`Call ${visit.customer_phone}`}
                  >
                    <Phone className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <InfoLabel>Phone When Reach</InfoLabel>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-xs font-medium">{visit.location_phone ?? '—'}</p>
                {visit.location_phone && (
                  <a
                    href={`tel:${visit.location_phone}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                    aria-label={`Call ${visit.location_phone}`}
                  >
                    <Bell className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <InfoLabel>Address</InfoLabel>
            <div className="mt-0.5 flex items-start gap-2">
              <p className="flex-1 text-xs">{visit.address || '—'}</p>
              {visit.address && (
                <button
                  type="button"
                  onClick={handleNavigate}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                  aria-label="Open in Waze"
                >
                  <MapPin className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Services (full list, not truncated) */}
          {visit.services.length > 0 && (
            <div>
              <InfoLabel>Services</InfoLabel>
              <ul className="mt-1 space-y-0.5 text-xs">
                {visit.services.map((s) => (
                  <li key={s.id} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{s.name}{s.qty > 1 ? ` (${s.qty})` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes (decoded, preserve line breaks) */}
          {decodedNotes && (
            <div>
              <InfoLabel>Notes</InfoLabel>
              <div className="mt-1 rounded-md bg-muted/40 border px-2 py-1.5">
                <p className="text-xs whitespace-pre-line">{decodedNotes}</p>
              </div>
            </div>
          )}

          {/* Other teams */}
          {visit.other_teams_names.length > 0 && (
            <div>
              <InfoLabel>Other Teams</InfoLabel>
              <ul className="mt-1 space-y-0.5 text-xs">
                {visit.other_teams_names.map((name) => (
                  <li key={name} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action row — varies by status */}
        {isCompleted ? (
          <div className="border-t">
            {/* Invoicing is a separate step: only a completed, not-yet-invoiced
                job of a billable type (assessment visits are excluded — see
                INVOICEABLE_TYPES). */}
            {canInvoice && (
              <Button
                className="w-full rounded-none min-h-11 gap-1.5 text-xs"
                onClick={() => onCreateInvoice?.(visit)}
              >
                <FileText className="h-4 w-4" /> Create Invoice
              </Button>
            )}
            <div className={cn(
              'grid gap-px bg-border',
              canEditWork ? 'grid-cols-2' : 'grid-cols-1',
              canInvoice && 'border-t',
            )}>
              <Button
                variant="ghost"
                className="rounded-none min-h-11 gap-1.5 text-xs"
                onClick={() => onReviewWork?.(visit)}
              >
                <Eye className="h-4 w-4" /> Review Work
              </Button>
              {canEditWork && (
                <Button
                  variant="ghost"
                  className="rounded-none min-h-11 gap-1.5 text-xs"
                  onClick={() => onTapCard(visit)}
                >
                  <Pencil className="h-4 w-4" /> Edit Work
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
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
                  isStarted && 'bg-warning text-warning-foreground hover:bg-warning/90',
                )}
                onClick={() => isStarted ? onTapCard(visit) : onStart(visit.id)}
              >
                {isStarted ? <FileText className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isStarted ? 'In Progress' : 'Start'}
              </Button>
            </div>

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
          </>
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
