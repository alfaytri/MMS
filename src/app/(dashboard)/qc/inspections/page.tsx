'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ClipboardCheck, CheckCircle2, Loader2 } from 'lucide-react'
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
  useQcInspections, useSubmitQcInspection, type QcInspection,
} from '@/hooks/useQcInspections'

function PointsBadge({ points }: { points: number }) {
  return (
    <Badge className="gap-1 bg-indigo-600 text-white shrink-0">
      <ClipboardCheck className="h-3 w-3" /> QC {points}
    </Badge>
  )
}

function Breakdown({ items }: { items: QcInspection['breakdown'] }) {
  if (!items?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((b) => (
        <span key={b.scenario} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {b.label} <span className="font-semibold">+{b.points}</span>
        </span>
      ))}
    </div>
  )
}

export default function QcInspectionsPage() {
  const { data: inspections = [], isLoading } = useQcInspections('mine')
  const submit = useSubmitQcInspection()
  const [target, setTarget] = useState<QcInspection | null>(null)
  const [findings, setFindings] = useState('')

  async function handleSubmit() {
    if (!target) return
    try {
      await submit.mutateAsync({ inspectionId: target.id, findings: findings.trim() || undefined })
      toast.success(`Inspection for ${target.order_number ?? 'order'} submitted for review`)
      setTarget(null)
      setFindings('')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to submit')
    }
  }

  return (
    <PageWrapper>
      <div>
        <h1 className="text-2xl 2xl:text-3xl font-bold">My QC Inspections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders assigned to you for a pre-booking quality inspection. Inspect the site, record your
          findings, and submit for the Operations Manager to review and book.
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : inspections.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No inspections assigned to you</p>
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
                <PointsBadge points={i.points} />
              </div>

              <Breakdown items={i.breakdown} />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {i.division && <span className="capitalize">{i.division}</span>}
                {i.scheduled_date && <span>· Visit {format(new Date(i.scheduled_date), 'dd MMM yyyy')}</span>}
                <span>· QC timing: <span className="capitalize">{i.timing}</span></span>
              </div>

              <div className="pt-1 border-t">
                <Button className="w-full gap-1.5" onClick={() => { setTarget(i); setFindings(i.findings ?? '') }}>
                  Record findings &amp; submit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(v) => { if (!v) setTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Inspection — {target?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Record what you found on site. This goes to the Operations Manager to book or reject.
            </p>
            <Textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="e.g. Site accessible, correct unit confirmed, no rework needed"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Submit for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
