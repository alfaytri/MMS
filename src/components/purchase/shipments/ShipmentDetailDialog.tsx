'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plane, Ship, Truck, PenLine, Plus, Trash2, MapPin, CircleDot, X } from 'lucide-react'
import { humanizeDbError } from '@/lib/dbErrors'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  useShipmentDetail, useUpdateShipmentStatus, useDeleteShipment, useAddScheduleRevision,
  useAddShipmentEvent, useUpdateShipmentLineQty, useRemoveShipmentLine,
  type ShipmentMode, type ShipmentStatus, type ScheduleLeg, type ScheduleRevisionType, type ShipmentEvent, type ShipmentLine,
} from '@/hooks/useShipments'
import { legHistory } from '@/lib/shipments/schedule'

const MODE_META: Record<ShipmentMode, { icon: typeof Plane; label: string }> = {
  air: { icon: Plane, label: 'Air' }, sea: { icon: Ship, label: 'Sea' },
  land: { icon: Truck, label: 'Land' }, manual: { icon: PenLine, label: 'Manual' },
}
const STATUS_META: Record<ShipmentStatus, { label: string; cls: string }> = {
  booked: { label: 'Booked', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_transit: { label: 'In transit', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  customs: { label: 'Customs', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-green-700 border-green-200' },
  delayed: { label: 'Delayed', cls: 'bg-red-50 text-red-700 border-red-200' },
}
const ALL_STATUSES: ShipmentStatus[] = ['booked', 'in_transit', 'customs', 'delivered', 'delayed']

function currentLocation(events: ShipmentEvent[]): string | null {
  const withLoc = [...events]
    .filter((e) => !!e.location)
    .sort((a, b) => new Date(b.normalizedTimestamp ?? b.date).getTime() - new Date(a.normalizedTimestamp ?? a.date).getTime())
  return withLoc[0]?.location ?? null
}

export function ShipmentDetailDialog({ shipmentId, onClose }: { shipmentId: string | null; onClose: () => void }) {
  const { data, isLoading } = useShipmentDetail(shipmentId)
  const updateStatus = useUpdateShipmentStatus()
  const del = useDeleteShipment()

  return (
    <Dialog open={!!shipmentId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-lg p-0 gap-0 overflow-hidden">
        {isLoading || !data ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (() => {
          const s = data.shipment
          const Mode = MODE_META[s.mode].icon
          const loc = currentLocation(s.events)
          const lastSyncMin = s.last_synced_at ? Math.round((Date.now() - new Date(s.last_synced_at).getTime()) / 60000) : null
          return (
            <>
              <div className="px-6 pt-6 pb-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted"><Mode className="h-5 w-5" /></div>
                      <h2 className="text-lg font-semibold font-mono tracking-tight">{s.shipment_number}</h2>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_META[s.status].cls)}>{STATUS_META[s.status].label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {MODE_META[s.mode].label}{s.carrier ? ` · ${s.carrier}` : ''}{s.tracking_number ? ` · ` : ''}
                      {s.tracking_number && <span className="font-mono">{s.tracking_number}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 min-h-[16px]">
                      <MapPin className="h-3 w-3" /> {loc ? <>Current location: <span className="text-foreground font-medium">{loc}</span></> : 'No location recorded yet'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>
                {s.tracking_number && (
                  <SyncBar shipmentId={s.id} trackingNumber={s.tracking_number} lastSyncMin={lastSyncMin} syncError={s.sync_error} />
                )}
              </div>
              <Separator />
              <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
                <PoSection lines={data.lines} shipmentId={s.id} />
                <ScheduleSection shipmentId={s.id} etd={s.etd} eta={s.eta} etdActual={s.etd_actual} etaActual={s.eta_actual} revisions={data.revisions} />
                <EventsSection shipmentId={s.id} events={s.events} />
              </div>
              <Separator />
              <div className="px-6 py-3 flex items-center justify-between gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background shadow-xs hover:bg-accent h-8 px-3 text-sm font-medium">Update status</DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {ALL_STATUSES.filter((x) => x !== s.status).map((x) => (
                      <DropdownMenuItem key={x} onClick={() => updateStatus.mutate({ id: s.id, status: x }, { onSuccess: () => toast.success('Status updated'), onError: (e) => toast.error(humanizeDbError(e)) })}>
                        {STATUS_META[x].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
                  onClick={() => del.mutate(s.id, {
                    onSuccess: () => {
                      if (s.tracking_number) fetch('/api/shipments/deregister-tracking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracking_number: s.tracking_number }) }).catch(() => {})
                      toast.success('Deleted'); onClose()
                    }, onError: (e) => toast.error(humanizeDbError(e)),
                  })}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              </div>
            </>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}

function SyncBar({ shipmentId, trackingNumber, lastSyncMin, syncError }: { shipmentId: string; trackingNumber: string; lastSyncMin: number | null; syncError: string | null }) {
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  async function sync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/shipments/register-tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracking_number: trackingNumber, shipment_id: shipmentId }) })
      const j = await res.json()
      if (!res.ok) { toast.error(j.error === 'quota_exceeded' ? 'Auto-sync unavailable: monthly limit reached' : (j.error ?? 'Sync failed')); return }
      await qc.invalidateQueries({ queryKey: queryKeys.shipments.all })
      await qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(shipmentId) })
      toast.success(`Synced — ${j.events?.length ?? 0} events`)
    } catch { toast.error('Sync failed') } finally { setSyncing(false) }
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <CircleDot className={cn('h-3 w-3', lastSyncMin !== null ? 'text-green-500' : 'text-slate-400')} />
      {lastSyncMin !== null ? `Synced ${lastSyncMin}m ago` : 'Never synced'}
      {syncError === 'quota_exceeded' && <span className="text-yellow-700">· monthly limit reached</span>}
      <button onClick={sync} disabled={syncing} className="ml-1 text-primary font-medium hover:underline disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync now'}</button>
    </div>
  )
}

function PoSection({ lines, shipmentId }: { lines: ShipmentLine[]; shipmentId: string }) {
  const updateQty = useUpdateShipmentLineQty()
  const removeLine = useRemoveShipmentLine()
  const groups = useMemo(() => {
    const m = new Map<string, { po_number: string; supplier_name: string | null; lines: ShipmentLine[] }>()
    for (const l of lines) {
      const g = m.get(l.po_id) ?? { po_number: l.po_number, supplier_name: l.supplier_name, lines: [] }
      g.lines.push(l); m.set(l.po_id, g)
    }
    return Array.from(m.entries())
  }, [lines])

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Purchase orders <span className="ml-1 text-xs font-normal text-muted-foreground">{groups.length} PO{groups.length !== 1 ? 's' : ''} · {lines.length} item{lines.length !== 1 ? 's' : ''}</span></h3>
      <div className="space-y-2">
        {groups.map(([poId, g]) => {
          const whole = g.lines.every((l) => l.qty === l.po_qty)
          return (
            <div key={poId} className="rounded-lg border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                <span className="font-mono text-sm font-semibold">{g.po_number}</span>
                <span className="text-xs text-muted-foreground truncate">{g.supplier_name ?? ''}</span>
                <span className={cn('ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', whole ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200')}>{whole ? 'Whole PO' : 'Partial'}</span>
              </div>
              {g.lines.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-1.5 border-b last:border-b-0 text-sm">
                  <div className="min-w-0">{l.item_name}{l.sku && <span className="text-[11px] text-muted-foreground font-mono ml-1.5">· {l.sku}</span>}</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} defaultValue={l.qty}
                      onBlur={(e) => { const q = Math.max(1, Number(e.target.value) || 1); if (q !== l.qty) updateQty.mutate({ id: l.id, qty: q, shipment_id: shipmentId }) }}
                      className="h-7 w-16 text-right tabular-nums text-xs" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">of {l.po_qty}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label="Remove line"
                      onClick={() => removeLine.mutate({ id: l.id, shipment_id: shipmentId })}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
function ScheduleSection({ shipmentId, etd, eta, etdActual, etaActual, revisions }: {
  shipmentId: string; etd: string | null; eta: string | null; etdActual: string | null; etaActual: string | null
  revisions: { leg: ScheduleLeg; revision_type: ScheduleRevisionType; date_value: string; reason: string | null; created_at: string }[]
}) {
  const addRev = useAddScheduleRevision()
  const [openLeg, setOpenLeg] = useState<ScheduleLeg | null>(null)
  const [form, setForm] = useState<{ type: ScheduleRevisionType; date: string; reason: string }>({ type: 'updated', date: '', reason: '' })

  function submit(leg: ScheduleLeg) {
    if (!form.date) { toast.error('Pick a date'); return }
    addRev.mutate({ shipment_id: shipmentId, leg, revision_type: form.type, date_value: form.date, reason: form.reason },
      { onSuccess: () => { toast.success('Revision added'); setOpenLeg(null); setForm({ type: 'updated', date: '', reason: '' }) }, onError: (e) => toast.error(humanizeDbError(e)) })
  }

  function Leg({ leg, label }: { leg: ScheduleLeg; label: string }) {
    const hist = legHistory(revisions, leg)
    const hasOriginal = hist.some((r) => r.revision_type === 'original')
    const hasActual = hist.some((r) => r.revision_type === 'actual')
    return (
      <div className="flex gap-3 py-2 border-b last:border-b-0">
        <div className="w-10 text-xs font-semibold text-muted-foreground pt-1">{label}</div>
        <div className="flex-1 flex flex-wrap items-center gap-1.5">
          {hist.length === 0 && <span className="text-xs text-muted-foreground">No {label} set yet.</span>}
          {hist.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
              <div className={cn('rounded-md border px-2 py-1', r.revision_type === 'actual' ? 'bg-green-50 border-green-200' : 'bg-muted/40')}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.revision_type}</div>
                <div className={cn('text-xs font-medium tabular-nums', r.revision_type === 'actual' && 'text-green-700')}>{formatDate(r.date_value)}</div>
                {r.reason && <div className="text-[10px] text-muted-foreground">{r.reason}</div>}
              </div>
            </div>
          ))}
          <button className="text-xs text-primary hover:underline ml-1" onClick={() => { setOpenLeg(openLeg === leg ? null : leg); setForm({ type: hasOriginal ? 'updated' : 'original', date: '', reason: '' }) }}>+ Add revision</button>
        </div>
        {openLeg === leg && (
          <div className="w-full mt-2 rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as ScheduleRevisionType }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original" disabled={hasOriginal}>Original</SelectItem>
                    <SelectItem value="updated">Updated</SelectItem>
                    <SelectItem value="actual" disabled={hasActual}>Actual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Date</Label><Input type="date" className="h-8" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Reason · optional</Label><Input className="h-8" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Port congestion" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setOpenLeg(null)}>Cancel</Button><Button size="sm" onClick={() => submit(leg)} disabled={addRev.isPending}>Add</Button></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Schedule <span className="ml-1 text-xs font-normal text-muted-foreground">original → updated → actual</span></h3>
      <div className="rounded-lg border px-3">
        <Leg leg="etd" label="ETD" />
        <Leg leg="eta" label="ETA" />
      </div>
      {(etd || eta || etdActual || etaActual) && (
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
          Current — ETD {etd ? formatDate(etd) : '—'}{etdActual ? ` (actual ${formatDate(etdActual)})` : ''} · ETA {eta ? formatDate(eta) : '—'}{etaActual ? ` (actual ${formatDate(etaActual)})` : ''}
        </p>
      )}
    </div>
  )
}

function EventsSection({ shipmentId, events }: { shipmentId: string; events: ShipmentEvent[] }) {
  const addEvent = useAddShipmentEvent()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', title: '', location: '', status: '', notes: '' })
  const sorted = useMemo(() => [...events].sort((a, b) => new Date(b.normalizedTimestamp ?? b.date).getTime() - new Date(a.normalizedTimestamp ?? a.date).getTime()), [events])

  function submit() {
    if (!form.date || !form.title.trim()) { toast.error('Date and title are required'); return }
    const ev: ShipmentEvent = { date: form.date, title: form.title.trim(), location: form.location.trim() || undefined, status: form.status.trim() || undefined, notes: form.notes.trim() || undefined }
    addEvent.mutate({ id: shipmentId, event: ev, currentEvents: events },
      { onSuccess: () => { toast.success('Event added'); setShowForm(false); setForm({ date: '', title: '', location: '', status: '', notes: '' }) }, onError: (e) => toast.error(humanizeDbError(e)) })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Timeline</h3>
        {!showForm && <Button variant="outline" size="sm" onClick={() => setShowForm(true)}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add event</Button>}
      </div>
      {sorted.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground"><MapPin className="h-7 w-7 mx-auto mb-1.5 opacity-40" /><p className="text-sm">No events yet</p></div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
          {sorted.map((ev, i) => (
            <div key={ev.hash ?? `${ev.date}-${i}`} className="relative pb-3.5 last:pb-0">
              <div className={cn('absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2 bg-background', i === 0 ? 'border-primary' : 'border-muted-foreground/30')} />
              <div className="text-sm font-medium">{ev.title || ev.location || ev.status || '—'}{ev.status && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ev.status}</span>}</div>
              {ev.location && <div className="text-xs text-muted-foreground">{ev.location}</div>}
              <div className="text-[11px] text-muted-foreground/80">{ev.date ? new Date(ev.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
              {ev.notes && <div className="text-xs text-muted-foreground mt-0.5">{ev.notes}</div>}
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <div className="rounded-lg border p-3 space-y-2.5 bg-muted/20 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Date *</Label><Input type="date" className="h-8" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div><Label className="text-xs">Title *</Label><Input className="h-8" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Documents submitted" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Location · optional</Label><Input className="h-8" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Port, city…" /></div>
            <div><Label className="text-xs">Status · optional</Label><Input className="h-8" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} placeholder="Cleared customs" /></div>
          </div>
          <div><Label className="text-xs">Notes · optional</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button><Button size="sm" onClick={submit} disabled={addEvent.isPending}>Add event</Button></div>
        </div>
      )}
    </div>
  )
}
