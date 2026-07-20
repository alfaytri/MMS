'use client'

import { useState, useMemo, useEffect } from 'react'
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
  usePurchaseReturns,
  useCreatePurchaseReturn,
  useUpdatePOReturnStatus,
  type POReturn,
  type POReturnItem,
  type POReturnStatus,
} from '@/hooks/usePurchaseReturns'
import { useReturnReasons } from '@/hooks/useReturnReasons'
import { useReceivals } from '@/hooks/useReceivals'
import { usePurchaseOrders, usePurchaseOrder } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { POReturnDetailDialog } from '@/components/purchase/POReturnDetailDialog'
import { formatDate } from '@/lib/utils/formatters'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Calendar, Package, ChevronRight, Truck, Building2, RotateCcw, CheckCircle2, Clock, Ban,
  ShoppingCart,
} from 'lucide-react'

const STATUS_CONFIG: Record<POReturnStatus, { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  pending:            { label: 'Pending',            color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', Icon: Clock },
  dispatched:         { label: 'Dispatched',         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   Icon: Truck },
  supplier_confirmed: { label: 'Supplier Confirmed', color: 'text-green-700',  bg: 'bg-green-50 border-green-200', Icon: CheckCircle2 },
  closed:             { label: 'Closed',             color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200', Icon: CheckCircle2 },
  cancelled:          { label: 'Cancelled',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',     Icon: Ban },
}

const STATUS_NEXT: Partial<Record<POReturnStatus, POReturnStatus>> = {
  pending:            'dispatched',
  dispatched:         'supplier_confirmed',
  supplier_confirmed: 'closed',
}

const STATUS_LABEL: Record<string, string> = {
  dispatched:         'Mark Dispatched',
  supplier_confirmed: 'Confirm Receipt',
  closed:             'Close Return',
}

const STATUS_FILTERS: { value: '' | POReturnStatus; label: string }[] = [
  { value: '',                   label: 'All' },
  { value: 'pending',            label: 'Pending' },
  { value: 'dispatched',         label: 'Dispatched' },
  { value: 'supplier_confirmed', label: 'Confirmed' },
  { value: 'closed',             label: 'Closed' },
  { value: 'cancelled',          label: 'Cancelled' },
]

export default function PurchaseReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<POReturnStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<POReturn | null>(null)
  const [poId, setPoId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reasonSelect, setReasonSelect] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState<(POReturnItem & { _max: number; brand?: string | null; category?: string | null })[]>([])

  const { data: returns, isLoading } = usePurchaseReturns({ status: statusFilter || undefined })
  const { data: purchaseOrders } = usePurchaseOrders({})
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('po_return')
  const { data: selectedPO } = usePurchaseOrder(poId || null)
  const { data: allReceivals } = useReceivals({ status: 'approved', source_type: 'purchase' })

  // PO IDs that have at least one approved receival (source of truth for "returnable")
  const receivablePoIds = useMemo(() => {
    const set = new Set<string>()
    for (const r of allReceivals ?? []) {
      if (r.po_id) set.add(r.po_id)
    }
    return set
  }, [allReceivals])

  // PO lookup for enriching return list rows with supplier/po#
  const poById = useMemo(() => {
    const map = new Map<string, { po_number: string; supplier_name: string | null }>()
    for (const p of purchaseOrders ?? []) {
      map.set(p.id, { po_number: p.po_number, supplier_name: p.supplier_name ?? null })
    }
    return map
  }, [purchaseOrders])

  const bvIds = useMemo(() => items.map((i) => i.brand_variant_id).filter(Boolean) as string[], [items])
  const { data: whStockMap } = useWarehouseStockByItems(bvIds)
  const createReturn = useCreatePurchaseReturn()
  const updateStatus = useUpdatePOReturnStatus()

  // Warehouses that actually received stock from the selected PO — only these can dispatch a return
  const eligibleWarehousesForPo = useMemo(() => {
    if (!poId) return warehouses
    const receivalWhIds = new Set<string>()
    for (const r of allReceivals ?? []) {
      if (r.po_id === poId && r.warehouse_id) receivalWhIds.add(r.warehouse_id)
    }
    if (receivalWhIds.size === 0) return warehouses  // fallback (shouldn't happen for a PO that's in the dropdown)
    return warehouses.filter((w) => receivalWhIds.has(w.id))
  }, [poId, allReceivals, warehouses])

  // Auto-select the warehouse when only one is eligible for this PO
  useEffect(() => {
    if (!poId) { setWarehouseId(''); return }
    if (eligibleWarehousesForPo.length === 1) {
      setWarehouseId(eligibleWarehousesForPo[0].id)
    } else if (warehouseId && !eligibleWarehousesForPo.find((w) => w.id === warehouseId)) {
      setWarehouseId('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId, eligibleWarehousesForPo])

  // Client-side filter — return#, PO#, supplier
  const filtered = useMemo(() => {
    const list = returns ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => {
      const poRef = poById.get(r.source_id)
      const hay = [r.return_number, poRef?.po_number, poRef?.supplier_name]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [returns, search, poById])

  const stats = useMemo(() => {
    const list = returns ?? []
    let pending = 0, dispatched = 0, confirmed = 0
    for (const r of list) {
      if (r.status === 'pending')            pending++
      if (r.status === 'dispatched')         dispatched++
      if (r.status === 'supplier_confirmed') confirmed++
    }
    return { total: list.length, pending, dispatched, confirmed }
  }, [returns])

  // Received qty per PO line item — derived from approved receivals (source of truth)
  const receivedQtyByLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allReceivals ?? []) {
      if (r.po_id !== poId) continue
      for (const it of r.receival_items ?? []) {
        if (it.is_free || !it.po_line_item_id) continue
        map.set(it.po_line_item_id, (map.get(it.po_line_item_id) ?? 0) + it.qty_received)
      }
    }
    return map
  }, [allReceivals, poId])

  // Populate items from the joined PO detail (which includes brand/category joins)
  useEffect(() => {
    if (!poId || !selectedPO) { setItems([]); return }
    setItems(
      (selectedPO.po_line_items ?? [])
        .map((l) => {
          const receivedFromReceivals = receivedQtyByLine.get(l.id) ?? 0
          const received = Math.max(l.received_qty ?? 0, receivedFromReceivals)
          if (received <= 0) return null
          return {
            item_name: l.item_name || l.inventory_brand_variants?.inventory_items?.name_en || '(No name)',
            sku: l.sku ?? null,
            qty: 0,
            brand_variant_id: l.brand_variant_id ?? null,
            brand: l.inventory_brand_variants?.brand ?? null,
            category: l.inventory_brand_variants?.inventory_items?.inventory_categories?.name_en ?? null,
            condition: 'other' as const,
            condition_notes: null,
            _max: received,
          }
        })
        .filter(Boolean) as (POReturnItem & { _max: number; brand?: string | null; category?: string | null })[]
    )
  }, [poId, selectedPO, receivedQtyByLine])

  function handlePOSelect(id: string) {
    setPoId(id)
  }

  function getReason(): string {
    return reasonSelect === '__custom__' ? customReason : reasonSelect
  }

  function resetForm() {
    setPoId(''); setReasonSelect(''); setCustomReason(''); setNotes('')
    setItems([]); setWarehouseId('')
  }

  function handleCreate() {
    if (!poId)          { toast.error('Select a purchase order'); return }
    const reason = getReason()
    if (!reason)        { toast.error('Reason is required'); return }
    const valid = items.filter((i) => i.qty > 0)
    if (valid.length === 0) { toast.error('Enter qty for at least one item'); return }
    if (valid.some((i) => i.qty > i._max)) { toast.error('One or more quantities exceed the received amount'); return }
    createReturn.mutate(
      {
        source_id: poId,
        date,
        reason,
        items: valid.map(({ item_name, sku, qty, brand_variant_id, condition, condition_notes }) => ({ item_name, sku, qty, brand_variant_id, condition, condition_notes })),
        restock_warehouse_id: warehouseId || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Return created')
          setCreateOpen(false); resetForm()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Purchase Returns"
        description="Manage returns to suppliers"
        actions={<Button onClick={() => setCreateOpen(true)}><RotateCcw className="h-4 w-4 mr-1.5" /> Create Return</Button>}
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
            <Truck className="h-2.5 w-2.5" /> Dispatched
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.dispatched > 0 && 'text-blue-700')}>
            {stats.dispatched}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Confirmed
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.confirmed > 0 && 'text-success')}>
            {stats.confirmed}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return #, PO # or supplier…" />
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
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed"><EmptyState title="No purchase returns found" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ret) => {
            const cfg      = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending
            const next     = STATUS_NEXT[ret.status]
            const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
            const totalQty = (ret.return_lines ?? []).reduce((s, i) => s + i.qty, 0)
            const poRef    = poById.get(ret.source_id)
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
                      {poRef && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <ShoppingCart className="h-3 w-3" />
                          <span className="font-mono">{poRef.po_number}</span>
                        </span>
                      )}
                      {poRef?.supplier_name && (
                        <span className="text-[11px] text-muted-foreground truncate">· {poRef.supplier_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {next && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: next, sourceId: ret.source_id },
                            { onSuccess: () => toast.success(`Marked as ${STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          {STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 min-h-11 md:min-h-0 text-[11px] text-destructive hover:text-destructive" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: 'cancelled', sourceId: ret.source_id },
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

      <POReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />

      {/* ── Create PO Return Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); resetForm() } else setCreateOpen(true) }}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[52rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
            <DialogTitle className="text-sm font-semibold">Create Purchase Return</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
            {/* PO / date / warehouse row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pr-po" className="text-[11px] text-muted-foreground">Purchase Order (with receivals) *</Label>
                <Select value={poId} onValueChange={(v) => handlePOSelect(v ?? '')}>
                  <SelectTrigger id="pr-po" className="h-9 text-xs w-full">
                    <SelectValue placeholder="Select purchase order…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    {(() => {
                      const eligible = (purchaseOrders ?? []).filter((o) =>
                        receivablePoIds.has(o.id) || (o.po_line_items ?? []).some((l) => l.received_qty > 0)
                      )
                      if (eligible.length === 0) {
                        return (
                          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
                            No POs with recorded receivals yet.
                          </div>
                        )
                      }
                      return eligible.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          <span className="font-mono font-semibold">{o.po_number}</span>
                          <span className="text-muted-foreground"> — {o.supplier_name ?? 'Unknown supplier'}</span>
                        </SelectItem>
                      ))
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-date" className="text-[11px] text-muted-foreground">Return Date *</Label>
                <Input id="pr-date" type="date" className="h-9 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {/* PO context card */}
            {selectedPO && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Truck className="h-2.5 w-2.5" /> Supplier
                  </div>
                  <p className="font-semibold truncate">{selectedPO.supplier_name ?? '—'}</p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" /> Order date
                  </div>
                  <p className="font-semibold">
                    {selectedPO.created_at ? format(new Date(selectedPO.created_at), 'dd MMM yyyy') : '—'}
                  </p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Building2 className="h-2.5 w-2.5" /> Currency
                  </div>
                  <p className="font-semibold">{selectedPO.currency ?? 'QAR'}</p>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Package className="h-2.5 w-2.5" /> Returnable lines
                  </div>
                  <p className="font-semibold">{items.length}</p>
                </div>
              </div>
            )}

            {/* Reason + dispatch warehouse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pr-reason" className="text-[11px] text-muted-foreground">Reason *</Label>
                <Select value={reasonSelect} onValueChange={(v) => { setReasonSelect(v ?? ''); if (v !== '__custom__') setCustomReason('') }}>
                  <SelectTrigger id="pr-reason" className="h-9 text-xs w-full">
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
                <Label htmlFor="pr-dispatch-warehouse" className="text-[11px] text-muted-foreground">
                  Dispatch From Warehouse {poId && <span className="text-muted-foreground/60 normal-case font-normal">(where the receival was recorded)</span>}
                </Label>
                <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')} disabled={!poId || eligibleWarehousesForPo.length === 0}>
                  <SelectTrigger id="pr-dispatch-warehouse" className="h-9 text-xs w-full">
                    <SelectValue placeholder={poId ? 'Select warehouse…' : 'Pick a PO first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleWarehousesForPo.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="pr-notes" className="text-[11px] text-muted-foreground">Notes</Label>
              <Textarea
                id="pr-notes"
                className="text-xs min-h-[52px] resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this return…"
              />
            </div>

            {/* Items to return */}
            {items.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[11px] font-medium">Items to Return ({items.length})</Label>
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const whEntries = item.brand_variant_id ? (whStockMap.get(item.brand_variant_id) ?? []) : []
                    const isSelected = item.qty > 0
                    const isOverMax = item.qty > item._max
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'rounded-lg border transition-colors',
                          isOverMax ? 'border-destructive/40 bg-destructive/[0.03]' :
                          isSelected ? 'border-primary/30 bg-primary/[0.03]' :
                          'bg-background'
                        )}
                      >
                        {/* Header strip */}
                        <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap items-center gap-1.5">
                          {item.category && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">
                              {item.category}
                            </span>
                          )}
                          <p className="text-[12px] font-semibold text-foreground truncate">{item.item_name}</p>
                          {item.brand && <span className="text-[10px] text-primary">· {item.brand}</span>}
                          {item.sku && <span className="text-[10px] text-muted-foreground">· {item.sku}</span>}
                          <span className="ml-auto text-[10px] text-muted-foreground">Max: <span className="tabular-nums font-medium text-foreground">{item._max}</span></span>
                        </div>

                        {/* Body */}
                        <div className="px-3 pb-2.5 space-y-1.5">
                          <div className="grid grid-cols-[1fr_6rem] gap-x-3 text-[9px] text-muted-foreground uppercase tracking-wide">
                            <span>Stock on hand</span>
                            <span>Return qty</span>
                          </div>
                          <div className="grid grid-cols-[1fr_6rem] gap-x-3 items-center">
                            <div className="min-w-0">
                              {item.brand_variant_id ? (
                                whEntries.length > 0 ? (
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {whEntries.map((w) => {
                                      const whName = warehouses.find((wh) => wh.id === w.warehouse_id)?.name ?? 'Unknown'
                                      return (
                                        <span key={w.warehouse_id} className="text-[10px] text-muted-foreground">
                                          {whName}: <span className="font-medium text-foreground tabular-nums">{w.qty}</span>
                                        </span>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-amber-600">No stock in any warehouse</span>
                                )
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0"
                              max={item._max}
                              value={item.qty}
                              onChange={(e) => { const u = [...items]; u[idx] = { ...u[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }; setItems(u) }}
                              className={cn('h-8 w-full text-right tabular-nums text-xs', isOverMax && 'border-destructive')}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!poId && (
              <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
                <RotateCcw className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">Select a PO to load returnable line items</p>
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
