'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ShieldCheck, CheckCircle2, Loader2, ClipboardCheck } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  useQcInspections, useBookQcInspection, useRejectQcInspection, useFlagQcRework, type QcInspection,
} from '@/hooks/useQcInspections'

export default function QcReviewPage() {
  const { data: inspections = [], isLoading } = useQcInspections('review')
  const book = useBookQcInspection()
  const reject = useRejectQcInspection()
  const rework = useFlagQcRework()
  const [rejectTarget, setRejectTarget] = useState<QcInspection | null>(null)
  const [reworkTarget, setReworkTarget] = useState<QcInspection | null>(null)
  const [reason, setReason] = useState('')
  const [reworkNote, setReworkNote] = useState('')

  async function handleBook(i: QcInspection) {
    const isPost = i.stage === 'post_completion'
    try {
      await book.mutateAsync({ inspectionId: i.id })
      toast.success(isPost ? `${i.order_number ?? 'Order'} signed off — QC passed` : `${i.order_number ?? 'Order'} booked — QC passed`)
    } catch (e) {
      toast.error((e as Error).message || 'Failed')
    }
  }

  async function handleRework() {
    if (!reworkTarget) return
    try {
      await rework.mutateAsync({ inspectionId: reworkTarget.id, notes: reworkNote.trim() || undefined })
      toast.success(`${reworkTarget.order_number ?? 'Order'} flagged for rework`)
      setReworkTarget(null)
      setReworkNote('')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to flag')
    }
  }

  async function handleReject() {
    if (!rejectTarget) return
    if (!reason.trim()) { toast.error('Enter a reason'); return }
    try {
      await reject.mutateAsync({ inspectionId: rejectTarget.id, reason: reason.trim() })
      toast.success(`${rejectTarget.order_number ?? 'Order'} rejected — order cancelled`)
      setRejectTarget(null)
      setReason('')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to reject')
    }
  }

  return (
    <PageWrapper>
      <div>
        <h1 className="text-2xl 2xl:text-3xl font-bold">QC Review</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspections the Quality Analyst has completed. Pre-booking: book to schedule the held order,
          or reject to cancel it. Post-completion: sign off, or flag for rework.
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : inspections.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No inspections awaiting review</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {inspections.map((i) => (
            <Card key={i.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono font-semibold">{i.order_number ?? '—'}</p>
                  <p className="text-sm text-muted-foreground truncate">{i.customer_name ?? 'Unknown customer'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {i.stage === 'post_completion' ? 'post-completion' : 'pre-booking'}
                  </span>
                  <Badge className="gap-1 bg-indigo-600 text-white">
                    <ClipboardCheck className="h-3 w-3" /> QC {i.points}
                  </Badge>
                </div>
              </div>

              {i.breakdown?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {i.breakdown.map((b) => (
                    <span key={b.scenario} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {b.label} <span className="font-semibold">+{b.points}</span>
                    </span>
                  ))}
                </div>
              )}

              {i.findings && (
                <p className="rounded bg-muted/60 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  <span className="font-semibold text-foreground">Analyst findings: </span>{i.findings}
                </p>
              )}

              {i.photo_urls?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {i.photo_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Open photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="QC photo" className="h-16 w-16 rounded border object-cover" />
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {i.analyst_name && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {i.analyst_name}</span>}
                {i.scheduled_date && <span>· Visit {format(new Date(i.scheduled_date), 'dd MMM yyyy')}</span>}
                <span>· timing <span className="capitalize">{i.timing}</span></span>
              </div>

              <div className="flex gap-2 pt-1 border-t">
                <Button className="flex-1 gap-1.5" onClick={() => handleBook(i)} disabled={book.isPending}>
                  {book.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {i.stage === 'post_completion' ? 'Sign off' : 'Book order'}
                </Button>
                {i.stage === 'post_completion' ? (
                  <Button
                    variant="outline"
                    className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => { setReworkTarget(i); setReworkNote('') }}
                  >
                    Flag for rework
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => { setRejectTarget(i); setReason('') }}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) setRejectTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject QC — {rejectTarget?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              This cancels the held order and frees its team slot. Give a reason:
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Site not ready — reschedule after customer confirms access"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
              disabled={reject.isPending || !reason.trim()}
            >
              {reject.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Reject &amp; cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reworkTarget} onOpenChange={(v) => { if (!v) setReworkTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Flag for rework — {reworkTarget?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Records this job as needing rework. If auto-backwork is enabled in QC settings it also
              creates the redo order now; otherwise the call centre books the redo. Add a note (optional):
            </p>
            <Textarea
              value={reworkNote}
              onChange={(e) => setReworkNote(e.target.value)}
              placeholder="e.g. Drain left leaking — needs to be resealed"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReworkTarget(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={handleRework}
              disabled={rework.isPending}
            >
              {rework.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Flag for rework
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
