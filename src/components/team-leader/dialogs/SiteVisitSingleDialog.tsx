// src/components/team-leader/dialogs/SiteVisitSingleDialog.tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BaseOrderDialog } from '../shared/BaseOrderDialog'
import { PhotoCapture } from '../shared/PhotoCapture'
import { ServiceCatalogPicker } from '../shared/ServiceCatalogPicker'
import type { TlVisit, OrderCompletionData, AddedBillableService } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function SiteVisitSingleDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [photos, setPhotos] = useState<Blob[]>([])
  const [quotationServices, setQuotationServices] = useState<AddedBillableService[]>([])
  const [customRequest, setCustomRequest] = useState('')
  const [customRequests, setCustomRequests] = useState<string[]>([])

  const otherTeams = (visit.team_ids ?? []).filter((t) => t !== visit.team_id)

  function addCustomRequest() {
    if (!customRequest.trim()) return
    setCustomRequests((p) => [...p, customRequest.trim()])
    setCustomRequest('')
  }

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: {}, inventoryUsage: {}, photos,
      damageReport: { noted: false },
    }
    onComplete(visit.id, data)
  }

  return (
    <>
      <BaseOrderDialog
        open
        onClose={onClose}
        headerLabel="Site Visit — Single"
        headerSubtitle={`${visit.scheduled_time ?? ''} · ${visit.customer_name}`}
        headerColorClass="bg-yellow-500 text-white"
        otherTeams={otherTeams}
        isLastTeam={otherTeams.length === 0}
        onComplete={handleSubmit}
        completeLabel="Complete Assessment"
      >
        {/* Assessment Purpose */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Assessment Purpose</p>
          {visit.services.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span>•</span>
              <span>{s.name}</span>
              <Badge variant="outline" className="text-[10px] bg-muted">Assessment</Badge>
            </div>
          ))}
        </div>

        {/* Services for Quotation */}
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
          <p className="text-sm font-semibold">Services for Quotation</p>
          <ServiceCatalogPicker onAdd={(s) => setQuotationServices((p) => [...p, s])} />

          {quotationServices.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs border rounded p-2 bg-background">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground">{s.path}</p>
              </div>
              <div className="flex items-center gap-2">
                <span>QAR {s.unitPrice}</span>
                <button type="button" onClick={() => setQuotationServices((p) => p.filter((x) => x.id !== s.id))}>
                  <X className="h-3 w-3 text-destructive" />
                </button>
              </div>
            </div>
          ))}

          {/* Custom requests */}
          <div className="flex gap-2">
            <Input
              placeholder="Add custom request..."
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRequest() } }}
              className="h-9 text-sm"
            />
            <Button variant="outline" size="sm" className="h-9" onClick={addCustomRequest} disabled={!customRequest.trim()}>
              Add
            </Button>
          </div>
          {customRequests.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs border rounded p-2 bg-background">
              <span>{r}</span>
              <button type="button" onClick={() => setCustomRequests((p) => p.filter((_, j) => j !== i))}>
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>

        {/* Attachments */}
        <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />
      </BaseOrderDialog>

    </>
  )
}
