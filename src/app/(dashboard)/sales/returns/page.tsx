'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useSaleReturns,
  useCreateSaleReturn,
  useUpdateReturnStatus,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<SaleReturn['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-warning text-warning' },
  received:  { label: 'Received',  className: 'border-blue-500 text-blue-500' },
  restocked: { label: 'Restocked', className: 'border-success text-success' },
  closed:    { label: 'Closed',    className: 'border-muted-foreground/50 text-muted-foreground' },
}

const STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending: 'received',
  received: 'restocked',
  restocked: 'closed',
}

export default function SaleReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleReturn['status'] | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<SaleReturn | null>(null)

  // Create return form state
  const [soId, setSoId] = useState('')
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [returnItems, setReturnItems] = useState<SaleReturn['items']>([])

  const { data: returns, isLoading } = useSaleReturns({ search, status: statusFilter || undefined })
  const { data: orders } = useSaleOrders({ status: 'delivered' })
  const { data: warehouses } = useWarehouses()
  const createReturn = useCreateSaleReturn()
  const updateStatus = useUpdateReturnStatus()

  function handleSOSelect(id: string) {
    setSoId(id)
    const so = (orders ?? []).find((o) => o.id === id)
    if (!so) return
    setReturnItems(
      (so.sale_order_lines ?? [])
        .filter((l) => l.delivered_qty > 0)
        .map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty: 0,
          condition: 'good' as const,
          brand_variant_id: l.brand_variant_id,
        }))
    )
  }

  function handleCreateReturn() {
    if (!soId) { toast.error('Select a sale order'); return }
    if (!reason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }

    createReturn.mutate(
      {
        source_id: soId,
        date: returnDate,
        reason,
        items,
        restock_warehouse_id: warehouseId || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Return created')
          setCreateOpen(false)
          setSoId(''); setReason(''); setNotes(''); setReturnItems([])
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAdvanceStatus(ret: SaleReturn) {
    const next = STATUS_NEXT[ret.status]
    if (!next) return
    updateStatus.mutate(
      { id: ret.id, status: next },
      {
        onSuccess: () => toast.success(`Return marked as ${next}`),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale Returns"
        description="Manage customer returns and restocking"
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create Return</Button>}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return number…" />
        <div className="flex flex-wrap gap-2">
          {(['', 'pending', 'received', 'restocked', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Returns list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : (returns ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No sale returns found
        </div>
      ) : (
        <div className="space-y-3">
          {(returns ?? []).map((ret) => {
            const cfg = STATUS_CONFIG[ret.status]
            const next = STATUS_NEXT[ret.status]
            return (
              <div key={ret.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="font-mono font-semibold text-sm hover:underline"
                      onClick={() => setDetailReturn(ret)}
                    >
                      {ret.return_number}
                    </button>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdvanceStatus(ret)}
                      disabled={updateStatus.isPending}
                    >
                      Mark as {STATUS_CONFIG[next].label}
                    </Button>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Return Detail Dialog */}
      <Dialog open={!!detailReturn} onOpenChange={(open) => { if (!open) setDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {detailReturn && (
            <>
              <DialogHeader>
                <DialogTitle>Return {detailReturn.return_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(detailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {detailReturn.reason}</div>
                  {detailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {detailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Condition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailReturn.items.map((item, idx) => (
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailReturn(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Return Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create Sale Return</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="return-so">Sale Order (delivered) *</Label>
              <select
                id="return-so"
                value={soId}
                onChange={(e) => handleSOSelect(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select sale order…</option>
                {(orders ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.so_number} — {o.customer_name ?? 'Unknown'}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="return-date">Return Date *</Label>
                <Input id="return-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="return-warehouse">Restock Warehouse</Label>
                <select
                  id="return-warehouse"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">No restocking</option>
                  {(warehouses ?? []).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="return-reason">Reason *</Label>
              <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective item, wrong item shipped…" />
            </div>

            {returnItems.length > 0 && (
              <div className="space-y-2">
                <Label>Return Items</Label>
                {returnItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], qty: Math.max(0, Number(e.target.value)) }
                          setReturnItems(updated)
                        }}
                        className="w-20 text-right"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], condition: item.condition === 'good' ? 'damaged' : 'good' }
                          setReturnItems(updated)
                        }}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs font-medium transition-colors min-h-9',
                          item.condition === 'good'
                            ? 'border-success text-success'
                            : 'border-destructive text-destructive'
                        )}
                      >
                        {item.condition}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="return-notes">Notes</Label>
              <Textarea id="return-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createReturn.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreateReturn} disabled={createReturn.isPending}>
              {createReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
