'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useCreateFollowUpRequest } from '@/hooks/useCreateFollowUpRequest'
import type { FreeSlot } from '@/types/follow-ups'

interface Service { id: string; name: string }
interface Props {
  parentOrderId: string
  parentOrderNumber: string
  customerName: string
  services: Service[]
}

export function RequestFollowUpForm({ parentOrderId, parentOrderNumber, customerName, services }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [notes, setNotes] = useState('')
  const [conflict, setConflict] = useState<FreeSlot[] | null>(null)
  const [timeNote, setTimeNote] = useState('')

  const mut = useCreateFollowUpRequest()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(useNote = false) {
    if (selected.size === 0) { toast.error('Pick at least one service'); return }
    if (!useNote && (!date || !from || !to)) { toast.error('Pick a date and time range'); return }

    const body = {
      parent_order_id: parentOrderId,
      services_to_followup: services
        .filter((s) => selected.has(s.id))
        .map((s) => ({ order_service_id: s.id, name: s.name })),
      requested_date: useNote ? null : date,
      requested_time_from: useNote ? null : from,
      requested_time_to:   useNote ? null : to,
      time_note: useNote ? (timeNote || `${date} ${from}-${to}`) : null,
      notes: notes || null,
    }

    try {
      const res = await mut.mutateAsync(body)
      if (res.ok) {
        toast.success(`Request submitted: ${res.request_number}`)
        router.back()
        return
      }
      setConflict(res.conflict.free_slots)
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
            <label key={s.id} className="flex items-center gap-2 rounded border p-3 min-h-11">
              <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
              <span className="text-sm">{s.name}</span>
            </label>
          ))
        )}
      </div>

      {!conflict ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="fur-date" className="text-sm font-semibold">Date</Label>
            <Input id="fur-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="fur-from" className="text-sm font-semibold">From</Label>
              <Input id="fur-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fur-to" className="text-sm font-semibold">To</Label>
              <Input id="fur-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 min-h-[160px]">
          <p className="text-sm font-semibold text-amber-900">Team busy in that window</p>
          {conflict.length === 0 ? (
            <p className="text-xs text-amber-900">No free slots in the next two days.</p>
          ) : (
            conflict.map((s) => (
              <Button
                key={`${s.date}-${s.from}`}
                variant="outline"
                size="sm"
                className="w-full justify-start h-11"
                onClick={() => {
                  setDate(s.date); setFrom(s.from); setTo(s.to); setConflict(null)
                }}
              >
                {s.date} · {s.from}–{s.to}
              </Button>
            ))
          )}
          <Textarea
            placeholder="Or, save the original time as a note (e.g. 'customer wants Tue afternoon')"
            value={timeNote}
            onChange={(e) => setTimeNote(e.target.value)}
            rows={2}
          />
          <Button variant="outline" size="sm" className="w-full h-11" onClick={() => submit(true)}>
            Save as note instead
          </Button>
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

      <Button onClick={() => submit(false)} disabled={mut.isPending} className="w-full h-12 sticky bottom-3">
        {mut.isPending ? 'Submitting…' : 'Submit follow-up request'}
      </Button>
    </div>
  )
}
