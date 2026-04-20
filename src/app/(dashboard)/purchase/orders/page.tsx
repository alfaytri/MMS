'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Clock, Package, DollarSign, Search, X, MoreVertical } from 'lucide-react'
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
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { usePurchaseOrders, type PurchaseOrder, type POStatus } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
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
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

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
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [receivalFilter, setReceivalFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)
  const [billPoId, setBillPoId] = useState<string | null>(null)

  const { data: orders, isLoading } = usePurchaseOrders({
    search,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data: suppliers } = useSuppliers()

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = orders ?? []
    return {
      total: all.length,
      pendingApproval: all.filter((o) => o.status === 'pending_approval').length,
      inReceival: all.filter((o) => ['approved', 'partially_received'].includes(o.status)).length,
      totalValue: all.reduce((s, o) => s + (o.total_qar ?? 0), 0),
    }
  }, [orders])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = orders ?? []
    if (supplierFilter) result = result.filter((o) => o.supplier_id === supplierFilter)
    if (receivalFilter) result = result.filter((o) => getReceivalStatus(o) === receivalFilter)
    if (paymentFilter) {
      result = result.filter((o) => {
        if (paymentFilter === 'paid') return o.status === 'received'
        if (paymentFilter === 'unpaid') return ['draft', 'pending_approval', 'approved'].includes(o.status)
        if (paymentFilter === 'partial') return o.status === 'partially_received'
        return true
      })
    }
    return result
  }, [orders, supplierFilter, receivalFilter, paymentFilter])

  const hasActiveFilters = !!(search || statusFilter || supplierFilter || dateFrom || dateTo || receivalFilter || paymentFilter)

  function clearFilters() {
    setSearch(''); setStatusFilter(''); setSupplierFilter('')
    setDateFrom(''); setDateTo(''); setReceivalFilter(''); setPaymentFilter('')
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage purchase orders, receivals &amp; payments</p>
        </div>
        <Button onClick={() => router.push('/purchase/create-po')}>
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
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters Bar ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by PO number or supplier…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(!v || v === 'all' ? '' : v as POStatus)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue>
                  {(v: string) => STATUS_OPTIONS.find((s) => (s.value || 'all') === v)?.label ?? 'All Statuses'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={supplierFilter || 'all'} onValueChange={(v) => setSupplierFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
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
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="To date"
            />
            <Select value={receivalFilter || 'all'} onValueChange={(v) => setReceivalFilter(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]">
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
              <SelectTrigger className="w-[160px]">
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
              <Button variant="ghost" size="sm" onClick={clearFilters}>
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
                          j === 3 ? 'hidden md:table-cell' : '',
                          j === 6 ? 'hidden lg:table-cell' : ''
                        )}
                      >
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="h-12 w-12" />
                      <p className="font-medium">No purchase orders found</p>
                      <Button variant="outline" size="sm" onClick={() => router.push('/purchase/create-po')}>
                        Create your first PO
                      </Button>
                    </div>
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
                        <span className="font-medium font-mono text-sm">{po.po_number}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{po.supplier_name}</span>
                      </TableCell>
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
                          STATUS_COLORS[po.status] ?? 'bg-slate-100 text-slate-700'
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
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailPO(po)}>View</DropdownMenuItem>
                            {po.status === 'draft' && (
                              <DropdownMenuItem onClick={() => router.push(`/purchase/edit-po/${po.id}`)}>Edit</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setBillPoId(po.id)}>Create Bill</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        onCreateBill={(poId) => { setDetailPO(null); setBillPoId(poId) }}
      />

      {billPoId && (
        <BillFormDialog
          open={!!billPoId}
          onOpenChange={(v) => { if (!v) setBillPoId(null) }}
          initialPoId={billPoId}
        />
      )}
    </div>
  )
}
