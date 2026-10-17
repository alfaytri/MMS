'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, AlertTriangle, Plus, ChevronRight, MapPin } from 'lucide-react'
import { humanizeDbError } from '@/lib/dbErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  useAddShipmentEvent, useUpdateShipmentStatus, useAddScheduleRevision,
  type ShipmentEvent, type ShipmentStatus, type ScheduleLeg, type ScheduleRevision,
} from '@/hooks/useShipments'

type StageKey = Extract<ShipmentStatus, 'booked' | 'in_transit' | 'customs' | 'delivered'>
type StageDef = { key: StageKey; label: string; leg?: ScheduleLeg; hint: string }

const STAGES: StageDef[] = [
  { key: 'booked', label: 'Booked', hint: 'Confirmed with carrier / forwarder' },
  { key: 'in_transit', label: 'In transit', leg: 'etd', hint: 'Departed origin' },
  { key: 'customs', label: 'Customs', hint: 'Clearing at destination' },
  { key: 'delivered', label: 'Delivered', leg: 'eta', hint: 'Arrived / handed over' },
]

export function StageTracker({ shipmentId, status, events, revisions }: {
  shipmentId: string
  status: ShipmentStatus
  events: ShipmentEvent[]
  revisions: ScheduleRevision[]
}) {
  const addEvent = useAddShipmentEvent()
  const updateStatus = useUpdateShipmentStatus()
  const addRev = useAddScheduleRevision()
  const userName = useCurrentUser().data?.name ?? undefined

  const today = new Date().toISOString().slice(0, 10)

  // Latest stage-marking event per stage — this is what drives "reached" + the date/who stamp.
  const stageEvent = useMemo(() => {
    const m = new Map<string, ShipmentEvent>()
    for (const e of events) {
      if (!e.stage) continue
      const t = new Date(e.normalizedTimestamp ?? e.date).getTime()
      const prev = m.get(e.stage)
      if (!prev || t >= new Date(prev.normalizedTimestamp ?? prev.date).getTime()) m.set(e.stage, e)
    }
    return m
  }, [events])

  const statusIdx = STAGES.findIndex((s) => s.key === status)
  // Reached = a stage-mark event exists, OR (back-compat for pre-tracker shipments)
  // the current status is at/after this stage.
  const isReached = (i: number) => stageEvent.has(STAGES[i].key) || (statusIdx >= 0 && i <= statusIdx)
  const nextIdx = STAGES.findIndex((_, i) => !isReached(i))
  const isDelivered = isReached(STAGES.length - 1)
  const isDelayed = status === 'delayed'
  const hasActual = (leg: ScheduleLeg) => revisions.some((r) => r.leg === leg && r.revision_type === 'actual')

  const [markKey, setMarkKey] = useState<StageKey | null>(null)
  const [markDate, setMarkDate] = useState(today)
  const [markNote, setMarkNote] = useState('')
  const [showDelay, setShowDelay] = useState(false)
  const [delayNote, setDelayNote] = useState('')
  const [busy, setBusy] = useState(false)

  function openMark(key: StageKey) { setMarkKey(key); setMarkDate(today); setMarkNote('') }

  async function confirmMark() {
    const stage = STAGES.find((s) => s.key === markKey)
    if (!stage) return
    if (!markDate) { toast.error('Pick a date'); return }
    setBusy(true)
    try {
      await addEvent.mutateAsync({
        id: shipmentId, currentEvents: events,
        event: { date: markDate, title: stage.label, stage: stage.key, status: stage.label, by: userName, notes: markNote.trim() || undefined },
      })
      await updateStatus.mutateAsync({ id: shipmentId, status: stage.key })
      if (stage.leg && !hasActual(stage.leg)) {
        await addRev.mutateAsync({ shipment_id: shipmentId, leg: stage.leg, revision_type: 'actual', date_value: markDate, reason: markNote.trim() || null })
      }
      toast.success(`Marked ${stage.label}`)
      setMarkKey(null)
    } catch (e) { toast.error(humanizeDbError(e)) } finally { setBusy(false) }
  }

  async function confirmDelay() {
    setBusy(true)
    try {
      await addEvent.mutateAsync({
        id: shipmentId, currentEvents: events,
        event: { date: today, title: 'Delayed', status: 'Delayed', by: userName, notes: delayNote.trim() || undefined },
      })
      await updateStatus.mutateAsync({ id: shipmentId, status: 'delayed' })
      toast.success('Flagged as delayed')
      setShowDelay(false); setDelayNote('')
    } catch (e) { toast.error(humanizeDbError(e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Progress</h3>
        {!isDelivered && !showDelay && markKey === null && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600" onClick={() => setShowDelay(true)}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Flag delay
          </Button>
        )}
      </div>

      {isDelayed && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Flagged as delayed — mark the next stage below when it moves to resume.
        </div>
      )}

      {showDelay && (
        <div className="mb-3 rounded-lg border p-3 space-y-2 bg-muted/20">
          <Label className="text-xs">Reason for delay · optional</Label>
          <Input className="h-8" value={delayNote} onChange={(e) => setDelayNote(e.target.value)} placeholder="Port congestion, missing docs…" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowDelay(false); setDelayNote('') }}>Cancel</Button>
            <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelay} disabled={busy}>Flag delay</Button>
          </div>
        </div>
      )}

      <div className="relative pl-6">
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
        {STAGES.map((stage, i) => {
          const reached = isReached(i)
          const ev = stageEvent.get(stage.key)
          const isNext = i === nextIdx
          return (
            <div key={stage.key} className="relative pb-4 last:pb-0">
              <div className={cn('absolute -left-6 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 bg-background',
                reached ? 'border-green-500' : isNext ? 'border-primary' : 'border-muted-foreground/30')}>
                {reached ? <Check className="h-3 w-3 text-green-600" /> : <span className={cn('h-1.5 w-1.5 rounded-full', isNext ? 'bg-primary' : 'bg-muted-foreground/30')} />}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium', !reached && !isNext && 'text-muted-foreground')}>{stage.label}</div>
                  {reached && ev ? (
                    <div className="text-[11px] text-muted-foreground">{formatDate(ev.date)}{ev.by ? ` · by ${ev.by}` : ''}{ev.notes ? ` — ${ev.notes}` : ''}</div>
                  ) : reached ? (
                    <div className="text-[11px] text-muted-foreground">Reached</div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">{stage.hint}</div>
                  )}
                </div>
                {markKey !== stage.key && (
                  reached ? (
                    <button className="text-[11px] text-muted-foreground hover:text-foreground hover:underline shrink-0" onClick={() => openMark(stage.key)}>Edit</button>
                  ) : (
                    <Button size="sm" variant={isNext ? 'default' : 'outline'} className="h-7 shrink-0" onClick={() => openMark(stage.key)}>Mark {stage.label.toLowerCase()}</Button>
                  )
                )}
              </div>
              {markKey === stage.key && (
                <div className="mt-2 rounded-lg border p-3 space-y-2 bg-muted/20">
                  <div><Label className="text-xs">Date</Label><Input type="date" className="h-8" value={markDate} onChange={(e) => setMarkDate(e.target.value)} /></div>
                  <div><Label className="text-xs">Note · optional</Label><Input className="h-8" value={markNote} onChange={(e) => setMarkNote(e.target.value)} placeholder="Vessel, remarks…" /></div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMarkKey(null)}>Cancel</Button>
                    <Button size="sm" onClick={confirmMark} disabled={busy}>Confirm</Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ActivityLog shipmentId={shipmentId} events={events} userName={userName} today={today} />
    </div>
  )
}

function ActivityLog({ shipmentId, events, userName, today }: { shipmentId: string; events: ShipmentEvent[]; userName?: string; today: string }) {
  const addEvent = useAddShipmentEvent()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ date: string; location: string; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const sorted = useMemo(() => [...events].sort((a, b) => new Date(b.normalizedTimestamp ?? b.date).getTime() - new Date(a.normalizedTimestamp ?? a.date).getTime()), [events])

  async function addNote() {
    if (!form) return
    if (!form.note.trim()) { toast.error('Write a note'); return }
    setBusy(true)
    try {
      await addEvent.mutateAsync({
        id: shipmentId, currentEvents: events,
        event: { date: form.date || today, title: form.note.trim(), location: form.location.trim() || undefined, by: userName },
      })
      toast.success('Note added'); setForm(null)
    } catch (e) { toast.error(humanizeDbError(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mt-4 border-t pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        Activity log ({events.length})
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <div className="flex justify-end">
            {!form && <Button variant="outline" size="sm" onClick={() => setForm({ date: today, location: '', note: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" /> Note</Button>}
          </div>
          {form && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Date</Label><Input type="date" className="h-8" value={form.date} onChange={(e) => setForm((f) => f && { ...f, date: e.target.value })} /></div>
                <div><Label className="text-xs">Location · optional</Label><Input className="h-8" value={form.location} onChange={(e) => setForm((f) => f && { ...f, location: e.target.value })} placeholder="Port, city…" /></div>
              </div>
              <div><Label className="text-xs">Note *</Label><Input className="h-8" value={form.note} onChange={(e) => setForm((f) => f && { ...f, note: e.target.value })} placeholder="Documents submitted, inspection booked…" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancel</Button>
                <Button size="sm" onClick={addNote} disabled={busy}>Add note</Button>
              </div>
            </div>
          )}
          {sorted.length === 0 ? (
            <div className="text-center py-5 text-muted-foreground"><MapPin className="h-6 w-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No activity yet</p></div>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
              {sorted.map((ev, i) => (
                <div key={ev.hash ?? `${ev.date}-${i}`} className="relative pb-3 last:pb-0">
                  <div className={cn('absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2 bg-background', ev.stage ? 'border-green-500' : i === 0 ? 'border-primary' : 'border-muted-foreground/30')} />
                  <div className="text-sm font-medium flex items-center gap-2">
                    {ev.title || ev.status || '—'}
                    {ev.stage && <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-normal">stage</span>}
                  </div>
                  {ev.location && <div className="text-xs text-muted-foreground">{ev.location}</div>}
                  <div className="text-[11px] text-muted-foreground/80">{ev.date ? new Date(ev.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}{ev.by ? ` · ${ev.by}` : ''}</div>
                  {ev.notes && <div className="text-xs text-muted-foreground mt-0.5">{ev.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
