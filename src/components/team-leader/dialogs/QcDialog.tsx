// src/components/team-leader/dialogs/QcDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhotoCapture } from '../shared/PhotoCapture'
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
  const [qcNotes, setQcNotes] = useState('')
  const [photos, setPhotos] = useState<Blob[]>([])

  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  const maxTotal = items.reduce((a, b) => a + b.maxScore, 0)
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0
  const pctColor = pct >= 80 ? 'text-green-600 bg-green-50 border-green-200'
    : pct >= 50 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-red-600 bg-red-50 border-red-200'

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: 'qc',
      serviceStatuses: {}, inventoryUsage: {}, photos,
      damageReport: { noted: false }, qcScores: scores,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0 gap-0">
        <div className="px-5 py-3 bg-secondary text-secondary-foreground shrink-0">
          <p className="text-base font-bold">QC Visit</p>
          <p className="text-[11px] opacity-90">{visit.scheduled_time ?? ''} · {visit.customer_name}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Requested Services — VIEW ONLY */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Requested Services</p>
              <p className="text-[11px] text-muted-foreground">QC assessment of another team's work</p>
              {visit.services.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1">
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">× {s.qty} · QAR {s.unit_price}</span>
                </div>
              ))}
            </div>

            {/* Agent Notes */}
            {visit.followup_context?.agent_note && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Agent Notes</p>
                <p className="text-sm">{visit.followup_context.agent_note}</p>
              </div>
            )}

            {/* QC Assessment */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  <p className="text-sm font-semibold">QC Assessment</p>
                </div>
                <Badge className={cn('text-xs border', pctColor)}>
                  {total}/{maxTotal} ({pct}%)
                </Badge>
              </div>

              {items.map((item) => {
                const current = scores[item.serviceId] ?? 0
                return (
                  <div key={item.serviceId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{item.serviceName}</p>
                      <Badge variant="outline" className="text-xs">{current}/{item.maxScore}</Badge>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: item.maxScore }, (_, i) => {
                        const dotScore = i + 1
                        const isActive = current >= dotScore
                        const dotPct = Math.round((dotScore / item.maxScore) * 100)
                        const dotColor = isActive
                          ? (dotPct >= 80 ? 'bg-green-500' : dotPct >= 50 ? 'bg-amber-500' : 'bg-red-500')
                          : 'bg-muted'
                        return (
                          <button
                            key={dotScore}
                            type="button"
                            className={cn('h-8 flex-1 rounded-md transition-colors', dotColor)}
                            onClick={() => setScores((p) => ({ ...p, [item.serviceId]: dotScore === current ? 0 : dotScore }))}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* QC Notes */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-2">
              <p className="text-sm font-semibold">QC Notes</p>
              <Textarea
                placeholder="Notes about the quality assessment..."
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Photo Evidence */}
            <PhotoCapture visitId={visit.id} label="Photo Evidence" photos={photos} onChange={setPhotos} />
          </div>
        </div>

        <div className="p-4 border-t shrink-0 flex gap-2">
          <Button variant="outline" className="flex-1 min-h-11" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 min-h-11" onClick={handleSubmit}>
            Submit Assessment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
