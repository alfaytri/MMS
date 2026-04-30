'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useSaleReturns,
  useCreateSaleReturn,
  useUpdateReturnStatus,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import {
  usePurchaseReturns,
  useCreatePurchaseReturn,
  useUpdatePOReturnStatus,
  type POReturn,
  type POReturnItem,
  type POReturnStatus,
} from '@/hooks/usePurchaseReturns'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// ─── Sale Return status config ────────────────────────────────────────────────
const SR_STATUS_CONFIG: Record<SaleReturn['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-warning text-warning' },
  received:  { label: 'Received',  className: 'border-blue-500 text-blue-500' },
  restocked: { label: 'Restocked', className: 'border-success text-success' },
  closed:    { label: 'Closed',    className: 'border-muted-foreground/50 text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'border-muted-foreground/30 text-muted-foreground/60' },
}

const SR_STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending:  'received',
  received: 'restocked',
  restocked: 'closed',
}

// ─── PO Return status config ──────────────────────────────────────────────────
const PR_STATUS_CONFIG: Record<POReturnStatus, { label: string; className: string }> = {
  pending:            { label: 'Pending',            className: 'border-warning text-warning' },
  dispatched:         { label: 'Dispatched',         className: 'border-blue-500 text-blue-500' },
  supplier_confirmed: { label: 'Supplier Confirmed', className: 'border-success text-success' },
  closed:             { label: 'Closed',             className: 'border-muted-foreground/50 text-muted-foreground' },
  cancelled:          { label: 'Cancelled',          className: 'border-muted-foreground/30 text-muted-foreground/60' },
}

const PR_STATUS_NEXT: Partial<Record<POReturnStatus, POReturnStatus>> = {
  pending:            'dispatched',
  dispatched:         'supplier_confirmed',
  supplier_confirmed: 'closed',
}

const PR_STATUS_LABEL: Record<string, string> = {
  dispatched:         'Mark Dispatched',
  supplier_confirmed: 'Confirm Supplier Receipt',
  closed:             'Close Return',
}

// ─── Inner component (uses useSearchParams — requires Suspense wrapper) ───────
function ReturnsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnType = (searchParams.get('type') ?? 'sale') as 'sale' | 'po'

  function setReturnType(t: 'sale' | 'po') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('type', t)
    router.replace(`?${params.toString()}`)
  }

  // ── Sale return state ──
  const [srSearch, setSrSearch] = useState('')
  const [srStatusFilter, setSrStatusFilter] = useState<SaleReturn['status'] | ''>('')
  const [srCreateOpen, setSrCreateOpen] = useState(false)
  const [srDetailReturn, setSrDetailReturn] = useState<SaleReturn | null>(null)
  const [soId, setSoId] = useState('')
  const [srDate, setSrDate] = useState(new Date().toISOString().split('T')[0])
  const [srReason, setSrReason] = useState('')
  const [srNotes, setSrNotes] = useState('')
  const [srWarehouseId, setSrWarehouseId] = useState('')
  const [srItems, setSrItems] = useState<SaleReturn['items']>([])

  // ── PO return state ──
  const [prSearch, setPrSearch] = useState('')
  const [prStatusFilter, setPrStatusFilter] = useState<POReturnStatus | ''>('')
  const [prCreateOpen, setPrCreateOpen] = useState(false)
  const [prDetailReturn, setPrDetailReturn] = useState<POReturn | null>(null)
  const [poId, setPoId] = useState('')
  const [prDate, setPrDate] = useState(new Date().toISOString().split('T')[0])
  const [prReason, setPrReason] = useState('')
  const [prNotes, setPrNotes] = useState('')
  const [prWarehouseId, setPrWarehouseId] = useState('')
  const [prItems, setPrItems] = useState<(POReturnItem & { _max: number })[]>([])

  // ── Queries ──
  const { data: saleReturns, isLoading: srLoading } = useSaleReturns({ search: srSearch, status: srStatusFilter || undefined })
  const { data: poReturns,   isLoading: prLoading }  = usePurchaseReturns({ search: prSearch, status: prStatusFilter || undefined })
  const { data: saleOrders }    = useSaleOrders({ status: 'delivered' })
  const { data: purchaseOrders } = usePurchaseOrders({})
  const { data: warehouses = [] } = useWarehouses()

  // ── Mutations ──
  const createSaleReturn  = useCreateSaleReturn()
  const updateSaleStatus  = useUpdateReturnStatus()
  const createPOReturn    = useCreatePurchaseReturn()
  const updatePOStatus    = useUpdatePOReturnStatus()

  // ── Sale return handlers ──
  function handleSOSelect(id: string) {
    setSoId(id)
    const so = (saleOrders ?? []).find((o) => o.id === id)
    if (!so) return
    setSrItems(
      (so.sale_order_lines ?? [])
        .filter((l) => l.delivered_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku, qty: 0, condition: 'good' as const, brand_variant_id: l.brand_variant_id }))
    )
  }

  function handleCreateSaleReturn() {
    if (!soId)    { toast.error('Select a sale order'); return }
    if (!srReason) { toast.error('Reason is required'); return }
    const items = srItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    createSaleReturn.mutate(
      { source_id: soId, date: srDate, reason: srReason, items, restock_warehouse_id: srWarehouseId || null, notes: srNotes || null },
      {
        onSuccess: () => { toast.success('Return created'); setSrCreateOpen(false); setSoId(''); setSrReason(''); setSrNotes(''); setSrItems([]) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // ── PO return handlers ──
  function handlePOSelect(id: string) {
    setPoId(id)
    const po = (purchaseOrders ?? []).find((o) => o.id === id)
    if (!po) return
    setPrItems(
      (po.po_line_items ?? [])
        .filter((l) => l.received_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku ?? null, qty: 0, brand_variant_id: l.brand_variant_id ?? null, condition: 'other' as const, condition_notes: null, _max: l.received_qty }))
    )
  }

  function handleCreatePOReturn() {
    if (!poId)     { toast.error('Select a purchase order'); return }
    if (!prReason) { toast.error('Reason is required'); return }
    const items = prItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    if (items.some((i) => i.qty > i._max)) { toast.error('One or more quantities exceed the received amount'); return }
    createPOReturn.mutate(
      {
        source_id: poId,
        date: prDate,
        reason: prReason,
        items: items.map(({ item_name, sku, qty, brand_variant_id, condition, condition_notes }) => ({ item_name, sku, qty, brand_variant_id, condition, condition_notes })),
        restock_warehouse_id: prWarehouseId || null,
        notes: prNotes || null,
      },
      {
        onSuccess: () => { toast.success('Return created'); setPrCreateOpen(false); setPoId(''); setPrReason(''); setPrNotes(''); setPrItems([]) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Returns"
        description="Manage returns and restocking"
        actions={
          <Button onClick={() => returnType === 'sale' ? setSrCreateOpen(true) : setPrCreateOpen(true)}>
            + Create Return
          </Button>
        }
      />

      {/* ── Type toggle + search ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Segmented toggle */}
        <div className="flex rounded-lg border p-1 gap-1 shrink-0">
          {(['sale', 'po'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setReturnType(t)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors min-h-11 sm:min-h-8',
                returnType === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              {t === 'sale' ? 'Sale Returns' : 'PO Returns'}
            </button>
          ))}
        </div>

        {returnType === 'sale' ? (
          <>
            <SearchInput value={srSearch} onChange={setSrSearch} placeholder="Search return number…" />
            <div className="flex flex-wrap gap-2">
              {(['', 'pending', 'received', 'restocked', 'closed', 'cancelled'] as const).map((s) => (
                <button key={s} onClick={() => setSrStatusFilter(s)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-11 sm:min-h-8',
                    srStatusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  )}>
                  {s || 'All'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <SearchInput value={prSearch} onChange={setPrSearch} placeholder="Search return number…" />
            <div className="flex flex-wrap gap-2">
              {(['', 'pending', 'dispatched', 'supplier_confirmed', 'closed', 'cancelled'] as const).map((s) => (
                <button key={s} onClick={() => setPrStatusFilter(s)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-11 sm:min-h-8',
                    prStatusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  )}>
                  {s === 'supplier_confirmed' ? 'Supplier Confirmed' : s || 'All'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Sale returns list ── */}
      {returnType === 'sale' && (
        srLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (saleReturns ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No sale returns found</div>
        ) : (
          <div className="space-y-3">
            {(saleReturns ?? []).map((ret) => {
              const cfg  = SR_STATUS_CONFIG[ret.status] ?? SR_STATUS_CONFIG.pending
              const next = SR_STATUS_NEXT[ret.status]
              const canCancel = ret.status === 'pending' || ret.status === 'received'
              return (
                <div key={ret.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="font-mono font-semibold text-sm hover:underline" onClick={() => setSrDetailReturn(ret)}>
                        {ret.return_number}
                      </button>
                      <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && (
                        <Button size="sm" variant="outline" disabled={updateSaleStatus.isPending}
                          onClick={() => updateSaleStatus.mutate({ id: ret.id, status: next },
                            { onSuccess: () => toast.success(`Marked as ${SR_STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          Mark as {SR_STATUS_CONFIG[next].label}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={updateSaleStatus.isPending}
                          onClick={() => updateSaleStatus.mutate({ id: ret.id, status: 'cancelled' },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}</div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── PO returns list ── */}
      {returnType === 'po' && (
        prLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (poReturns ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No PO returns found</div>
        ) : (
          <div className="space-y-3">
            {(poReturns ?? []).map((ret) => {
              const cfg  = PR_STATUS_CONFIG[ret.status] ?? PR_STATUS_CONFIG.pending
              const next = PR_STATUS_NEXT[ret.status]
              const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
              return (
                <div key={ret.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="font-mono font-semibold text-sm hover:underline" onClick={() => setPrDetailReturn(ret)}>
                        {ret.return_number}
                      </button>
                      <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && (
                        <Button size="sm" variant="outline" disabled={updatePOStatus.isPending}
                          onClick={() => updatePOStatus.mutate({ id: ret.id, status: next, sourceId: ret.source_id },
                            { onSuccess: () => toast.success(`Marked as ${PR_STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          {PR_STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={updatePOStatus.isPending}
                          onClick={() => updatePOStatus.mutate({ id: ret.id, status: 'cancelled', sourceId: ret.source_id },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}</div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Sale Return Detail Dialog ── */}
      <Dialog open={!!srDetailReturn} onOpenChange={(o) => { if (!o) setSrDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {srDetailReturn && (
            <>
              <DialogHeader><DialogTitle>Return {srDetailReturn.return_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(srDetailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {srDetailReturn.reason}</div>
                  {srDetailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {srDetailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Condition</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {srDetailReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{item.item_name}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${item.condition === 'damaged' ? 'border-destructive text-destructive' : 'border-success text-success'}`}>
                              {item.condition}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setSrDetailReturn(null)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── PO Return Detail Dialog ── */}
      <Dialog open={!!prDetailReturn} onOpenChange={(o) => { if (!o) setPrDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {prDetailReturn && (
            <>
              <DialogHeader><DialogTitle>Return {prDetailReturn.return_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(prDetailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {prDetailReturn.reason}</div>
                  {prDetailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {prDetailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {prDetailReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setPrDetailReturn(null)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Sale Return Dialog ── */}
      <Dialog open={srCreateOpen} onOpenChange={(o) => { if (!o) setSrCreateOpen(false) }}>
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
                <Input id="sr-date" type="date" value={srDate} onChange={(e) => setSrDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Restock Warehouse</Label>
                <Select value={srWarehouseId} onValueChange={(v) => setSrWarehouseId(v ?? '')}>
                  <SelectTrigger>
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
              <Input id="sr-reason" value={srReason} onChange={(e) => setSrReason(e.target.value)} placeholder="e.g. Defective item, wrong item shipped…" />
            </div>
            {srItems.length > 0 && (
              <div className="space-y-2">
                <Label>Return Items</Label>
                {srItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="0" value={item.qty}
                        onChange={(e) => { const u = [...srItems]; u[idx] = { ...u[idx], qty: Math.max(0, Number(e.target.value)) }; setSrItems(u) }}
                        className="w-20 text-right" />
                      <button type="button"
                        onClick={() => { const u = [...srItems]; u[idx] = { ...u[idx], condition: item.condition === 'good' ? 'damaged' : 'good' }; setSrItems(u) }}
                        className={cn('rounded-md border px-2 py-1 text-xs font-medium transition-colors min-h-9',
                          item.condition === 'good' ? 'border-success text-success' : 'border-destructive text-destructive')}>
                        {item.condition}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sr-notes">Notes</Label>
              <Textarea id="sr-notes" value={srNotes} onChange={(e) => setSrNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setSrCreateOpen(false)} disabled={createSaleReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreateSaleReturn} disabled={createSaleReturn.isPending}>
              {createSaleReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create PO Return Dialog ── */}
      <Dialog open={prCreateOpen} onOpenChange={(o) => { if (!o) setPrCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>Create PO Return</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label>Purchase Order (with receivals) *</Label>
              <Select value={poId} onValueChange={(v) => handlePOSelect(v ?? '')}>
                <SelectTrigger>
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
                <Input id="pr-date" type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dispatch From Warehouse</Label>
                <Select value={prWarehouseId} onValueChange={(v) => setPrWarehouseId(v ?? '')}>
                  <SelectTrigger>
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
              <Input id="pr-reason" value={prReason} onChange={(e) => setPrReason(e.target.value)} placeholder="e.g. Wrong item, damaged on arrival…" />
            </div>
            {prItems.length > 0 && (
              <div className="space-y-2">
                <Label>Items to Return</Label>
                {prItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                      <div className="text-xs text-muted-foreground">Max: {item._max}</div>
                    </div>
                    <Input type="number" min="0" max={item._max} value={item.qty}
                      onChange={(e) => { const u = [...prItems]; u[idx] = { ...u[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }; setPrItems(u) }}
                      className="w-20 text-right" />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="pr-notes">Notes</Label>
              <Textarea id="pr-notes" value={prNotes} onChange={(e) => setPrNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPrCreateOpen(false)} disabled={createPOReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreatePOReturn} disabled={createPOReturn.isPending}>
              {createPOReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}

// ─── Page export — wraps in Suspense required by useSearchParams ──────────────
export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-10 w-full" /></div>}>
      <ReturnsContent />
    </Suspense>
  )
}
