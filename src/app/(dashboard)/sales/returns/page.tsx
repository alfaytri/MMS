'use client'

import { useState } from 'react'
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
  Calendar, Package, ChevronRight, AlertTriangle,
} from 'lucide-react'

const STATUS_CONFIG: Record<SaleReturn['status'], { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  received:  { label: 'Received',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  restocked: { label: 'Restocked', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  closed:    { label: 'Closed',    color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  cancelled: { label: 'Cancelled', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
}

const STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending:  'received',
  received: 'restocked',
  restocked: 'closed',
}

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
  const [items, setItems] = useState<(SaleReturn['items'][number] & { delivered_qty?: number })[]>([])

  const { data: returns, isLoading } = useSaleReturns({ search, status: statusFilter || undefined })
  const { data: saleOrders } = useSaleOrders({ statuses: ['delivered', 'partial_delivery'] })
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('sale_return')

  const createReturn = useCreateSaleReturn()
  const updateStatus = useUpdateReturnStatus()

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
          setCreateOpen(false); setSoId(''); setReasonSelect(''); setCustomReason(''); setNotes(''); setItems([])
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Sale Returns"
        description="Manage customer returns and restocking"
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create Return</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return number…" />
        <div className="flex flex-wrap gap-1.5">
          {(['', 'pending', 'received', 'restocked', 'closed', 'cancelled'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-9 sm:min-h-8',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
              )}>
              {s ? STATUS_CONFIG[s].label : 'All'}
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
            const damaged = ret.items.filter(i => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
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
                      {damaged > 0 && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px] gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />{damaged} damaged
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {next && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: next },
                            { onSuccess: () => toast.success(`Marked as ${STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          Mark {STATUS_CONFIG[next].label}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: 'cancelled' },
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

      <SaleReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />

      {/* ── Create Sale Return Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>Create Sale Return</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="sr-so">Sale Order (delivered) *</Label>
              <Select value={soId} onValueChange={(v) => handleSOSelect(v ?? '')}>
                <SelectTrigger id="sr-so">
                  <SelectValue placeholder="Select sale order…" />
                </SelectTrigger>
                <SelectContent>
                  {(saleOrders ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.so_number} — {o.customer_name ?? 'Unknown'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sr-date">Return Date *</Label>
                <Input id="sr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-restock-warehouse">Restock Warehouse</Label>
                <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                  <SelectTrigger id="sr-restock-warehouse">
                    <SelectValue placeholder="No restocking" />
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
              <Label htmlFor="sr-reason">Reason *</Label>
              <Select value={reasonSelect} onValueChange={(v) => { setReasonSelect(v ?? ''); if (v !== '__custom__') setCustomReason('') }}>
                <SelectTrigger id="sr-reason">
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
                <Label>Return Items</Label>
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.sku && <span>{item.sku} · </span>}
                        <span className="text-orange-600 font-medium">Delivered: {item.delivered_qty ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="0" max={item.delivered_qty ?? undefined} value={item.qty}
                        onChange={(e) => { const u = [...items]; const maxQty = item.delivered_qty ?? Infinity; u[idx] = { ...u[idx], qty: Math.min(maxQty, Math.max(0, Number(e.target.value))) }; setItems(u) }}
                        className="w-20 text-right" />
                      <button type="button"
                        onClick={() => { const u = [...items]; u[idx] = { ...u[idx], condition: item.condition === 'good' ? 'damaged' : 'good' }; setItems(u) }}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors min-h-9 min-w-[80px]',
                          item.condition === 'good'
                            ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                            : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100')}>
                        {item.condition === 'good' ? 'Good' : 'Damaged'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sr-notes">Notes</Label>
              <Textarea id="sr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
