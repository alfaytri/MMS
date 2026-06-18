'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useCreateFollowUpRequest } from '@/hooks/useCreateFollowUpRequest'

interface Service { id: string; name: string }
interface Props {
  parentOrderId: string
  parentOrderNumber: string
  customerName: string
  services: Service[]
}

// 30-min time slots from 07:00 to 21:00 inclusive
const SLOT_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 21; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    if (h !== 21) out.push(`${String(h).padStart(2, '0')}:30`)
  }
  return out
})()

function formatSlotLabel(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${mStr} ${period}`
}

function isAfter(a: string, b: string): boolean {
  return a > b // 'HH:MM' strings sort correctly lexicographically
}

export function RequestFollowUpForm({ parentOrderId, parentOrderNumber, customerName, services }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [notes, setNotes] = useState('')
  const [conflictMsg, setConflictMsg] = useState<string | null>(null)

  const mut = useCreateFollowUpRequest()

  const toOptions = useMemo(
    () => from ? SLOT_OPTIONS.filter((s) => isAfter(s, from)) : SLOT_OPTIONS,
    [from]
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    setConflictMsg(null)
    if (selected.size === 0) { toast.error('Pick at least one service'); return }
    if (!date) { toast.error('Pick a date'); return }
    if (!from || !to) { toast.error('Pick a From and To time'); return }
    if (!isAfter(to, from)) { toast.error('To time must be after From time'); return }

    const body = {
      parent_order_id: parentOrderId,
      services_to_followup: services
        .filter((s) => selected.has(s.id))
        .map((s) => ({ order_service_id: s.id, name: s.name })),
      requested_date: date,
      requested_time_from: from,
      requested_time_to:   to,
      time_note: null,
      notes: notes || null,
    }

    try {
      const res = await mut.mutateAsync(body)
      if (res.ok) {
        toast.success(`Request submitted: ${res.request_number}`)
        router.back()
        return
      }
      // 409 conflict — server says the team is busy in this window.
      setConflictMsg('Team time occupied — please pick another time.')
    } catch (err) {
      toast.error((err as Error).message || 'Submission failed')
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From order</p>
        <p className="text-sm font-medium">{parentOrderNumber}</p>
        <p className="text-sm text-muted-foreground">{customerName}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Services needing follow-up</Label>
        {services.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No services on this order.</p>
        ) : (
          services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded border p-3 min-h-11 cursor-pointer">
              <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
              <span className="text-sm">{s.name}</span>
            </label>
          ))
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="fur-date" className="text-sm font-semibold">Date</Label>
        <Input
          id="fur-date"
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setConflictMsg(null) }}
          className="h-11"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="fur-from" className="text-sm font-semibold">From</Label>
          <Select value={from} onValueChange={(v) => { setFrom(v); if (to && !isAfter(to, v)) setTo(''); setConflictMsg(null) }}>
            <SelectTrigger id="fur-from" className="h-11">
              <SelectValue placeholder="Pick start time" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {SLOT_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{formatSlotLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fur-to" className="text-sm font-semibold">To</Label>
          <Select value={to} onValueChange={(v) => { setTo(v); setConflictMsg(null) }} disabled={!from}>
            <SelectTrigger id="fur-to" className="h-11">
              <SelectValue placeholder={from ? 'Pick end time' : 'Pick From first'} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {toOptions.map((s) => (
                <SelectItem key={s} value={s}>{formatSlotLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {conflictMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {conflictMsg}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="fur-notes" className="text-sm font-semibold">Notes for office</Label>
        <Textarea
          id="fur-notes"
          placeholder="e.g. items in shop for cleaning, will take 2 days"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <Button onClick={submit} disabled={mut.isPending} className="w-full h-12 sticky bottom-3">
        {mut.isPending ? 'Submitting…' : 'Submit follow-up request'}
      </Button>
    </div>
  )
}
