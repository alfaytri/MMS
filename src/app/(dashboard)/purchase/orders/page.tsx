'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Clock, Package, DollarSign, Search, X, MoreVertical, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { CreateBillFromPODialog } from '@/components/purchase/CreateBillFromPODialog'
import { usePurchaseOrders, useCancelPO, type PurchaseOrder, type POStatus, type POType } from '@/hooks/usePurchaseOrders'
import { useBilledPoIds } from '@/hooks/useSupplierBills'
import { useSuppliers } from '@/hooks/useSuppliers'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { toast } from 'sonner'

const STATUS_OPTIONS: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const RECEIVAL_STATUS_OPTIONS = [
  { value: '', label: 'All Receival' },
  { value: 'not_received', label: 'Not Received' },
  { value: 'partial', label: 'Partial' },
  { value: 'fully_received', label: 'Fully Received' },
]

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All Payment' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Fully Paid' },
]

const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-muted text-foreground',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PO_TYPE_TABS: { value: POType | ''; label: string; color: string }[] = [
  { value: '',          label: 'All',       color: '' },
  { value: 'rfq',       label: 'RFQ',       color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'draft',     label: 'Draft',     color: 'bg-muted text-foreground border-border' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
]

function getReceivalStatus(po: PurchaseOrder): 'not_received' | 'partial' | 'fully_received' {
  const items = po.po_line_items ?? []
  if (items.length === 0) return 'not_received'
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  if (totalReceived === 0) return 'not_received'
  if (totalReceived >= totalOrdered) return 'fully_received'
  return 'partial'
}

function getReceivalPct(po: PurchaseOrder): number {
  const items = po.po_line_items ?? []
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  if (totalOrdered === 0) return 0
  return Math.min(100, Math.round((totalReceived / totalOrdered) * 100))
}

function getReceivalText(po: PurchaseOrder): string {
  const items = po.po_line_items ?? []
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  return `${totalReceived}/${totalOrdered}`
}

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<POStatus>>(new Set())
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [receivalFilter, setReceivalFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [poTypeFilter, setPoTypeFilter] = useState<POType | ''>('')
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)
  const [createBillPOId, setCreateBillPOId] = useState<string | null>(null)

  const cancelPO = useCancelPO()
  const { activeDivisionId, availableDivisions, isSuperViewer } = useActiveDivision()

  const showDivisionColumn = isSuperViewer || availableDivisions.length > 1
  const divisionLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of availableDivisions) m.set(d.id, d.short_name || d.name)
    return m
  }, [availableDivisions])

  const { data: orders, isLoading } = usePurchaseOrders({
    search,
    poType: poTypeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data: suppliers } = useSuppliers()
  const { data: billedPoIds } = useBilledPoIds()

  // ── Stats ──────────────────────────────────────────────────────────────────
  // Stats scope follows the active-division filter so the top cards match
  // what the list below shows.
  const stats = useMemo(() => {
    const all = (orders ?? []).filter(
      (o) => !activeDivisionId || o.division_id == null || o.division_id === activeDivisionId,
    )
    return {
      total: all.length,
      pendingApproval: all.filter((o) => o.status === 'pending_approval').length,
      inReceival: all.filter((o) => ['approved', 'partially_received'].includes(o.status)).length,
      totalValue: all.reduce((s, o) => s + (o.total_qar ?? 0), 0),
    }
  }, [orders, activeDivisionId])

  // ── Client-side filtering ─────────────────────────────────────────────────
  // Phase E follow-up: hide POs whose division_id doesn't match the active
  // division. Admin bypasses RLS so all divisions' POs land in `orders`;
  // this filter mirrors the /purchase/returns picker (legacy null-division
  // POs always show; "All Divisions" shows everything).
  const filtered = useMemo(() => {
    let result = orders ?? []
    if (activeDivisionId) {
      result = result.filter((o) => o.division_id == null || o.division_id === activeDivisionId)
    }
    if (statusFilter.size > 0) result = result.filter((o) => statusFilter.has(o.status))
    if (supplierFilter) result = result.filter((o) => o.supplier_id === supplierFilter)
    if (receivalFilter) result = result.filter((o) => getReceivalStatus(o) === receivalFilter)
    if (paymentFilter) {
      result = result.filter((o) => {
        if (paymentFilter === 'paid') return ['received', 'completed'].includes(o.status)
        if (paymentFilter === 'unpaid') return ['draft', 'pending_approval', 'approved'].includes(o.status)
        if (paymentFilter === 'partial') return o.status === 'partially_received'
        return true
      })
    }
    return result
  }, [orders, activeDivisionId, statusFilter, supplierFilter, receivalFilter, paymentFilter])

  const hasActiveFilters = !!(search || statusFilter.size > 0 || supplierFilter || dateFrom || dateTo || receivalFilter || paymentFilter || poTypeFilter)

  function clearFilters() {
    setSearch(''); setStatusFilter(new Set()); setSupplierFilter('')
    setDateFrom(''); setDateTo(''); setReceivalFilter(''); setPaymentFilter('')
    setPoTypeFilter('')
  }

  function toggleStatus(s: POStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl 2xl:text-4xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage purchase orders, receivals &amp; payments</p>
        </div>
        <Button onClick={() => router.push('/purchase/create-po')} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total POs</p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
                <p className="text-2xl font-bold mt-1">{stats.pendingApproval}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Receival</p>
                <p className="text-2xl font-bold mt-1">{stats.inReceival}</p>
                <p className="text-xs text-muted-foreground mt-1">Active orders</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Package className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Value (QAR)</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats.totalValue, 'QAR')}</p>
                <p className="text-xs text-muted-foreground mt-1">All POs</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Type Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {PO_TYPE_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={poTypeFilter === tab.value ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'min-w-[80px] min-h-11 md:min-h-0',
              poTypeFilter !== tab.value && tab.color,
            )}
            onClick={() => setPoTypeFilter(tab.value as POType | '')}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── Filters Bar ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by PO number or supplier…"
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 min-h-11 md:min-h-0 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-auto sm:min-w-[140px] hover:bg-accent hover:text-accent-foreground">
                <span className="truncate">
                  {statusFilter.size === 0
                    ? 'All Statuses'
                    : statusFilter.size === 1
                      ? (STATUS_OPTIONS.find((s) => s.value && statusFilter.has(s.value as POStatus))?.label ?? 'Status')
                      : `${statusFilter.size} statuses`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[190px]">
                {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.value}
                    checked={statusFilter.has(s.value as POStatus)}
                    onCheckedChange={() => toggleStatus(s.value as POStatus)}
                  >
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mr-1',
                      STATUS_COLORS[s.value as POStatus] ?? ''
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
            <Select value={supplierFilter || 'all'} onValueChange={(v) => setSupplierFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue>
                  {(v: string) => v === 'all' ? 'All Suppliers' : ((suppliers ?? []).find((s) => s.id === v)?.name ?? v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-full sm:w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-full sm:w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="To date"
            />
            <Select value={receivalFilter || 'all'} onValueChange={(v) => setReceivalFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue>
                  {(v: string) => RECEIVAL_STATUS_OPTIONS.find((s) => (s.value || 'all') === v)?.label ?? 'All Receival'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECEIVAL_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter || 'all'} onValueChange={(v) => setPaymentFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue>
                  {(v: string) => PAYMENT_STATUS_OPTIONS.find((s) => (s.value || 'all') === v)?.label ?? 'All Payment'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                {showDivisionColumn && <TableHead className="w-[100px]">Division</TableHead>}
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[80px] text-center hidden md:table-cell">Items</TableHead>
                <TableHead className="w-[140px] text-right">Total (QAR)</TableHead>
                <TableHead className="w-[140px] text-center">Status</TableHead>
                <TableHead className="w-[120px] text-center hidden lg:table-cell">Receival</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell
                        key={j}
                        className={cn(
                          j === 2 ? 'hidden md:table-cell' : '',
                          j === 5 ? 'hidden lg:table-cell' : ''
                        )}
                      >
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showDivisionColumn ? 9 : 8} className="p-0">
                    <EmptyState
                      title="No purchase orders found"
                      icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                      action={
                        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => router.push('/purchase/create-po')}>
                          Create your first PO
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((po) => {
                  const receivalPct = getReceivalPct(po)
                  const receivalText = getReceivalText(po)
                  const lineCount = (po.po_line_items ?? []).length
                  return (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailPO(po)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium font-mono text-sm">{po.po_number}</span>
                          {po.po_type === 'rfq' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                              RFQ
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{po.supplier_name}</span>
                        {po.po_type === 'rfq' && (po.rfq_supplier_ids?.length ?? 0) > 1 && (
                          <Badge variant="secondary" className="text-[10px] ml-1.5">
                            + {(po.rfq_supplier_ids?.length ?? 0) - 1} more
                          </Badge>
                        )}
                      </TableCell>
                      {showDivisionColumn && (
                        <TableCell>
                          {po.division_id && divisionLabelById.get(po.division_id) ? (
                            <Badge variant="outline" className="text-[11px] font-medium">
                              {divisionLabelById.get(po.division_id)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(po.created_date)}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <Badge variant="secondary">{lineCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">{formatCurrency(po.total_qar ?? 0, 'QAR')}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          STATUS_COLORS[po.status] ?? 'bg-muted text-foreground'
                        )}>
                          {po.status.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1">
                          <Progress value={receivalPct} className="h-1.5" />
                          <p className="text-xs text-muted-foreground text-center">{receivalText}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {!billedPoIds?.has(po.id) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 gap-1"
                              onClick={() => setCreateBillPOId(po.id)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Create Bill</span>
                            </Button>
                          )}
                          <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0 items-center justify-center rounded-md hover:bg-accent" aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailPO(po)}>View</DropdownMenuItem>
                            {po.status !== 'cancelled' && (
                              <DropdownMenuItem onClick={() => router.push(`/purchase/edit-po/${po.id}`)}>Edit</DropdownMenuItem>
                            )}
                            {po.status !== 'cancelled' && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (!confirm(`Cancel ${po.po_number}? The PO will remain visible with Cancelled status.`)) return
                                  cancelPO.mutate(po.id, {
                                    onSuccess: () => toast.success(`${po.po_number} cancelled`),
                                    onError: (e) => toast.error(e.message),
                                  })
                                }}
                              >
                                Cancel PO
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <PoDetailDialog
        open={!!detailPO}
        onOpenChange={(open) => { if (!open) setDetailPO(null) }}
        po={detailPO}
        onEdit={(po) => router.push(`/purchase/edit-po/${po.id}`)}
      />
      <CreateBillFromPODialog
        open={!!createBillPOId}
        onOpenChange={(open) => { if (!open) setCreateBillPOId(null) }}
        poId={createBillPOId ?? ''}
      />
    </PageWrapper>
  )
}
