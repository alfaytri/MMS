'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  useSaleReturns,
  useCreateSaleReturn,
  useUpdateReturnStatus,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import { useReturnReasons } from '@/hooks/useReturnReasons'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { SaleReturnDetailDialog } from '@/components/sales/SaleReturnDetailDialog'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  Calendar, Package, ChevronRight, AlertTriangle, RotateCcw, Clock, Truck,
  CheckCircle2, Ban, ShoppingCart, User, Building2,
} from 'lucide-react'

const STATUS_CONFIG: Record<SaleReturn['status'], { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', Icon: Clock },
  received:  { label: 'Received',  color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200',   Icon: Truck },
  restocked: { label: 'Restocked', color: 'text-green-700', bg: 'bg-green-50 border-green-200', Icon: CheckCircle2 },
  closed:    { label: 'Closed',    color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-red-700',   bg: 'bg-red-50 border-red-200',     Icon: Ban },
}

const STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending:   'received',
  received:  'restocked',
  restocked: 'closed',
}

const STATUS_LABEL: Record<string, string> = {
  received:  'Mark Received',
  restocked: 'Mark Restocked',
  closed:    'Close Return',
}

const STATUS_FILTERS: { value: '' | SaleReturn['status']; label: string }[] = [
  { value: '',          label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'received',  label: 'Received' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'closed',    label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function SaleReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleReturn['status'] | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<SaleReturn | null>(null)
  const [soId, setSoId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reasonSelect, setReasonSelect] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState<{ item_name: string; sku: string | null; qty: number; condition: 'good' | 'damaged'; brand_variant_id: string | null; condition_notes?: string | null; delivered_qty?: number }[]>([])

  const { data: returns, isLoading } = useSaleReturns({ search, status: statusFilter || undefined })
  const { data: saleOrders } = useSaleOrders({ statuses: ['delivered', 'partial_delivery'] })
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('sale_return')

  const createReturn = useCreateSaleReturn()
  const updateStatus = useUpdateReturnStatus()

  // SO lookup for enriching return list rows with SO # + customer
  const soById = useMemo(() => {
    const map = new Map<string, { so_number: string; customer_name: string | null }>()
    for (const o of saleOrders ?? []) {
      map.set(o.id, { so_number: o.so_number, customer_name: o.customer_name ?? null })
    }
    return map
  }, [saleOrders])

  const selectedSO = useMemo(
    () => (saleOrders ?? []).find((o) => o.id === soId) ?? null,
    [saleOrders, soId]
  )

  const stats = useMemo(() => {
    const list = returns ?? []
    let pending = 0, received = 0, restocked = 0
    for (const r of list) {
      if (r.status === 'pending')   pending++
      if (r.status === 'received')  received++
      if (r.status === 'restocked') restocked++
    }
    return { total: list.length, pending, received, restocked }
  }, [returns])

  function handleSOSelect(id: string) {
    setSoId(id)
    const so = (saleOrders ?? []).find((o) => o.id === id)
    if (!so) return
    setItems(
      (so.sale_order_lines ?? [])
        .filter((l) => l.delivered_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku, qty: 0, condition: 'good' as const, brand_variant_id: l.brand_variant_id, delivered_qty: l.delivered_qty }))
    )
  }

  function getReason(): string {
    return reasonSelect === '__custom__' ? customReason : reasonSelect
  }

  function resetForm() {
    setSoId(''); setReasonSelect(''); setCustomReason(''); setNotes('')
    setItems([]); setWarehouseId('')
  }

  function handleCreate() {
    if (!soId)          { toast.error('Select a sale order'); return }
    const reason = getReason()
    if (!reason)        { toast.error('Reason is required'); return }
    const valid = items.filter((i) => i.qty > 0)
    if (valid.length === 0) { toast.error('Enter qty for at least one item'); return }
    createReturn.mutate(
      { source_id: soId, date, reason, items: valid, restock_warehouse_id: warehouseId || null, notes: notes || null },
      {
        onSuccess: () => {
          toast.success('Return created')
          setCreateOpen(false); resetForm()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const returnableLineCount = items.length
  const totalReturnQty = items.reduce((s, i) => s + (i.qty || 0), 0)
  const damagedCount = items.filter((i) => i.condition === 'damaged' && i.qty > 0).length

  return (
    <PageWrapper>
      <PageHeader
        title="Sale Returns"
        description="Manage customer returns and restocking"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Create Return
          </Button>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <RotateCcw className="h-2.5 w-2.5" /> Total returns
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Pending
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.pending > 0 && 'text-amber-700')}>
            {stats.pending}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Truck className="h-2.5 w-2.5" /> Received
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.received > 0 && 'text-blue-700')}>
            {stats.received}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Restocked
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.restocked > 0 && 'text-success')}>
            {stats.restocked}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return #, SO # or customer…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all'}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-11 md:min-h-0',
                statusFilter === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : (returns ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed"><EmptyState title="No sale returns found" /></div>
      ) : (
        <div className="space-y-2">
          {(returns ?? []).map((ret) => {
            const cfg  = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending
            const next = STATUS_NEXT[ret.status]
            const canCancel = ret.status === 'pending' || ret.status === 'received'
            const damaged   = (ret.return_lines ?? []).filter((i) => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
            const totalQty  = (ret.return_lines ?? []).reduce((s, i) => s + i.qty, 0)
            const soRef     = soById.get(ret.source_id)
            const StatusIcon = cfg.Icon
            return (
              <div
                key={ret.id}
                className="group rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => setDetailReturn(ret)}
              >
                <div className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-mono font-semibold text-sm">{ret.return_number}</span>
                      <Badge className={cn('border text-[10px] gap-1', cfg.bg, cfg.color)}>
                        <StatusIcon className="h-2.5 w-2.5" /> {cfg.label}
                      </Badge>
                      {soRef && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <ShoppingCart className="h-3 w-3" />
                          <span className="font-mono">{soRef.so_number}</span>
                        </span>
                      )}
                      {soRef?.customer_name && (
                        <span className="text-[11px] text-muted-foreground truncate">· {soRef.customer_name}</span>
                      )}
                      {damaged > 0 && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px] gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />{damaged} damaged
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {next && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: next },
                            { onSuccess: () => toast.success(`Marked as ${STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          {STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 min-h-11 md:min-h-0 text-[11px] text-destructive hover:text-destructive" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: 'cancelled' },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ret.date)}</span>
                    <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{totalQty} unit{totalQty !== 1 ? 's' : ''} · {(ret.return_lines ?? []).length} line{(ret.return_lines ?? []).length !== 1 ? 's' : ''}</span>
                    <span className="truncate max-w-[240px]">Reason: {ret.reason}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SaleReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />

      {/* ── Create Sale Return Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); resetForm() } else setCreateOpen(true) }}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[52rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
            <DialogTitle className="text-sm font-semibold">Create Sale Return</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
            {/* SO / date row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="sr-so" className="text-[11px] text-muted-foreground">Sale Order (delivered) *</Label>
                <Select value={soId} onValueChange={(v) => handleSOSelect(v ?? '')}>
                  <SelectTrigger id="sr-so" className="h-9 text-xs w-full">
                    <SelectValue placeholder="Select sale order…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    {(saleOrders ?? []).length === 0 ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
                        No delivered sale orders yet.
                      </div>
                    ) : (
                      (saleOrders ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          <span className="font-mono font-semibold">{o.so_number}</span>
                          <span className="text-muted-foreground"> — {o.customer_name ?? 'Unknown customer'}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-date" className="text-[11px] text-muted-foreground">Return Date *</Label>
                <Input id="sr-date" type="date" className="h-9 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {/* SO context card */}
            {selectedSO && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <User className="h-2.5 w-2.5" /> Customer
                  </div>
                  <p className="font-semibold truncate">{selectedSO.customer_name ?? '—'}</p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <ShoppingCart className="h-2.5 w-2.5" /> SO Number
                  </div>
                  <p className="font-mono font-semibold truncate">{selectedSO.so_number}</p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Building2 className="h-2.5 w-2.5" /> Status
                  </div>
                  <p className="font-semibold capitalize">{(selectedSO.status ?? '').replace('_', ' ') || '—'}</p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Package className="h-2.5 w-2.5" /> Delivered lines
                  </div>
                  <p className="font-semibold">{returnableLineCount}</p>
                </div>
              </div>
            )}

            {/* Reason + restock warehouse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sr-reason" className="text-[11px] text-muted-foreground">Reason *</Label>
                <Select value={reasonSelect} onValueChange={(v) => { setReasonSelect(v ?? ''); if (v !== '__custom__') setCustomReason('') }}>
                  <SelectTrigger id="sr-reason" className="h-9 text-xs w-full">
                    <SelectValue placeholder="Select reason…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {reasons.map((r) => (
                      <SelectItem key={r.id} value={r.label} className="text-xs">{r.label}</SelectItem>
                    ))}
                    <SelectItem value="__custom__" className="text-xs">Custom Reason…</SelectItem>
                  </SelectContent>
                </Select>
                {reasonSelect === '__custom__' && (
                  <Input
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter custom reason…"
                    className="mt-1.5 h-9 text-xs"
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-restock-warehouse" className="text-[11px] text-muted-foreground">
                  Restock Warehouse <span className="text-muted-foreground/60 normal-case font-normal">(leave empty to skip restocking)</span>
                </Label>
                <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                  <SelectTrigger id="sr-restock-warehouse" className="h-9 text-xs w-full">
                    <SelectValue placeholder="No restocking" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="sr-notes" className="text-[11px] text-muted-foreground">Notes</Label>
              <Textarea
                id="sr-notes"
                className="text-xs min-h-[52px] resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this return…"
              />
            </div>

            {/* Items to return */}
            {items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-medium">Items to Return ({items.length})</Label>
                  {totalReturnQty > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {totalReturnQty} unit{totalReturnQty !== 1 ? 's' : ''} selected
                      {damagedCount > 0 && <span className="text-red-600"> · {damagedCount} damaged</span>}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const maxQty = item.delivered_qty ?? Infinity
                    const isSelected = item.qty > 0
                    const isDamaged = item.condition === 'damaged'
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'rounded-lg border transition-colors',
                          isSelected && isDamaged ? 'border-red-200/70 bg-red-50/30' :
                          isSelected ? 'border-primary/30 bg-primary/[0.03]' :
                          'bg-background'
                        )}
                      >
                        <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap items-center gap-1.5">
                          <p className="text-[12px] font-semibold text-foreground truncate">{item.item_name}</p>
                          {item.sku && <span className="text-[10px] text-muted-foreground">· {item.sku}</span>}
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            Delivered: <span className="tabular-nums font-medium text-foreground">{item.delivered_qty ?? 0}</span>
                          </span>
                        </div>
                        <div className="px-3 pb-2.5">
                          <div className="grid grid-cols-[1fr_6rem_6rem] gap-x-3 text-[9px] text-muted-foreground uppercase tracking-wide">
                            <span></span>
                            <span>Return qty</span>
                            <span>Condition</span>
                          </div>
                          <div className="grid grid-cols-[1fr_6rem_6rem] gap-x-3 items-center mt-1">
                            <div />
                            <Input
                              type="number"
                              min="0"
                              max={item.delivered_qty ?? undefined}
                              value={item.qty}
                              onChange={(e) => {
                                const u = [...items]
                                u[idx] = { ...u[idx], qty: Math.min(maxQty, Math.max(0, Number(e.target.value))) }
                                setItems(u)
                              }}
                              className="h-8 w-full text-right tabular-nums text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const u = [...items]
                                u[idx] = { ...u[idx], condition: isDamaged ? 'good' : 'damaged' }
                                setItems(u)
                              }}
                              className={cn(
                                'h-8 rounded-md border text-[11px] font-semibold transition-colors',
                                isDamaged
                                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                              )}
                            >
                              {isDamaged ? 'Damaged' : 'Good'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!soId && (
              <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
                <RotateCcw className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">Select a sale order to load returnable line items</p>
              </div>
            )}
          </div>

          <DialogFooter className="m-0 px-5 py-3 border-t bg-background rounded-b-lg">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => { setCreateOpen(false); resetForm() }} disabled={createReturn.isPending}>Cancel</Button>
            <Button size="sm" className="text-[11px] h-8" onClick={handleCreate} disabled={createReturn.isPending}>
              {createReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
