'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plane, Ship, Truck, PenLine, Eye, Archive, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_ICONS: Record<ShipmentMode, { icon: React.ReactNode; label: string }> = {
  air:    { icon: <Plane className="h-4 w-4" />,    label: 'Air'    },
  sea:    { icon: <Ship className="h-4 w-4" />,     label: 'Sea'    },
  land:   { icon: <Truck className="h-4 w-4" />,   label: 'Land'   },
  manual: { icon: <PenLine className="h-4 w-4" />, label: 'Manual' },
}

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  booked:     'bg-blue-100 text-blue-800',
  in_transit: 'bg-orange-100 text-orange-800',
  customs:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-800',
  delayed:    'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  booked:     'Booked',
  in_transit: 'In Transit',
  customs:    'Customs',
  delivered:  'Delivered',
  delayed:    'Delayed',
}

const ALL_STATUSES: ShipmentStatus[] = ['booked', 'in_transit', 'customs', 'delivered', 'delayed']

// ─── Sub-components ────────────────────────────────────────────────────────────

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Create Shipment Dialog ───────────────────────────────────────────────────

function CreateShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: pos } = usePurchaseOrders({ status: undefined })
  const createShipment = useCreateShipment()
  const [form, setForm] = useState({
    po_id: '', mode: 'air' as ShipmentMode, carrier: '', tracking_number: '',
    origin: '', destination: '', etd: '', eta: '',
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.po_id) { toast.error('Select a PO'); return }
    if (!form.carrier) { toast.error('Carrier is required'); return }
    if (!form.tracking_number) { toast.error('Tracking number is required'); return }
    createShipment.mutate(
      {
        po_id: form.po_id,
        mode: form.mode,
        carrier: form.carrier,
        tracking_number: form.tracking_number,
        origin: form.origin || null,
        destination: form.destination || null,
        etd: form.etd || null,
        eta: form.eta || null,
      },
      {
        onSuccess: () => { toast.success('Shipment created'); onOpenChange(false); setForm({ po_id: '', mode: 'air', carrier: '', tracking_number: '', origin: '', destination: '', etd: '', eta: '' }) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const approvedPos = (pos ?? []).filter((p) => p.status === 'approved' || p.status === 'partially_received')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Shipment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Purchase Order *</Label>
            <select value={form.po_id} onChange={(e) => set('po_id', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              <option value="">Select PO…</option>
              {approvedPos.map((p) => (
                <option key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mode *</Label>
              <select value={form.mode} onChange={(e) => set('mode', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="air">✈️ Air</option>
                <option value="sea">🚢 Sea</option>
                <option value="land">🚛 Land</option>
                <option value="manual">✏️ Manual</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Carrier *</Label>
              <Input value={form.carrier} onChange={(e) => set('carrier', e.target.value)} placeholder="DHL, FedEx…" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tracking Number *</Label>
            <Input value={form.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} placeholder="TRK-001" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Origin</Label>
              <Input value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Shanghai" />
            </div>
            <div className="space-y-1">
              <Label>Destination</Label>
              <Input value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Doha" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>ETD</Label>
              <Input type="date" value={form.etd} onChange={(e) => set('etd', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ETA</Label>
              <Input type="date" value={form.eta} onChange={(e) => set('eta', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
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

  const modeInfo = MODE_ICONS[shipment.mode]

  return (
    <Dialog open={!!shipment} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">{modeInfo.icon}</span>
            {shipment.tracking_number}
            <ShipmentStatusBadge status={shipment.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">PO</p>
              <p className="font-medium">{shipment.purchase_orders?.po_number ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Carrier</p>
              <p className="font-medium">{shipment.carrier}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Route</p>
              <p className="font-medium">{shipment.origin ?? '—'} → {shipment.destination ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ETD / ETA</p>
              <p className="font-medium">{formatDate(shipment.etd)} / {formatDate(shipment.eta)}</p>
            </div>
          </div>

          <Separator />

          {/* Tracking Timeline */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Tracking Timeline</h3>
            {(shipment.events ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-2">
                {[...(shipment.events ?? [])].reverse().map((ev, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="w-24 shrink-0 text-muted-foreground">{ev.date}</div>
                    <div>
                      <span className="font-medium">{ev.location}</span>
                      {ev.status && <span className="ml-2 text-muted-foreground">· {ev.status}</span>}
                      {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add event form */}
          {showEventForm && (
            <form onSubmit={handleAddEvent} className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">Add Tracking Event</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input type="date" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location *</Label>
                  <Input value={eventForm.location} onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} placeholder="Port, city…" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Input value={eventForm.status} onChange={(e) => setEventForm((f) => ({ ...f, status: e.target.value }))} placeholder="Departed, Cleared customs…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowEventForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={addEvent.isPending}>Add Event</Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEventForm(true)} disabled={showEventForm}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
          {/* Update Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent h-9">
              Update Status
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                {ALL_STATUSES.filter((s) => s !== shipment.status).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => updateStatus.mutate(
                      { id: shipment.id, status: s },
                      { onSuccess: () => toast.success('Status updated'), onError: (err) => toast.error(err.message) }
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {!shipment.archived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => archiveShipment.mutate(
                shipment.id,
                { onSuccess: () => { toast.success('Archived'); onClose() }, onError: (err) => toast.error(err.message) }
              )}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          )}
        </DialogFooter>
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

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: 'tracking_number',
      header: 'Tracking #',
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.tracking_number}</span>,
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => <span className="text-sm">{row.original.purchase_orders?.po_number ?? '—'}</span>,
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      cell: ({ row }) => {
        const m = MODE_ICONS[row.original.mode]
        return <span className="flex items-center gap-1 text-sm">{m.icon} {m.label}</span>
      },
    },
    {
      accessorKey: 'carrier',
      header: 'Carrier',
      cell: ({ row }) => <span className="text-sm">{row.original.carrier}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <ShipmentStatusBadge status={row.original.status} />,
    },
    {
      id: 'route',
      header: 'Route',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.origin ?? '—'} → {row.original.destination ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'etd',
      header: 'ETD',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.etd)}</span>,
    },
    {
      accessorKey: 'eta',
      header: 'ETA',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.eta)}</span>,
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
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="Track shipments linked to purchase orders"
        action={{ label: '+ Create Shipment', onClick: () => setCreateOpen(true) }}
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Active / Archived tabs */}
        <div className="flex rounded-md border overflow-hidden">
          {[false, true].map((isArchived) => (
            <button
              key={String(isArchived)}
              type="button"
              onClick={() => setArchived(isArchived)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                archived === isArchived ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {isArchived ? 'Archived' : 'Active'}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tracking, carrier…" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={shipments ?? []} />
      )}

      <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ShipmentDetailDialog shipment={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
