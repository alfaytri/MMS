// src/components/team-leader/dialogs/BackworkDialog.tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BaseOrderDialog } from '../shared/BaseOrderDialog'
import { PhotoCapture } from '../shared/PhotoCapture'
import { DamageReportDialog } from '../shared/DamageReportDialog'
import { ServiceCatalogPicker } from '../shared/ServiceCatalogPicker'
import type {
  TlVisit, OrderCompletionData, BackworkReason,
  DamageReportEntry, AddedBillableService,
} from '@/types/team-leader'

const BACKWORK_REASONS: { value: BackworkReason; label: string }[] = [
  { value: 'issue-confirmed', label: 'Issue Confirmed' },
  { value: 'partially-resolved-previously', label: 'Partially Resolved Previously' },
  { value: 'new-issue-found', label: 'New Issue Found' },
  { value: 'equipment-needed', label: 'Equipment Needed' },
  { value: 'access-issue-previously', label: 'Access Issue Previously' },
]

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function BackworkDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [serviceReasons, setServiceReasons] = useState<Record<string, BackworkReason>>({})
  const [serviceNotes, setServiceNotes] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Blob[]>([])
  const [damageOpen, setDamageOpen] = useState(false)
  const [damages, setDamages] = useState<DamageReportEntry[]>([])
  const [billables, setBillables] = useState<AddedBillableService[]>([])

  const ctx = visit.backwork_context
  const otherTeams = (visit.team_ids ?? []).filter((t) => t !== visit.team_id)

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: Object.fromEntries(
        Object.entries(serviceReasons).map(([k]) => [k, 'done' as const])
      ),
      inventoryUsage: {},
      photos,
      damageReport: { noted: damages.length > 0, description: damages.map((d) => d.description).join('\n') },
    }
    onComplete(visit.id, data)
  }

  return (
    <>
      <BaseOrderDialog
        open
        onClose={onClose}
        headerLabel="Backwork Visit"
        headerSubtitle={`${visit.scheduled_time ?? ''} · ${visit.customer_name}`}
        headerColorClass="bg-destructive text-destructive-foreground"
        otherTeams={otherTeams}
        isLastTeam={otherTeams.length === 0}
        onComplete={handleSubmit}
        completeLabel="Complete Order"
      >
        {/* Original Backwork Items */}
        <div className="rounded-lg border-l-4 border-l-destructive border bg-background p-4 space-y-3">
          {ctx?.customer_reason && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300">{ctx.customer_reason}</Badge>
          )}
          {ctx?.note && (
            <Badge variant="outline" className="bg-muted/50">{ctx.note}</Badge>
          )}

          {visit.services.map((svc) => (
            <div key={svc.id} className="space-y-2 pt-3 border-t first:border-t-0 first:pt-0">
              <p className="text-sm font-medium">{svc.name}</p>
              <Select
                value={serviceReasons[svc.id] ?? ''}
                onValueChange={(v) => setServiceReasons((p) => ({ ...p, [svc.id]: v as BackworkReason }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {BACKWORK_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Team note..."
                value={serviceNotes[svc.id] ?? ''}
                onChange={(e) => setServiceNotes((p) => ({ ...p, [svc.id]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}
        </div>

        {/* Attachments */}
        <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />

        {/* Damage */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pre-existing Damage</p>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setDamageOpen(true)}>
              Report Damage
            </Button>
          </div>
          {damages.map((d) => (
            <div key={d.id} className="flex items-start justify-between text-xs rounded border p-2 bg-background">
              <div>
                <p>{d.description}</p>
                {d.customerNotified && <Badge variant="outline" className="text-[10px] mt-1">Notified</Badge>}
              </div>
              <button type="button" onClick={() => setDamages((p) => p.filter((x) => x.id !== d.id))}>
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Billable Service */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 space-y-3">
          <p className="text-sm font-semibold">Add Billable Service</p>
          <ServiceCatalogPicker onAdd={(s) => setBillables((p) => [...p, s])} />
          {billables.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs border rounded p-2 bg-background">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground">{s.path}</p>
              </div>
              <div className="flex items-center gap-2">
                <span>QAR {s.unitPrice}</span>
                <button type="button" onClick={() => setBillables((p) => p.filter((x) => x.id !== s.id))}>
                  <X className="h-3 w-3 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </BaseOrderDialog>

      <DamageReportDialog open={damageOpen} visitId={visit.id} onSubmit={(d) => setDamages((p) => [...p, d])} onClose={() => setDamageOpen(false)} />
    </>
  )
}
