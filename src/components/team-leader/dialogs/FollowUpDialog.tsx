// src/components/team-leader/dialogs/FollowUpDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture }       from '../shared/PhotoCapture'
import { DamageReport }       from '../shared/DamageReport'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function FollowUpDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [photos,   setPhotos]   = useState<Blob[]>([])
  const [damage,   setDamage]   = useState({ noted: false })

  const ctx = visit.followup_context

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: statuses, inventoryUsage: {}, photos, damageReport: damage,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Follow-up Visit</DialogTitle>
          <Badge className="w-fit bg-purple-600 text-white">Follow-up</Badge>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {ctx && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                {ctx.previous_visit_id && (
                  <>
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Previous Visit</p>
                    <p className="text-sm font-mono text-xs">{ctx.previous_visit_id}</p>
                  </>
                )}
                {ctx.agent_note && (
                  <>
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Agent Note</p>
                    <p className="text-sm">{ctx.agent_note}</p>
                  </>
                )}
              </div>
            )}
            <ServiceStatusList services={visit.services} statuses={statuses} onChange={(id, s) => setStatuses(p => ({ ...p, [id]: s }))} />
            <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />
            <DamageReport visitId={visit.id} value={damage} onChange={setDamage} />
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button className="w-full min-h-11" onClick={handleSubmit}>Complete Visit</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
