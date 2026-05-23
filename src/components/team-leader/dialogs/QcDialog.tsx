// src/components/team-leader/dialogs/QcDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function QcDialog({ visit, profileId, onComplete, onClose }: Props) {
  const items = visit.qc_items ?? visit.services.map((s) => ({
    serviceId: s.id, serviceName: s.name, maxScore: 10,
  }))

  const [scores, setScores] = useState<Record<string, number>>({})

  const total    = Object.values(scores).reduce((a, b) => a + b, 0)
  const maxTotal = items.reduce((a, b) => a + b.maxScore, 0)

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: 'qc',
      serviceStatuses: {}, inventoryUsage: {}, photos: [],
      damageReport: { noted: false }, qcScores: scores,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>QC Visit</DialogTitle>
          <Badge variant="secondary" className="w-fit">Quality Check</Badge>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {items.map((item) => (
              <div key={item.serviceId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{item.serviceName}</Label>
                  <span className="text-xs text-muted-foreground">max {item.maxScore}</span>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={item.maxScore}
                  value={scores[item.serviceId] ?? ''}
                  onChange={(e) => {
                    const v = Math.min(item.maxScore, Math.max(0, Number(e.target.value)))
                    setScores((p) => ({ ...p, [item.serviceId]: v }))
                  }}
                  placeholder={`Score out of ${item.maxScore}`}
                  className="h-11"
                />
              </div>
            ))}

            <div className="rounded-lg border bg-muted/50 p-4 flex items-center justify-between">
              <span className="font-semibold">Total Score</span>
              <span className="text-lg font-bold">
                {total} / {maxTotal}
              </span>
            </div>
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button className="w-full min-h-11" onClick={handleSubmit}>Submit QC Scores</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
