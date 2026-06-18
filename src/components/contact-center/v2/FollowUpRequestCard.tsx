'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { FollowUpRequestWithContext } from '@/types/follow-ups'

function urgency(req: FollowUpRequestWithContext): 'urgent' | 'soon' | 'none' {
  if (!req.requested_date) return 'none'
  const d = new Date(`${req.requested_date}T00:00:00`)
  const hrs = (d.getTime() - Date.now()) / (1000 * 60 * 60)
  if (hrs <= 24) return 'urgent'
  if (hrs <= 48) return 'soon'
  return 'none'
}

interface Props {
  req: FollowUpRequestWithContext
  onChanged: () => void
}

export function FollowUpRequestCard({ req, onChanged }: Props) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const u = urgency(req)

  async function reject() {
    if (!reason.trim()) { toast.error('Reason required'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/follow-up-requests/${req.id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) { toast.error('Reject failed'); return }
      toast.success('Request rejected')
      setRejectOpen(false)
      setReason('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={cn(
        'rounded-lg border bg-card p-3 space-y-2',
        u === 'urgent' && 'border-red-300 bg-red-50',
        u === 'soon'   && 'border-amber-300 bg-amber-50',
      )}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">Follow-up</Badge>
          {u === 'urgent' && <Badge className="bg-red-600 text-white text-[10px]">Urgent — confirm today</Badge>}
          {u === 'soon'   && <Badge className="bg-amber-500 text-white text-[10px]">Confirm soon</Badge>}
        </div>
        <p className="text-sm font-medium">{req.customer_name} · {req.parent_order_number}</p>
        <p className="text-xs text-muted-foreground">
          {req.requested_date
            ? `${req.requested_date}${req.requested_time_from ? `, ${req.requested_time_from}–${req.requested_time_to}` : ''}`
            : (req.time_note ?? 'No time set')}
        </p>
        <p className="text-xs">
          Services: {req.services_to_followup.map((s) => s.name).join(', ')}
        </p>
        {req.notes && <p className="text-xs italic text-muted-foreground">&ldquo;{req.notes}&rdquo;</p>}
        <p className="text-[11px] text-muted-foreground">
          Requested by {req.requested_by_name} · {req.team_name}
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm" className="h-8 text-xs flex-1"
            onClick={() => window.open(`/orders/create-follow-up?request=${req.id}`, '_blank')}
          >
            Confirm &amp; Schedule
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject follow-up request</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Reason for rejection"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={reject} disabled={busy}>{busy ? 'Rejecting…' : 'Reject'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
