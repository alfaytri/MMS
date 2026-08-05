'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  Search, X, ChevronDown, MoreVertical,
  ShoppingCart, DollarSign, Clock, AlertTriangle,
  Truck, CheckCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { SoStatusBadge } from '@/components/sales/SoStatusBadge'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import {
  useSaleOrders,
  useConfirmSO,
  useCancelSO,
  useCustomers,
  type SaleOrder,
  type SOStatus,
} from '@/hooks/useSaleOrders'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { DatePicker } from '@/components/ui/date-picker'
import { cn } from '@/lib/utils'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDeliveryPct(so: SaleOrder): number {
  const summary = so.sale_order_lines_summary ?? []
  const totalOrdered = summary.reduce((s, l) => s + l.qty, 0)
  const totalNet = summary.reduce((s, l) => s + l.net_delivered_qty, 0)
  if (totalOrdered === 0) return 0
  return Math.min(100, Math.round((totalNet / totalOrdered) * 100))
}

function getDeliveryText(so: SaleOrder): string {
  const summary = so.sale_order_lines_summary ?? []
  const totalOrdered = summary.reduce((s, l) => s + l.qty, 0)
  const totalNet = summary.reduce((s, l) => s + l.net_delivered_qty, 0)
  return `${totalNet}/${totalOrdered}`
}

function getDeliveryStatus(so: SaleOrder): 'not_delivered' | 'partial' | 'fully_delivered' {
  const summary = so.sale_order_lines_summary ?? []
  if (summary.length === 0) return 'not_delivered'
  const totalOrdered = summary.reduce((s, l) => s + l.qty, 0)
  const totalNet = summary.reduce((s, l) => s + l.net_delivered_qty, 0)
  if (totalNet === 0) return 'not_delivered'
  if (totalNet >= totalOrdered) return 'fully_delivered'
  return 'partial'
}

function getDaysSince(dateStr: string): number {
  const created = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
}

function isOverdue(so: SaleOrder): boolean {
  if (!so.expected_delivery) return false
  if (['delivered', 'invoiced', 'closed', 'cancelled'].includes(so.status)) return false
  return new Date(so.expected_delivery) < new Date()
}

function getProgressColor(pct: number): string {
  if (pct === 0) return ''
  if (pct < 50) return '[&>div]:bg-orange-500'
  if (pct < 100) return '[&>div]:bg-blue-500'
  return '[&>div]:bg-emerald-500'
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: SOStatus; label: string }[] = [
  { value: 'quotation', label: 'Quotation' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partial_delivery', label: 'Partial Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_COLORS: Record<SOStatus, string> = {
  quotation:        'bg-muted text-foreground',
  pending_approval: 'bg-amber-100 text-amber-700',
  confirmed:        'bg-blue-100 text-blue-700',
  partial_delivery: 'bg-orange-100 text-orange-700',
  delivered:        'bg-green-100 text-green-700',
  invoiced:         'bg-emerald-100 text-emerald-700',
  closed:           'bg-muted text-muted-foreground',
  cancelled:        'bg-red-100 text-red-700',
}

const ROW_TINTS: Partial<Record<string, string>> = {
  pending_approval: 'bg-amber-50/60 dark:bg-amber-950/20',
  overdue:          'bg-red-50/60 dark:bg-red-950/20',
}

const DELIVERY_STATUS_OPTIONS = [
  { value: '', label: 'All Delivery' },
  { value: 'not_delivered', label: 'Not Delivered' },
  { value: 'partial', label: 'Partial' },
  { value: 'fully_delivered', label: 'Fully Delivered' },
]

// ─── Payment totals hook (list-level summary) ──────────────────────────────────

function useSOPaymentTotals() {
  return useQuery({
    queryKey: [...queryKeys.payments.all, 'so-totals'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payments')
        .select('source_id, amount_qar, amount')
        .eq('source_type', 'sale_order')
        .eq('direction', 'incoming')
        .is('deleted_at', null)
      if (error) return {} as Record<string, number>
      const map: Record<string, number> = {}
      for (const p of data ?? []) {
        if (!p.source_id) continue
        const amt = p.amount_qar ?? p.amount ?? 0
        map[p.source_id] = (map[p.source_id] ?? 0) + amt
      }
      return map
    },
    staleTime: 30 * 1000,
  })
}

function getPaymentStatus(so: SaleOrder, paidMap: Record<string, number>): 'paid' | 'partial' | 'unpaid' {
  const paid = paidMap[so.id] ?? 0
  if (paid >= so.total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid:    { label: 'Paid',     className: 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  partial: { label: 'Partial',  className: 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  unpaid:  { label: 'Unpaid',   className: 'border-muted-foreground/40 text-muted-foreground' },
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SaleOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<SOStatus>>(new Set())
  const [customerFilter, setCustomerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState('')
  const [detailSO, setDetailSO] = useState<SaleOrder | null>(null)

  const { data: customers } = useCustomers()

  const confirmSO = useConfirmSO()
  const cancelSO = useCancelSO()
  const { data: paidMap } = useSOPaymentTotals()

  const { availableDivisions, isSuperViewer } = useActiveDivision()
  const showDivisionColumn = isSuperViewer || availableDivisions.length > 1
  const divisionLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of availableDivisions) m.set(d.id, d.short_name || d.name)
    return m
  }, [availableDivisions])

  const hasActiveFilters = !!(search || statusFilter.size > 0 || customerFilter || dateFrom || dateTo || deliveryFilter)

  function clearFilters() {
    setSearch('')
    setStatusFilter(new Set())
    setCustomerFilter('')
    setDateFrom('')
    setDateTo('')
    setDeliveryFilter('')
  }

  function toggleStatus(s: SOStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const { data: orders, isLoading } = useSaleOrders({
    search,
    statuses: statusFilter.size > 0 ? Array.from(statusFilter) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const filtered = useMemo(() => {
    let result = orders ?? []
    if (customerFilter) result = result.filter((o) => o.customer_id === customerFilter)
    if (deliveryFilter) result = result.filter((o) => getDeliveryStatus(o) === deliveryFilter)
    return result
  }, [orders, customerFilter, deliveryFilter])

  // ── KPI stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = orders ?? []
    return {
      total: all.length,
      totalValue: all.reduce((s, o) => s + o.total, 0),
      pendingApproval: all.filter((o) => o.status === 'pending_approval').length,
      overdueDeliveries: all.filter((o) => isOverdue(o)).length,
    }
  }, [orders])

  function handleConfirm(so: SaleOrder) {
    confirmSO.mutate(
      { id: so.id, lineItems: so.sale_order_lines ?? [] },
      {
        onSuccess: () => toast.success(`${so.so_number} confirmed`),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleCancel(so: SaleOrder) {
    if (!confirm(`Cancel ${so.so_number}? The SO will remain visible with Cancelled status.`)) return
    cancelSO.mutate(so.id, {
      onSuccess: () => toast.success(`${so.so_number} cancelled`),
      onError: (e) => toast.error(e.message),
    })
  }

  const columns = useMemo<ColumnDef<SaleOrder>[]>(() => [
    {
      accessorKey: 'so_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="SO #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.getValue('so_number')}</span>
      ),
    },
    {
      accessorKey: 'customer_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') ?? '—'}</span>,
    },
    ...(showDivisionColumn ? [{
      id: 'division',
      accessorFn: (row: SaleOrder) => (row.division_id ? divisionLabelById.get(row.division_id) ?? '—' : '—'),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Division" />,
      cell: ({ row }) => {
        const divisionId = row.original.division_id
        const label = divisionId ? divisionLabelById.get(divisionId) : null
        return label
          ? <Badge variant="outline" className="text-[11px] font-medium">{label}</Badge>
          : <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<SaleOrder>] : []),
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <SoStatusBadge status={row.getValue('status')} />,
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const count = (row.original.sale_order_lines ?? []).length
        return <Badge variant="secondary" className="tabular-nums">{count}</Badge>
      },
    },
    {
      accessorKey: 'total',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total (QAR)" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatCurrency(row.getValue('total'), row.original.currency ?? 'QAR')}</span>,
    },
    {
      id: 'payment',
      header: 'Payment',
      cell: ({ row }) => {
        const ps = getPaymentStatus(row.original, paidMap ?? {})
        const cfg = PAYMENT_BADGE[ps]
        return <Badge variant="outline" className={cn('text-[11px]', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'delivery',
      header: 'Delivery',
      size: 140,
      cell: ({ row }) => {
        const pct = getDeliveryPct(row.original)
        const text = getDeliveryText(row.original)
        const summary = row.original.sale_order_lines_summary ?? []
        const shipped = summary.reduce((s, l) => s + l.shipped_qty, 0)
        const returnedGood = summary.reduce((s, l) => s + l.returned_good_qty, 0)
        const replacement = summary.reduce((s, l) => s + l.replacement_qty, 0)
        const showSub = returnedGood > 0 || replacement > 0
        return (
          <div className="space-y-1 w-[120px] min-h-[42px]">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-muted-foreground">{text}</span>
              <span className="font-medium">{pct}%</span>
            </div>
            <Progress value={pct} className={cn('h-2', getProgressColor(pct))} />
            {showSub && (
              <div className="text-[10px] leading-tight text-muted-foreground tabular-nums">
                {shipped} shipped · {returnedGood} returned · {replacement} replaced
              </div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'created_by_name',
      header: 'Created by',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
          {row.getValue('created_by_name') ?? '—'}
        </span>
      ),
    },
    {
      id: 'age',
      header: 'Age',
      cell: ({ row }) => {
        const days = getDaysSince(row.original.created_at)
        return (
          <span className={cn(
            'text-sm tabular-nums',
            days > 30 ? 'text-destructive font-medium' : days > 14 ? 'text-amber-600' : 'text-muted-foreground'
          )}>
            {days}d
          </span>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.getValue('created_at'))}</span>
      ),
    },
    {
      id: 'actions',
      size: 50,
      cell: ({ row }) => {
        const so = row.original
        const canConfirm = so.status === 'pending_approval'
        const canCreateDelivery = ['confirmed', 'partial_delivery'].includes(so.status)
        const canCancel = !['cancelled', 'closed'].includes(so.status)
        const canEdit = !['cancelled', 'closed'].includes(so.status)
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0 items-center justify-center rounded-md hover:bg-accent" aria-label="Row actions">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDetailSO(so)}>View</DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => router.push(`/sales/edit-so/${so.id}`)}>Edit</DropdownMenuItem>
                )}
                {canConfirm && (
                  <DropdownMenuItem onClick={() => handleConfirm(so)}>
                    <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
                    Confirm
                  </DropdownMenuItem>
                )}
                {canCreateDelivery && (
                  <DropdownMenuItem onClick={() => {
                    setDetailSO(so)
                  }}>
                    <Truck className="h-4 w-4 mr-2 text-emerald-500" />
                    Create Delivery
                  </DropdownMenuItem>
                )}
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleCancel(so)}
                    >
                      Cancel SO
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleCancel/handleConfirm close over confirmSO/cancelSO which are already in deps
  ], [paidMap, confirmSO, cancelSO, router, showDivisionColumn, divisionLabelById])

  return (
    <PageWrapper>
      <PageHeader
        title="Sale Orders"
        description="Create and manage customer sale orders"
        actions={
          <Button onClick={() => router.push('/sales/create-so')}>
            + Create Sale Order
          </Button>
        }
      />

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Total Value</p>
              {/* TODO: multi-currency aggregation */}
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalValue, 'QAR')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Pending Approval</p>
              <p className="text-2xl font-bold tabular-nums">{stats.pendingApproval}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Overdue Deliveries</p>
              <p className="text-2xl font-bold tabular-nums">{stats.overdueDeliveries}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by SO number or customer…"
                className="pl-9"
              />
            </div>

            {/* Status multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 min-h-11 md:min-h-0 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-auto sm:min-w-[140px] hover:bg-accent hover:text-accent-foreground">
                <span className="truncate">
                  {statusFilter.size === 0
                    ? 'All Statuses'
                    : statusFilter.size === 1
                      ? (STATUS_OPTIONS.find((s) => statusFilter.has(s.value))?.label ?? 'Status')
                      : `${statusFilter.size} statuses`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[190px]">
                {STATUS_OPTIONS.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.value}
                    checked={statusFilter.has(s.value)}
                    onCheckedChange={() => toggleStatus(s.value)}
                  >
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mr-1',
                      STATUS_COLORS[s.value] ?? ''
                    )}>
                      {s.label}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {statusFilter.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-muted-foreground justify-center"
                      onClick={() => setStatusFilter(new Set())}
                    >
                      Clear selection
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Customer filter */}
            <Select value={customerFilter || 'all'} onValueChange={(v) => setCustomerFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue>
                  {(v: string) => v === 'all' ? 'All Customers' : ((customers ?? []).find((c) => c.id === v)?.name ?? v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range with proper pickers */}
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="From date"
              className="w-full sm:w-[150px]"
            />
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="To date"
              className="w-full sm:w-[150px]"
            />

            {/* Delivery status */}
            <Select value={deliveryFilter || 'all'} onValueChange={(v) => setDeliveryFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue>
                  {(v: string) => DELIVERY_STATUS_OPTIONS.find((s) => (s.value || 'all') === v)?.label ?? 'All Delivery'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Division filter (super viewers only) */}

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(row) => setDetailSO(row)}
        rowClassName={(row) => {
          if (row.status === 'pending_approval') return ROW_TINTS.pending_approval
          if (isOverdue(row)) return ROW_TINTS.overdue
          return undefined
        }}
        mobileCardRender={(so: SaleOrder) => {
          const ps = getPaymentStatus(so, paidMap ?? {})
          const pCfg = PAYMENT_BADGE[ps]
          const delPct = getDeliveryPct(so)
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{so.so_number}</span>
                <SoStatusBadge status={so.status} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground truncate">{so.customer_name ?? '—'}</p>
                {showDivisionColumn && so.division_id && divisionLabelById.get(so.division_id) && (
                  <Badge variant="outline" className="text-[10px] font-medium">{divisionLabelById.get(so.division_id)}</Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(so.created_at)}</span>
                <span className="font-medium text-foreground tabular-nums">{formatCurrency(so.total, so.currency ?? 'QAR')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn('text-[10px]', pCfg.className)}>{pCfg.label}</Badge>
                <span className="text-[10px] text-muted-foreground">{delPct}% delivered</span>
                {isOverdue(so) && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
              </div>
            </div>
          )
        }}
      />

      <SoDetailDialog
        open={!!detailSO}
        onOpenChange={(open) => { if (!open) setDetailSO(null) }}
        so={detailSO}
        onEdit={(so) => router.push(`/sales/edit-so/${so.id}`)}
        onConfirm={handleConfirm}
      />
    </PageWrapper>
  )
}
