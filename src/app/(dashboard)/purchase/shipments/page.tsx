'use client'

import { useState } from 'react'
import { Plane, Ship, Truck, PenLine, Eye, Package, RefreshCw, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { useShipments, type Shipment, type ShipmentMode, type ShipmentStatus } from '@/hooks/useShipments'
import { CreateShipmentDialog } from '@/components/purchase/shipments/CreateShipmentDialog'
import { ShipmentDetailDialog } from '@/components/purchase/shipments/ShipmentDetailDialog'
import type { ColumnDef } from '@tanstack/react-table'

const MODE_META: Record<ShipmentMode, { icon: typeof Plane; label: string; color: string }> = {
  air: { icon: Plane, label: 'Air', color: 'text-sky-600' },
  sea: { icon: Ship, label: 'Sea', color: 'text-blue-600' },
  land: { icon: Truck, label: 'Land', color: 'text-amber-600' },
  manual: { icon: PenLine, label: 'Manual', color: 'text-slate-500' },
}
const STATUS_META: Record<ShipmentStatus, { label: string; cls: string; icon: typeof Package }> = {
  booked: { label: 'Booked', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Package },
  in_transit: { label: 'In transit', cls: 'bg-orange-50 text-orange-700 border-orange-200', icon: RefreshCw },
  customs: { label: 'Customs', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  delayed: { label: 'Delayed', cls: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
}

function ModeCell({ mode }: { mode: ShipmentMode }) {
  const m = MODE_META[mode]; const Icon = m.icon
  return <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', m.color)}><Icon className="h-4 w-4" />{m.label}</span>
}
function StatusCell({ status }: { status: ShipmentStatus }) {
  const c = STATUS_META[status]; const Icon = c.icon
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', c.cls)}><Icon className="h-3 w-3" />{c.label}</span>
}
function poSummary(s: Shipment): { primary: string; supplier: string | null; extra: number } {
  const first = s.pos[0]
  return { primary: first?.po_number ?? '—', supplier: first?.supplier_name ?? null, extra: Math.max(0, s.pos.length - 1) }
}
function slipDays(etd: string | null, actual: string | null): number | null {
  if (!etd || !actual) return null
  const d = Math.round((new Date(actual).getTime() - new Date(etd).getTime()) / 86400000)
  return d > 0 ? d : null
}

export default function ShipmentsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: shipments, isLoading } = useShipments({ archived: false, search })

  const columns: ColumnDef<Shipment>[] = [
    {
      id: 'shipment', header: 'Shipment',
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-sm font-semibold">{row.original.shipment_number}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.tracking_number ?? 'no tracking'}</div>
        </div>
      ),
    },
    {
      id: 'pos', header: 'Purchase orders',
      cell: ({ row }) => {
        const p = poSummary(row.original)
        return (
          <div className="text-sm">
            <span className="font-medium">{p.primary}</span>{p.extra > 0 && <span className="text-muted-foreground"> +{p.extra}</span>}
            {p.supplier && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{p.supplier}</p>}
          </div>
        )
      },
    },
    { accessorKey: 'mode', header: 'Mode', cell: ({ row }) => <ModeCell mode={row.original.mode} /> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusCell status={row.original.status} /> },
    {
      id: 'etd', header: 'ETD',
      cell: ({ row }) => {
        const s = row.original
        const shown = s.etd_actual ?? s.etd
        const slip = slipDays(s.etd, s.etd_actual)
        return (
          <span className="text-sm tabular-nums">
            {shown ? formatDate(shown) : '—'}
            {slip !== null && <span className="ml-1 text-[11px] font-medium text-red-600">+{slip}d vs plan</span>}
          </span>
        )
      },
    },
    {
      id: 'events', header: 'Events',
      cell: ({ row }) => { const n = row.original.events?.length ?? 0; return <span className={cn('text-sm', n > 0 ? 'font-medium' : 'text-muted-foreground')}>{n > 0 ? n : '—'}</span> },
    },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0" aria-label="View shipment" onClick={() => setSelectedId(row.original.id)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <PageWrapper>
      <PageHeader title="Shipments" description="Track shipments carrying items from one or more purchase orders" action={{ label: 'Create Shipment', onClick: () => setCreateOpen(true) }} />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search shipment #, tracking, PO…" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : (
        <DataTable
          columns={columns}
          data={shipments ?? []}
          onRowClick={(s) => setSelectedId(s.id)}
          mobileCardRender={(s: Shipment) => {
            const p = poSummary(s)
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{s.shipment_number}</span>
                  <StatusCell status={s.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ModeCell mode={s.mode} />
                  <span className="truncate">{p.primary}{p.extra > 0 ? ` +${p.extra}` : ''}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{p.supplier ?? (s.tracking_number ?? 'no tracking')}</span>
                  <span>{(s.events?.length ?? 0)} event{(s.events?.length ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )
          }}
        />
      )}

      <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ShipmentDetailDialog shipmentId={selectedId} onClose={() => setSelectedId(null)} />
    </PageWrapper>
  )
}
