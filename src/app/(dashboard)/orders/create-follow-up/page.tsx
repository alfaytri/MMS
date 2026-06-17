'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageContainer } from '@/components/shared/PageContainer'
import { useParentOrderForFollowUp } from '@/hooks/useParentOrderForFollowUp'
import { useFollowUpRequest } from '@/hooks/useFollowUpRequest'
import { FollowUpServiceSection } from '@/components/orders/FollowUpServiceSection'
import { PriorFollowUpsPanel } from '@/components/orders/PriorFollowUpsPanel'
import { toast } from 'sonner'
import type { ConfirmFollowUpBody } from '@/types/follow-ups'

export default function CreateFollowUpPage() {
  const router = useRouter()
  const params = useSearchParams()
  const from   = params.get('from')      // Path B
  const reqId  = params.get('request')   // Path A
  const { data: req } = useFollowUpRequest(reqId)
  const parentId = from ?? req?.parent_order_id ?? null
  const { data: parent, isLoading } = useParentOrderForFollowUp(parentId)

  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [services, setServices] = useState<{
    reused_services: ConfirmFollowUpBody['reused_services']
    new_services:    ConfirmFollowUpBody['new_services']
  }>({ reused_services: [], new_services: [] })

  useEffect(() => {
    if (!req) return
    if (req.requested_date) setDate(req.requested_date)
    if (req.requested_time_from && req.requested_time_to) {
      setTime(`${req.requested_time_from}-${req.requested_time_to}`)
    }
    if (req.notes) setNotes(req.notes)
  }, [req])

  const preSelected = useMemo(() => {
    if (!req) return undefined
    return new Set(req.services_to_followup.map((s) => s.order_service_id))
  }, [req])

  async function submit() {
    if (!parent) return
    if (!parent.team_id) { toast.error('Parent order has no team assigned'); return }
    if (!date) { toast.error('Date required'); return }
    if (services.reused_services.length === 0 && services.new_services.length === 0) {
      toast.error('Select at least one service')
      return
    }

    const body = {
      parent_order_id: parent.id,
      follow_up_request_id: reqId ?? null,
      team_id: parent.team_id,
      customer_id: parent.customer_id,
      address: parent.address,
      scheduled_date: date,
      scheduled_time: time || null,
      notes: notes || null,
      reused_services: services.reused_services,
      new_services: services.new_services,
    }
    const endpoint = reqId
      ? `/api/follow-up-requests/${reqId}/confirm`
      : '/api/orders/follow-up'

    setSubmitting(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errText = await res.json().catch(() => ({ error: 'Failed to confirm' }))
        toast.error(errText.error ?? 'Failed to confirm')
        return
      }
      toast.success('Follow-up scheduled')
      router.push('/orders')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading || !parent) {
    return (
      <PageContainer>
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 p-4">
        <div className="space-y-4">
          {req && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold">Follow-up request {req.request_number}</p>
              <p className="text-xs text-muted-foreground">Submitted {new Date(req.created_at).toLocaleString()}</p>
              {req.notes && <p className="mt-1 italic">&ldquo;{req.notes}&rdquo;</p>}
              {req.time_note && <p className="mt-1 text-xs">Time note: {req.time_note}</p>}
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parent order</p>
            <p className="text-sm font-medium">{parent.order_id} · {parent.customer_name}</p>
            <p className="text-xs text-muted-foreground">{parent.address ?? '—'}</p>
            {parent.team_name && <p className="text-xs text-muted-foreground">Team: {parent.team_name}</p>}
          </div>

          <FollowUpServiceSection
            parentServices={parent.services}
            initialSelectedIds={preSelected}
            onChange={setServices}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cf-date" className="text-sm font-semibold">Date</Label>
              <Input id="cf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-time" className="text-sm font-semibold">Time slot (e.g. 10:00-12:00)</Label>
              <Input id="cf-time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" placeholder="10:00-12:00" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-notes" className="text-sm font-semibold">Notes</Label>
            <Textarea id="cf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full h-12">
            {submitting ? 'Scheduling…' : 'Confirm & Schedule'}
          </Button>
        </div>

        <aside className="space-y-2">
          <PriorFollowUpsPanel parentOrderId={parent.id} />
        </aside>
      </div>
    </PageContainer>
  )
}
