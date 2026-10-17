'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, FilePlus, Link2, XCircle, Ship } from 'lucide-react'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { humanizeDbError } from '@/lib/dbErrors'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { usePurchaseForecasts, useCancelForecast, type PurchaseForecast, type Engagement, type ForecastStatus } from '@/hooks/usePurchaseForecasts'
import { useCreatePlannedShipment } from '@/hooks/useShipments'
import { ForecastDialog } from '@/components/purchase/forecast/ForecastDialog'
import { AttachPoDialog } from '@/components/purchase/forecast/AttachPoDialog'
import type { ColumnDef } from '@tanstack/react-table'

const ENGAGEMENT_META: Record<Engagement, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_discussion: { label: 'In discussion', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  quotation_received: { label: 'Quotation received', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  negotiating: { label: 'Negotiating', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ready_to_order: { label: 'Ready to order', cls: 'bg-green-50 text-green-700 border-green-200' },
  on_hold: { label: 'On hold', cls: 'bg-red-50 text-red-700 border-red-200' },
}
const STATUS_META: Record<ForecastStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ordered: { label: 'Ordered', cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground line-through' },
}
const pill = (cls: string, label: string) => <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', cls)}>{label}</span>
const qar = (n: number | null | undefined, cur = 'QAR') => n == null ? '—' : `${cur} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export interface ForecastSectionHandle { openCreate: () => void }

export const ForecastSection = forwardRef<ForecastSectionHandle>(function ForecastSection(_props, ref) {
  const router = useRouter()
  const { activeDivisionId } = useActiveDivision()
  const [status, setStatus] = useState<string>('all')
  const [engagement, setEngagement] = useState<string>('all')
  const [search, setSearch] = useState('')
  const { data: forecasts, isLoading } = usePurchaseForecasts({
    status: status === 'all' ? undefined : (status as ForecastStatus),
    engagement: engagement === 'all' ? undefined : (engagement as Engagement),
    search,
    divisionId: activeDivisionId ?? undefined,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseForecast | null>(null)
  const [attachFor, setAttachFor] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PurchaseForecast | null>(null)
  const cancelForecast = useCancelForecast()
  const createPlanned = useCreatePlannedShipment()

  useImperativeHandle(ref, () => ({ openCreate: () => { setEditing(null); setDialogOpen(true) } }), [])

  function openEdit(f: PurchaseForecast) { setEditing(f); setDialogOpen(true) }

  function RowMenu({ f }: { f: PurchaseForecast }) {
    const isOpen = f.status === 'open'
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(f)}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
          {isOpen && <DropdownMenuItem onClick={() => router.push(`/purchase/create-po?forecast=${f.id}`)}><FilePlus className="h-3.5 w-3.5 mr-2" /> Convert to PO</DropdownMenuItem>}
          {isOpen && <DropdownMenuItem onClick={() => setAttachFor(f.id)}><Link2 className="h-3.5 w-3.5 mr-2" /> Attach PO</DropdownMenuItem>}
          {isOpen && !f.shipment_id && <DropdownMenuItem onClick={() => createPlanned.mutate({ mode: 'sea', forecastIds: [f.id] }, { onSuccess: () => { toast.success('Planned shipment created') }, onError: (e) => toast.error(humanizeDbError(e)) })}><Ship className="h-3.5 w-3.5 mr-2" /> Create planned shipment</DropdownMenuItem>}
          {isOpen && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelTarget(f)}><XCircle className="h-3.5 w-3.5 mr-2" /> Cancel</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const columns: ColumnDef<PurchaseForecast>[] = [
    { id: 'ref', header: 'Forecast', cell: ({ row }) => <span className="font-mono text-sm font-semibold">{row.original.forecast_number}</span> },
    { id: 'item', header: 'Item', cell: ({ row }) => (
      <div className="text-sm"><span className="font-medium">{row.original.item_name ?? '—'}</span>{row.original.sku && <span className="text-[11px] text-muted-foreground font-mono ml-1.5">· {row.original.sku}</span>}</div>
    ) },
    { id: 'qty', header: 'Qty', cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.qty}</span> },
    { id: 'supplier', header: 'Supplier', cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.supplier_name ?? '—'}</span> },
    { id: 'engagement', header: 'Engagement', cell: ({ row }) => pill(ENGAGEMENT_META[row.original.engagement].cls, ENGAGEMENT_META[row.original.engagement].label) },
    { id: 'value', header: 'Est. value', cell: ({ row }) => <span className="tabular-nums text-sm">{qar(row.original.est_value, row.original.currency)}</span> },
    { id: 'order', header: 'Planned order', cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.planned_order_date ? formatDate(row.original.planned_order_date) : '—'}</span> },
    { id: 'need', header: 'Needed by', cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.needed_by_date ? formatDate(row.original.needed_by_date) : '—'}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => pill(STATUS_META[row.original.status].cls, STATUS_META[row.original.status].label) },
    { id: 'actions', header: '', cell: ({ row }) => <RowMenu f={row.original} /> },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Select value={status} onValueChange={(v) => setStatus(v ?? 'all')}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_META) as ForecastStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={engagement} onValueChange={(v) => setEngagement(v ?? 'all')}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All engagement</SelectItem>
            {(Object.keys(ENGAGEMENT_META) as Engagement[]).map((e) => <SelectItem key={e} value={e}>{ENGAGEMENT_META[e].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, supplier, forecast #…" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : (
        <DataTable
          columns={columns}
          data={forecasts ?? []}
          mobileCardRender={(f: PurchaseForecast) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{f.forecast_number}</span>
                <div className="flex items-center gap-2">{pill(STATUS_META[f.status].cls, STATUS_META[f.status].label)}<RowMenu f={f} /></div>
              </div>
              <div className="text-sm font-medium">{f.item_name ?? '—'} <span className="text-muted-foreground font-normal">×{f.qty}</span></div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{f.supplier_name ?? 'No supplier'}</span>
                {pill(ENGAGEMENT_META[f.engagement].cls, ENGAGEMENT_META[f.engagement].label)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">Order {f.planned_order_date ? formatDate(f.planned_order_date) : '—'} · Need {f.needed_by_date ? formatDate(f.needed_by_date) : '—'}</div>
            </div>
          )}
        />
      )}

      <ForecastDialog open={dialogOpen} onOpenChange={setDialogOpen} forecast={editing} />
      <AttachPoDialog open={!!attachFor} onOpenChange={(o) => { if (!o) setAttachFor(null) }} forecastId={attachFor} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel forecast {cancelTarget?.forecast_number}?</AlertDialogTitle>
            <AlertDialogDescription>It will be marked cancelled and removed from the active pipeline and any planned shipment. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const t = cancelTarget; if (t) cancelForecast.mutate(t.id, { onSuccess: () => toast.success('Forecast cancelled'), onError: (e) => toast.error(humanizeDbError(e)) }); setCancelTarget(null) }}>
              Cancel forecast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
