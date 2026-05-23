// src/components/team-leader/dialogs/SiteVisitContractDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PhotoCapture } from '../shared/PhotoCapture'
import { DamageReport } from '../shared/DamageReport'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function SiteVisitContractDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [photos, setPhotos] = useState<Blob[]>([])
  const [damage, setDamage] = useState({ noted: false })
  const [notes,  setNotes]  = useState('')

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: {}, inventoryUsage: {}, photos, damageReport: damage,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Site Visit — Contract</DialogTitle>
          <Badge className="w-fit bg-purple-600 text-white">Contract Assessment</Badge>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Contract Scope</p>
              {visit.services.map((s) => (
                <p key={s.id} className="text-sm">• {s.name}</p>
              ))}
            </div>
            <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />
            <DamageReport visitId={visit.id} value={damage} onChange={setDamage} />
            <div className="space-y-1.5">
              <Label>Assessment Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Enter assessment findings…" />
            </div>
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button className="w-full min-h-11" onClick={handleSubmit}>Submit Assessment</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
