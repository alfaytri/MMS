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
  usePurchaseReturns,
  useCreatePurchaseReturn,
  useUpdatePOReturnStatus,
  type POReturn,
  type POReturnItem,
  type POReturnStatus,
} from '@/hooks/usePurchaseReturns'
import { useReturnReasons } from '@/hooks/useReturnReasons'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { POReturnDetailDialog } from '@/components/purchase/POReturnDetailDialog'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  RotateCcw, Calendar, Package, ChevronRight,
} from 'lucide-react'

const STATUS_CONFIG: Record<POReturnStatus, { label: string; color: string; bg: string }> = {
  pending:            { label: 'Pending',            color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  dispatched:         { label: 'Dispatched',         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  supplier_confirmed: { label: 'Supplier Confirmed', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  closed:             { label: 'Closed',             color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  cancelled:          { label: 'Cancelled',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
}

const STATUS_NEXT: Partial<Record<POReturnStatus, POReturnStatus>> = {
  pending:            'dispatched',
  dispatched:         'supplier_confirmed',
  supplier_confirmed: 'closed',
}

const STATUS_LABEL: Record<string, string> = {
  dispatched:         'Mark Dispatched',
  supplier_confirmed: 'Confirm Supplier Receipt',
  closed:             'Close Return',
}

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
  const [items, setItems] = useState<(POReturnItem & { _max: number })[]>([])

  const { data: returns, isLoading } = usePurchaseReturns({ search, status: statusFilter || undefined })
  const { data: purchaseOrders } = usePurchaseOrders({})
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('po_return')

  const bvIds = useMemo(() => items.map((i) => i.brand_variant_id).filter(Boolean) as string[], [items])
  const { data: whStockMap } = useWarehouseStockByItems(bvIds)
  const createReturn = useCreatePurchaseReturn()
  const updateStatus = useUpdatePOReturnStatus()

  function handlePOSelect(id: string) {
    setPoId(id)
    const po = (purchaseOrders ?? []).find((o) => o.id === id)
    if (!po) return
    setItems(
      (po.po_line_items ?? [])
        .filter((l) => l.received_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku ?? null, qty: 0, brand_variant_id: l.brand_variant_id ?? null, condition: 'other' as const, condition_notes: null, _max: l.received_qty }))
    )
  }

  function getReason(): string {
    return reasonSelect === '__custom__' ? customReason : reasonSelect
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
          setCreateOpen(false); setPoId(''); setReasonSelect(''); setCustomReason(''); setNotes(''); setItems([])
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
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create Return</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return number…" />
        <div className="flex flex-wrap gap-1.5">
          {(['', 'pending', 'dispatched', 'supplier_confirmed', 'closed', 'cancelled'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-9 sm:min-h-8',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
              )}>
              {s === 'supplier_confirmed' ? 'Confirmed' : s ? STATUS_CONFIG[s].label : 'All'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : (returns ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed"><EmptyState title="No purchase returns found" /></div>
      ) : (
        <div className="space-y-2">
          {(returns ?? []).map((ret) => {
            const cfg  = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending
            const next = STATUS_NEXT[ret.status]
            const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
            const totalQty = ret.items.reduce((s, i) => s + i.qty, 0)
            return (
              <div
                key={ret.id}
                className="group rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => setDetailReturn(ret)}
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm">{ret.return_number}</span>
                      <Badge className={cn('border text-[10px]', cfg.bg, cfg.color)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {next && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: next, sourceId: ret.source_id },
                            { onSuccess: () => toast.success(`Marked as ${STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          {STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: 'cancelled', sourceId: ret.source_id },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ret.date)}</span>
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{totalQty} unit{totalQty !== 1 ? 's' : ''} · {ret.items.length} line{ret.items.length !== 1 ? 's' : ''}</span>
                    <span className="truncate max-w-[200px]">{ret.reason}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <POReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />

      {/* ── Create PO Return Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>Create Purchase Return</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="pr-po">Purchase Order (with receivals) *</Label>
              <Select value={poId} onValueChange={(v) => handlePOSelect(v ?? '')}>
                <SelectTrigger id="pr-po">
                  <SelectValue placeholder="Select purchase order…" />
                </SelectTrigger>
                <SelectContent>
                  {(purchaseOrders ?? [])
                    .filter((o) => (o.po_line_items ?? []).some((l) => l.received_qty > 0))
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.po_number} — {o.supplier_name ?? 'Unknown'}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="pr-date">Return Date *</Label>
                <Input id="pr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-dispatch-warehouse">Dispatch From Warehouse</Label>
                <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                  <SelectTrigger id="pr-dispatch-warehouse">
                    <SelectValue placeholder="Select warehouse…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pr-reason">Reason *</Label>
              <Select value={reasonSelect} onValueChange={(v) => { setReasonSelect(v); if (v !== '__custom__') setCustomReason('') }}>
                <SelectTrigger id="pr-reason">
                  <SelectValue placeholder="Select reason…" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom Reason…</SelectItem>
                </SelectContent>
              </Select>
              {reasonSelect === '__custom__' && (
                <Input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Enter custom reason…"
                  className="mt-2"
                />
              )}
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                <Label>Items to Return</Label>
                {items.map((item, idx) => {
                  const whEntries = item.brand_variant_id ? (whStockMap.get(item.brand_variant_id) ?? []) : []
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.item_name}</div>
                        {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        <div className="text-xs text-muted-foreground">Max: {item._max}</div>
                        {item.brand_variant_id && (
                          whEntries.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {whEntries.map((w) => {
                                const whName = warehouses.find((wh) => wh.id === w.warehouse_id)?.name ?? 'Unknown'
                                return (
                                  <span key={w.warehouse_id} className="text-[10px] text-muted-foreground">
                                    {whName}: <span className="font-medium text-foreground">{w.qty}</span>
                                  </span>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-600 mt-0.5">No stock in any warehouse</div>
                          )
                        )}
                      </div>
                      <Input type="number" min="0" max={item._max} value={item.qty}
                        onChange={(e) => { const u = [...items]; u[idx] = { ...u[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }; setItems(u) }}
                        className="w-20 text-right" />
                    </div>
                  )
                })}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="pr-notes">Notes</Label>
              <Textarea id="pr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createReturn.isPending}>
              {createReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
