// src/components/team-leader/dialogs/SiteVisitContractDialog.tsx
'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { BaseOrderDialog } from '../shared/BaseOrderDialog'
import { PhotoCapture } from '../shared/PhotoCapture'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function SiteVisitContractDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [photos, setPhotos] = useState<Blob[]>([])
  const [notes, setNotes] = useState('')

  const otherTeams = (visit.team_ids ?? []).filter((t) => t !== visit.team_id)

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: {}, inventoryUsage: {}, photos,
      damageReport: { noted: false },
    }
    onComplete(visit.id, data)
  }

  return (
    <BaseOrderDialog
      open
      onClose={onClose}
      headerLabel="Site Visit — Contract"
      headerSubtitle={`${visit.scheduled_time ?? ''} · ${visit.customer_name}`}
      headerColorClass="bg-purple-600 text-white"
      otherTeams={otherTeams}
      isLastTeam={otherTeams.length === 0}
      onComplete={handleSubmit}
      completeLabel="Submit Assessment"
    >
      {/* Contract Scope */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Contract Scope</p>
        {visit.services.map((s) => (
          <p key={s.id} className="text-sm">• {s.name}</p>
        ))}
      </div>

      <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Assessment Notes</p>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Enter assessment findings..." />
      </div>
    </BaseOrderDialog>
  )
}
