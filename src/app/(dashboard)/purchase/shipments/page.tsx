'use client'

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plane, Ship, Truck, PenLine, Eye, Archive, Plus, RefreshCw,
  Package, MapPin, Clock, CheckCircle2, AlertTriangle, CircleDot,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/utils/formatters'
import {
  useShipments, useCreateShipment, useUpdateShipmentStatus, useAddShipmentEvent, useArchiveShipment,
  type Shipment, type ShipmentMode, type ShipmentStatus, type ShipmentEvent,
} from '@/hooks/useShipments'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import type { ColumnDef } from '@tanstack/react-table'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_META: Record<ShipmentMode, { icon: typeof Plane; label: string; color: string }> = {
  air:    { icon: Plane,   label: 'Air',    color: 'text-sky-600'    },
  sea:    { icon: Ship,    label: 'Sea',    color: 'text-blue-600'   },
  land:   { icon: Truck,   label: 'Land',   color: 'text-amber-600'  },
  manual: { icon: PenLine, label: 'Manual', color: 'text-slate-500'  },
}

const STATUS_CONFIG: Record<ShipmentStatus, { label: string; color: string; bg: string; icon: typeof Package }> = {
  booked:     { label: 'Booked',     color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: Package        },
  in_transit: { label: 'In Transit', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: RefreshCw      },
  customs:    { label: 'Customs',    color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: Clock          },
  delivered:  { label: 'Delivered',  color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: CheckCircle2   },
  delayed:    { label: 'Delayed',    color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: AlertTriangle  },
}

const EVENT_STATUS_LABELS: Record<string, string> = {
  in_transit: 'In Transit',
  delivered: 'Delivered',
  delayed: 'Delayed',
  customs: 'Customs',
  booked: 'Booked',
  info_received: 'Info Received',
  out_for_delivery: 'Out for Delivery',
  available_for_pickup: 'Available for Pickup',
  picked_up: 'Picked Up',
  expired: 'Expired',
  not_found: 'Not Found',
}

const ALL_STATUSES: ShipmentStatus[] = ['booked', 'in_transit', 'customs', 'delivered', 'delayed']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ShipmentStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function ModeBadge({ mode }: { mode: ShipmentMode }) {
  const m = MODE_META[mode]
  const Icon = m.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', m.color)}>
      <Icon className="h-4 w-4" />
      {m.label}
    </span>
  )
}

function deriveEta(events: ShipmentEvent[]): string | null {
  if (!events || events.length === 0) return null
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.normalizedTimestamp ?? a.date ?? 0).getTime()
    const tb = new Date(b.normalizedTimestamp ?? b.date ?? 0).getTime()
    return tb - ta
  })
  const latest = sorted[0]
  if (latest.status === 'delivered') return latest.normalizedTimestamp ?? latest.date ?? null
  return null
}

function daysFromNow(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff === 0) return '(today)'
  if (diff > 0) return `(${diff}d away)`
  return `(${Math.abs(diff)}d ago)`
}

// ─── Create Shipment Dialog ───────────────────────────────────────────────────

function CreateShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: pos } = usePurchaseOrders({ status: undefined })
  const createShipment = useCreateShipment()
  const [form, setForm] = useState({
    po_id: '', mode: 'air' as ShipmentMode, tracking_number: '',
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.po_id) { toast.error('Select a PO'); return }
    if (!form.tracking_number) { toast.error('Tracking number is required'); return }
    createShipment.mutate(
      {
        po_id: form.po_id,
        mode: form.mode,
        tracking_number: form.tracking_number,
      },
      {
        onSuccess: (newShipment) => {
          toast.success('Shipment created')
          onOpenChange(false)
          setForm({ po_id: '', mode: 'air', tracking_number: '' })
          fetch('/api/shipments/register-tracking', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tracking_number: newShipment.tracking_number,
              shipment_id: newShipment.id,
            }),
          }).catch(err => console.error('[auto-register]', err))
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const approvedPos = (pos ?? []).filter((p) => p.status === 'approved' || p.status === 'partially_received')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Shipment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ship-po">Purchase Order</Label>
            <select id="ship-po" value={form.po_id} onChange={(e) => set('po_id', e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <option value="">Select PO…</option>
              {approvedPos.map((p) => (
                <option key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ship-mode">Mode</Label>
            <select id="ship-mode" value={form.mode} onChange={(e) => set('mode', e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <option value="air">✈️ Air</option>
              <option value="sea">🚢 Sea</option>
              <option value="land">🚛 Land</option>
              <option value="manual">✏️ Manual</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ship-tracking-number">Tracking Number</Label>
            <Input id="ship-tracking-number" className="h-10" value={form.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} placeholder="Enter tracking number" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createShipment.isPending}>
              {createShipment.isPending ? 'Creating…' : 'Create Shipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Shipment Detail Dialog ───────────────────────────────────────────────────

function ShipmentDetailDialog({
  shipment,
  onClose,
}: {
  shipment: Shipment | null
  onClose: () => void
}) {
  const updateStatus = useUpdateShipmentStatus()
  const addEvent = useAddShipmentEvent()
  const archiveShipment = useArchiveShipment()
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({ date: '', location: '', status: '', notes: '' })

  const queryClient = useQueryClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncAmbiguous, setSyncAmbiguous] = useState<{ candidates: number[] } | null>(null)
  const [selectedCarrierCode, setSelectedCarrierCode] = useState<number | ''>('')

  const sortedEvents = useMemo(
    () =>
      [...(shipment?.events ?? [])].sort((a, b) => {
        const ta = new Date(a.normalizedTimestamp ?? a.date ?? 0).getTime()
        const tb = new Date(b.normalizedTimestamp ?? b.date ?? 0).getTime()
        return tb - ta
      }),
    [shipment?.events]
  )

  async function handleSyncNow(carrierCode?: number) {
    if (!shipment || isSyncing) return
    setIsSyncing(true)
    setSyncAmbiguous(null)
    setSelectedCarrierCode('')
    try {
      const res = await fetch('/api/shipments/register-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_number: shipment.tracking_number,
          shipment_id: shipment.id,
          carrier_code: carrierCode,
        }),
      })
      const data = await res.json()
      if (data.ambiguous) {
        setSyncAmbiguous({ candidates: data.candidates })
        return
      }
      if (!res.ok) {
        if (data.error === 'quota_exceeded') {
          toast.error('Auto-sync unavailable: monthly tracking limit reached')
        } else {
          toast.error(data.error ?? 'Sync failed — try again')
        }
        return
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.shipments.all })
      toast.success(`Tracking synced — ${data.events?.length ?? 0} events`)
    } catch {
      toast.error('Sync failed — try again')
    } finally {
      setIsSyncing(false)
    }
  }

  if (!shipment) return null

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!shipment) return
    if (!eventForm.date || !eventForm.location) { toast.error('Date and location required'); return }
    addEvent.mutate(
      { id: shipment.id, event: { ...eventForm }, currentEvents: shipment.events ?? [] },
      {
        onSuccess: () => { toast.success('Event added'); setShowEventForm(false); setEventForm({ date: '', location: '', status: '', notes: '' }) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const modeMeta = MODE_META[shipment.mode]
  const ModeIcon = modeMeta.icon
  const etd = shipment.purchase_orders?.expected_delivery ?? null
  const deliveredAt = deriveEta(shipment.events ?? [])
  const lastSyncMin = shipment.last_synced_at
    ? Math.round((Date.now() - new Date(shipment.last_synced_at).getTime()) / 60000)
    : null

  return (
    <Dialog open={!!shipment} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center h-10 w-10 rounded-lg bg-muted', modeMeta.color)}>
                  <ModeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold font-mono tracking-tight">{shipment.tracking_number}</h2>
                  <p className="text-sm text-muted-foreground">
                    {shipment.purchase_orders?.po_number ?? '—'}
                    {shipment.carrier ? ` · ${shipment.carrier}` : ''}
                  </p>
                </div>
              </div>
            </div>
            <StatusBadge status={shipment.status} />
          </div>

          {/* Sync bar */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDot className={cn('h-3 w-3', shipment.last_synced_at ? 'text-green-500' : 'text-slate-400')} />
            {lastSyncMin !== null ? `Synced ${lastSyncMin}m ago` : 'Never synced'}
            <button
              onClick={() => handleSyncNow()}
              disabled={isSyncing}
              className="ml-1 text-primary font-medium hover:underline disabled:opacity-50"
            >
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>

        <Separator />

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
          {/* Quota warning */}
          {shipment.sync_error === 'quota_exceeded' && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              Auto-sync unavailable — monthly tracking limit reached
            </div>
          )}

          {/* Carrier picker — shown when 17track returns ambiguous result */}
          {syncAmbiguous && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Multiple carriers matched. Select the correct one:</p>
              <div className="flex items-center gap-2">
                <select
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedCarrierCode}
                  onChange={e => setSelectedCarrierCode(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Pick carrier…</option>
                  {syncAmbiguous.candidates.map(code => (
                    <option key={code} value={code}>Carrier #{code}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={selectedCarrierCode === '' || isSyncing}
                  onClick={() => {
                    if (selectedCarrierCode !== '') handleSyncNow(selectedCarrierCode as number)
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}

          {/* Date cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ETD</p>
              <p className="text-sm font-semibold">
                {etd ? formatDate(etd) : '—'}
                {etd && <span className="ml-1 text-xs font-normal text-muted-foreground">{daysFromNow(etd)}</span>}
              </p>
              <p className="text-xs text-muted-foreground">From PO</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {deliveredAt ? 'Delivered' : 'ETA'}
              </p>
              <p className="text-sm font-semibold">
                {deliveredAt ? formatDate(deliveredAt) : '—'}
                {deliveredAt && <span className="ml-1 text-xs font-normal text-muted-foreground">{daysFromNow(deliveredAt)}</span>}
              </p>
              <p className="text-xs text-muted-foreground">{deliveredAt ? 'From tracking' : 'Pending tracking'}</p>
            </div>
          </div>

          {/* Tracking Timeline */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Tracking Timeline</h3>
            {sortedEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No tracking events yet</p>
                <p className="text-xs">Events will appear once the carrier updates tracking</p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-0">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
                {sortedEvents.map((ev, i) => {
                  const isFirst = i === 0
                  return (
                    <div key={ev.hash ?? `${ev.date}-${ev.location}-${i}`} className="relative pb-4 last:pb-0">
                      {/* Dot */}
                      <div className={cn(
                        'absolute -left-6 top-0.5 h-[18px] w-[18px] rounded-full border-2 bg-background flex items-center justify-center',
                        isFirst ? 'border-primary' : 'border-muted-foreground/30',
                      )}>
                        <div className={cn('h-2 w-2 rounded-full', isFirst ? 'bg-primary' : 'bg-muted-foreground/30')} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium">{ev.location || 'Unknown'}</span>
                          {ev.status && (
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              ev.status === 'delivered' ? 'bg-green-50 text-green-700' :
                              ev.status === 'out_for_delivery' ? 'bg-blue-50 text-blue-700' :
                              ev.status === 'delayed' ? 'bg-red-50 text-red-700' :
                              'text-muted-foreground'
                            )}>
                              {EVENT_STATUS_LABELS[ev.status] ?? ev.status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ev.date ? new Date(ev.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                        {ev.notes && <p className="text-xs text-muted-foreground/80 mt-0.5">{ev.notes}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add event form */}
          {showEventForm && (
            <form onSubmit={handleAddEvent} className="rounded-lg border p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-semibold">Add Manual Event</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ev-date" className="text-xs">Date *</Label>
                  <Input id="ev-date" type="date" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ev-loc" className="text-xs">Location *</Label>
                  <Input id="ev-loc" value={eventForm.location} onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} placeholder="Port, city…" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-status" className="text-xs">Status</Label>
                <Input id="ev-status" value={eventForm.status} onChange={(e) => setEventForm((f) => ({ ...f, status: e.target.value }))} placeholder="Departed, Cleared customs…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-notes" className="text-xs">Notes</Label>
                <Textarea id="ev-notes" value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowEventForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={addEvent.isPending}>Add Event</Button>
              </div>
            </form>
          )}
        </div>

        {/* Footer actions */}
        <Separator />
        <div className="px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {!showEventForm && (
              <Button variant="outline" size="sm" onClick={() => setShowEventForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Event
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium rounded-md border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3 cursor-default">
                Update Status
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  {ALL_STATUSES.filter((s) => s !== shipment.status).map((s) => {
                    const cfg = STATUS_CONFIG[s]
                    const Icon = cfg.icon
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => updateStatus.mutate(
                          { id: shipment.id, status: s },
                          { onSuccess: () => toast.success('Status updated'), onError: (err) => toast.error(err.message) }
                        )}
                      >
                        <Icon className={cn('h-4 w-4 mr-2', cfg.color)} />
                        {cfg.label}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {!shipment.archived && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => archiveShipment.mutate(
                shipment.id,
                {
                  onSuccess: () => {
                    toast.success('Archived')
                    fetch('/api/shipments/deregister-tracking', {
                      method: 'POST',
                      keepalive: true,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tracking_number: shipment.tracking_number }),
                    }).catch(err => console.error('[deregister]', err))
                    onClose()
                  },
                  onError: (err) => toast.error(err.message),
                }
              )}
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Shipment | null>(null)

  const { data: shipments, isLoading } = useShipments({ archived, search })

  const currentShipment = selected
    ? (shipments ?? []).find(s => s.id === selected.id) ?? selected
    : null

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: 'tracking_number',
      header: 'Tracking #',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">{row.original.tracking_number}</span>
      ),
    },
    {
      id: 'po_number',
      header: 'PO',
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="font-medium">{row.original.purchase_orders?.po_number ?? '—'}</span>
          {row.original.purchase_orders?.supplier_name && (
            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
              {row.original.purchase_orders.supplier_name}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      cell: ({ row }) => <ModeBadge mode={row.original.mode} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'etd',
      header: 'ETD',
      cell: ({ row }) => {
        const etd = row.original.purchase_orders?.expected_delivery
        return <span className="text-sm">{etd ? formatDate(etd) : '—'}</span>
      },
    },
    {
      id: 'events',
      header: 'Events',
      cell: ({ row }) => {
        const count = row.original.events?.length ?? 0
        return (
          <span className={cn('text-sm', count > 0 ? 'font-medium' : 'text-muted-foreground')}>
            {count > 0 ? count : '—'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View shipment" onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <PageWrapper>
      <PageHeader
        title="Shipments"
        description="Track shipments linked to purchase orders"
        action={{ label: 'Create Shipment', onClick: () => setCreateOpen(true) }}
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex rounded-lg border overflow-hidden">
          {[false, true].map((isArchived) => (
            <button
              key={String(isArchived)}
              type="button"
              onClick={() => setArchived(isArchived)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                archived === isArchived
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )}
            >
              {isArchived ? 'Archived' : 'Active'}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tracking number…" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : (
        <DataTable columns={columns} data={shipments ?? []} />
      )}

      <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ShipmentDetailDialog shipment={currentShipment} onClose={() => setSelected(null)} />
    </PageWrapper>
  )
}
