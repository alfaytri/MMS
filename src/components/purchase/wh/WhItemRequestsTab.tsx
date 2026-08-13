'use client'

import { useMemo, useState } from 'react'
import { Check, X, PackageSearch, Search, Package, ShoppingCart, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useWarehouseItemRequests,
  useCustodyAssignRequests,
  useResolveItemRequest,
  useMyResponsibleWarehouseIds,
  type WarehouseItemRequest,
} from '@/hooks/useWarehouseItemRequests'

type Props = { warehouses: { id: string; name: string }[] }
type TypeFilter = 'all' | 'in_inventory' | 'not_in_inventory'
type StatusFilter = 'pending' | 'resolved' | 'all'

type Line =
  | { kind: 'in_inventory'; id: string; item_name: string; qty: number; status: string; resolved: boolean; ref: string }
  | { kind: 'buy_new'; id: string; item_name: string; qty: number; status: 'pending' | 'fulfilled' | 'dismissed'; resolved: boolean; req: WarehouseItemRequest }

type Box = {
  key: string
  warehouse_id: string
  dest_name: string | null
  requester_name: string | null
  created_at: string
  lines: Line[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function inInvLabel(s: string) {
  return s === 'pending' ? 'Awaiting dispatch'
    : s === 'in_transit' ? 'Dispatched'
    : s === 'received' ? 'Received'
    : s === 'cancelled' ? 'Cancelled'
    : s
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{value}</span>
    </div>
  )
}

export function WhItemRequestsTab({ warehouses }: Props) {
  const [warehouseId, setWarehouseId] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [viewReq, setViewReq] = useState<WarehouseItemRequest | null>(null)

  const { data: permData } = usePermissions()
  const isAdmin = permData?.isSystemAdmin ?? false
  const { data: myWhIds = [] } = useMyResponsibleWarehouseIds()

  // In-inventory (custody assigns) aren't RLS-scoped, so pass an explicit id set:
  // a picked warehouse, else all (admins) or the RP's own warehouses.
  const custodyScope =
    warehouseId !== 'all' ? [warehouseId] : isAdmin ? undefined : myWhIds

  const { data: buyNew = [], isLoading: l1 } = useWarehouseItemRequests({
    status: 'all',
    warehouseIds: warehouseId === 'all' ? undefined : [warehouseId],
  })
  const { data: assigns = [], isLoading: l2 } = useCustodyAssignRequests(custodyScope)
  const resolve = useResolveItemRequest()
  const isLoading = l1 || l2

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—'

  const boxes = useMemo<Box[]>(() => {
    const map = new Map<string, Box>()
    const ensure = (key: string, seed: Omit<Box, 'lines' | 'key'>): Box => {
      let b = map.get(key)
      if (!b) {
        b = { key, lines: [], ...seed }
        map.set(key, b)
      } else if (seed.created_at > b.created_at) {
        b.created_at = seed.created_at
      }
      return b
    }

    for (const r of buyNew) {
      const key = r.request_group_id ?? `req:${r.id}`
      const b = ensure(key, {
        warehouse_id: r.warehouse_id,
        dest_name: r.dest_name,
        requester_name: r.requester_name,
        created_at: r.created_at,
      })
      b.lines.push({
        kind: 'buy_new', id: r.id, item_name: r.item_name, qty: r.qty,
        status: r.status as 'pending' | 'fulfilled' | 'dismissed',
        resolved: r.status !== 'pending', req: r,
      })
    }

    for (const t of assigns) {
      const key = t.request_group_id ?? `tr:${t.id}`
      const b = ensure(key, {
        warehouse_id: t.from_warehouse_id,
        dest_name: t.dest_name,
        requester_name: t.requester_name,
        created_at: t.created_at,
      })
      const resolved = t.status !== 'pending'
      for (const it of t.items) {
        b.lines.push({
          kind: 'in_inventory', id: it.id, item_name: it.item_name, qty: it.requested_qty,
          status: t.status, resolved, ref: t.transfer_number,
        })
      }
    }

    return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [buyNew, assigns])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return boxes
      .map((box) => {
        let lines = box.lines
        if (typeFilter === 'in_inventory') lines = lines.filter((l) => l.kind === 'in_inventory')
        else if (typeFilter === 'not_in_inventory') lines = lines.filter((l) => l.kind === 'buy_new')
        if (statusFilter === 'pending') lines = lines.filter((l) => !l.resolved)
        else if (statusFilter === 'resolved') lines = lines.filter((l) => l.resolved)
        return { ...box, lines }
      })
      .filter((box) => box.lines.length > 0)
      .filter((box) => {
        if (!q) return true
        return (
          (box.requester_name ?? '').toLowerCase().includes(q) ||
          box.lines.some((l) => l.item_name.toLowerCase().includes(q))
        )
      })
  }, [boxes, typeFilter, statusFilter, search])

  async function doResolve(lineId: string, next: 'fulfilled' | 'dismissed') {
    try {
      await resolve.mutateAsync({ id: lineId, status: next })
      toast.success(next === 'fulfilled' ? 'Marked fulfilled' : 'Dismissed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve the request')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? 'all')}>
          <SelectTrigger className="h-11 sm:h-9 text-xs w-full sm:w-[200px]"><SelectValue placeholder="All warehouses" /></SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all">All warehouses</SelectItem>
            {warehouses.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter((v ?? 'all') as TypeFilter)}>
          <SelectTrigger className="h-11 sm:h-9 text-xs w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="in_inventory">In inventory</SelectItem>
            <SelectItem value="not_in_inventory">Not in inventory</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? 'pending') as StatusFilter)}>
          <SelectTrigger className="h-11 sm:h-9 text-xs w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or requester…" className="h-11 sm:h-9 pl-7 text-xs" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-xs text-muted-foreground py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No {statusFilter !== 'all' ? statusFilter : ''} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((box) => (
            <div key={box.key} className="rounded-lg border bg-card overflow-hidden">
              {/* Box header */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 bg-muted/40 border-b text-xs">
                <span className="font-semibold">{box.dest_name ?? '—'}</span>
                <span className="text-muted-foreground">{whName(box.warehouse_id)}</span>
                <span className="text-muted-foreground">· {box.requester_name ?? '—'}</span>
                <span className="text-muted-foreground ml-auto">{fmtDate(box.created_at)}</span>
              </div>
              {/* Lines */}
              <div className="divide-y">
                {box.lines.map((line) => {
                  const pendingBuyNew = line.kind === 'buy_new' && !line.resolved
                  return (
                    <div
                      key={`${line.kind}-${line.id}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2',
                        pendingBuyNew && 'bg-destructive/5 motion-safe:animate-pulse',
                        line.resolved && 'opacity-60',
                      )}
                    >
                      {line.kind === 'in_inventory' ? (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-border font-normal shrink-0">
                          <Package className="h-3 w-3" /> In inventory
                        </Badge>
                      ) : (
                        <Badge className={cn('text-[10px] h-5 px-1.5 gap-1 border font-normal shrink-0',
                          line.resolved ? 'bg-muted text-muted-foreground border-border' : 'bg-destructive/10 text-destructive border-destructive/40')}>
                          <ShoppingCart className="h-3 w-3" /> Buy new
                        </Badge>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium break-words">{line.item_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Qty {line.qty}
                          {line.kind === 'in_inventory' && <> · {inInvLabel(line.status)} · {line.ref}</>}
                          {line.kind === 'buy_new' && line.resolved && <> · {line.status}</>}
                        </p>
                      </div>

                      {line.kind === 'buy_new' ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 min-h-11 sm:min-h-0 px-2" title="View details" onClick={() => setViewReq(line.req)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!line.resolved && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 min-h-11 sm:min-h-0 text-[11px] gap-1 text-success" disabled={resolve.isPending} onClick={() => doResolve(line.id, 'fulfilled')}>
                                <Check className="h-3 w-3" /> Fulfill
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 min-h-11 sm:min-h-0 text-[11px] gap-1 text-muted-foreground" disabled={resolve.isPending} onClick={() => doResolve(line.id, 'dismissed')}>
                                <X className="h-3 w-3" /> Dismiss
                              </Button>
                            </>
                          )}
                        </div>
                      ) : line.kind === 'in_inventory' && line.resolved ? (
                        <Check className="h-4 w-4 text-success shrink-0" />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewReq} onOpenChange={(o) => !o && setViewReq(null)}>
        <DialogContent
          className={cn(
            'flex flex-col p-0 gap-0 overflow-hidden',
            // Mobile: bottom sheet — content-height, anchored to the bottom edge (no empty full-screen void).
            // rounded-none replaces the primitive's rounded-xl (tailwind-merge only drops the shorthand,
            // not side utilities), then max-sm rounds the top edge only for the sheet look.
            'inset-x-0 bottom-0 top-auto left-0 w-full max-w-full translate-x-0 translate-y-0 rounded-none max-sm:rounded-t-2xl max-h-[85vh]',
            // sm+: restore the centered card (fully rounded).
            'sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-2rem)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          )}
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b">
            <DialogTitle className="text-sm">Requested item</DialogTitle>
          </DialogHeader>
          {viewReq && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-base font-semibold leading-snug break-words">{viewReq.item_name}</p>
                <Badge className="text-[10px] h-5 px-1.5 gap-1 border bg-destructive/10 text-destructive border-destructive/40 shrink-0">
                  <ShoppingCart className="h-3 w-3" /> Buy new
                </Badge>
              </div>
              <div className="rounded-lg border divide-y bg-muted/20">
                <Field label="Qty" value={Number(viewReq.qty).toLocaleString('en-US')} />
                <Field label="Description" value={viewReq.notes || '—'} />
                <Field label="Requested by" value={viewReq.requester_name || '—'} />
                <Field label="For" value={viewReq.dest_name || '—'} />
                <Field label="Warehouse" value={whName(viewReq.warehouse_id)} />
                <Field label="Requested" value={fmtDate(viewReq.created_at)} />
                <Field label="Status" value={viewReq.status.replace(/^./, (c) => c.toUpperCase())} />
                {viewReq.status !== 'pending' && (
                  <Field
                    label="Resolved"
                    value={`${viewReq.resolved_at ? fmtDate(viewReq.resolved_at) : ''}${viewReq.resolution_note ? ` — ${viewReq.resolution_note}` : ''}`}
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
