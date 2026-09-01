'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  useSaleReturns,
  useUpdateReturnStatus,
  useCreateCreditNoteForReturn,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import { useCreateReplacementDelivery, useRecordInventoryDisposition } from '@/hooks/useSaleDeliveries'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { SaleReturnDetailDialog } from '@/components/sales/SaleReturnDetailDialog'
import { CompleteInspectionDialog } from '@/components/sales/CompleteInspectionDialog'
import { ReplacementDeliveryDialog } from '@/components/sales/ReplacementDeliveryDialog'
import { CreateReturnDialog } from '@/components/sales/CreateReturnDialog'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import {
  Calendar, Package, ChevronRight, AlertTriangle, RotateCcw, Clock, Truck,
  CheckCircle2, Ban, ShoppingCart,
} from 'lucide-react'
import { useDeliveriesByReturnId } from '@/hooks/useSaleDeliveries'
import { useReturnProgress } from '@/hooks/useSaleReturns'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

function ReplacementChips({ returnId }: { returnId: string }) {
  const { data: deliveries = [] } = useDeliveriesByReturnId(returnId)
  if (deliveries.length === 0) return null
  return (
    <>
      {deliveries.map((d) => (
        <span
          key={d.id}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <Package className="h-3 w-3" />
          Replacement: {d.delivery_number}
        </span>
      ))}
    </>
  )
}

const RESOLUTION_LABEL: Record<string, string> = {
  replacement:  'replaced',
  refund:       'refunded',
  store_credit: 'store credit',
}

const DISPOSITION_LABEL: Record<string, string> = {
  write_off:          'write-off',
  restock_as_damaged: 'restock (damaged)',
  send_for_repair:    'sent for repair',
}

function ReturnLedgerSummary({ returnId }: { returnId: string }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress) return null

  // Customer-side breakdown (always shown).
  const custMix = progress.customer_resolutions_by_type ?? {}
  const customerParts: string[] = [`${progress.total_returned} returned`]
  for (const [type, qty] of Object.entries(custMix)) {
    if (qty > 0) customerParts.push(`${qty} ${RESOLUTION_LABEL[type] ?? type}`)
  }
  if (progress.customer_remaining > 0) {
    customerParts.push(`${progress.customer_remaining} remaining`)
  }

  // Inventory-side line only when the return had damaged units.
  const showInventoryLine = progress.total_damaged > 0
  const invMix = progress.inventory_dispositions_by_type ?? {}
  const inventoryParts: string[] = []
  if (showInventoryLine) {
    inventoryParts.push(`${progress.total_damaged} damaged`)
    for (const [type, qty] of Object.entries(invMix)) {
      if (qty > 0) inventoryParts.push(`${qty} ${DISPOSITION_LABEL[type] ?? type}`)
    }
    if (progress.inventory_remaining > 0) {
      inventoryParts.push(`${progress.inventory_remaining} un-dispositioned`)
    }
  }

  return (
    <span className="flex flex-col text-[11px] text-muted-foreground tabular-nums leading-tight min-w-0">
      <span className="truncate">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">Cust</span>
        {customerParts.join(' · ')}
      </span>
      {showInventoryLine && (
        <span className="truncate">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">Inv</span>
          {inventoryParts.join(' · ')}
        </span>
      )}
    </span>
  )
}

function CompensationMissingChip({ returnId }: { returnId: string }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress?.compensation_missing) return null
  return (
    <span
      title="Damaged units were dispositioned inventory-side but the customer received no matching refund / store credit / replacement."
      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
    >
      Compensation not recorded
    </span>
  )
}

const STATUS_CONFIG: Partial<Record<SaleReturn['status'], { label: string; color: string; bg: string; Icon: typeof Clock }>> = {
  pending:              { label: 'Pending',              color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Clock },
  pending_inspection:   { label: 'Pending Inspection',   color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', Icon: AlertTriangle },
  received:             { label: 'Received',             color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Truck },
  restocked:            { label: 'Restocked',            color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   Icon: CheckCircle2 },
  closed:               { label: 'Closed',               color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200',   Icon: CheckCircle2 },
  cancelled:            { label: 'Cancelled',            color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Ban },
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
  { value: 'pending_inspection', label: 'Inspection' },
  { value: 'received',  label: 'Received' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'closed',    label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function SaleReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleReturn['status'] | ''>('')
  // Tier 4 — the standalone create now reuses the shared CreateReturnDialog
  // (direct + inspection modes) after an SO picker, instead of a duplicate
  // inline form. Pick an SO → open CreateReturnDialog for it.
  const [createPickerOpen, setCreatePickerOpen] = useState(false)
  const [createSoId, setCreateSoId] = useState('')
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<SaleReturn | null>(null)
  const [inspectReturn, setInspectReturn] = useState<SaleReturn | null>(null)
  const [replacementReturn, setReplacementReturn] = useState<SaleReturn | null>(null)

  const { data: returns, isLoading } = useSaleReturns({ search, status: statusFilter || undefined })
  const { data: saleOrders } = useSaleOrders({ statuses: ['delivered', 'partial_delivery'] })

  const updateStatus = useUpdateReturnStatus()
  const createCreditNote = useCreateCreditNoteForReturn()
  const createReplacement = useCreateReplacementDelivery()
  const recordDisposition = useRecordInventoryDisposition()

  // SO lookup for enriching return list rows with SO # + customer + division
  const soById = useMemo(() => {
    const map = new Map<string, { so_number: string; customer_name: string | null; division_id: string | null }>()
    for (const o of saleOrders ?? []) {
      map.set(o.id, { so_number: o.so_number, customer_name: o.customer_name ?? null, division_id: o.division_id ?? null })
    }
    return map
  }, [saleOrders])

  // Scope the returns list to the active division via the source SO's division
  // (mirrors purchase/returns). No active division / unknown SO division → show.
  const { activeDivisionId } = useActiveDivision()
  const scopedReturns = useMemo(() => {
    const list = returns ?? []
    if (!activeDivisionId) return list
    return list.filter((r) => {
      const div = soById.get(r.source_id)?.division_id
      return !div || div === activeDivisionId
    })
  }, [returns, activeDivisionId, soById])

  const createSO = useMemo(
    () => (saleOrders ?? []).find((o) => o.id === createSoId) ?? null,
    [saleOrders, createSoId]
  )

  const stats = useMemo(() => {
    const list = scopedReturns
    let pending = 0, received = 0, restocked = 0
    for (const r of list) {
      if (r.status === 'pending')   pending++
      if (r.status === 'received')  received++
      if (r.status === 'restocked') restocked++
    }
    return { total: list.length, pending, received, restocked }
  }, [scopedReturns])

  return (
    <PageWrapper>
      <PageHeader
        title="Sale Returns"
        description="Manage customer returns and restocking"
        actions={
          <Button onClick={() => { setCreateSoId(''); setCreatePickerOpen(true) }}>
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
      ) : scopedReturns.length === 0 ? (
        <div className="rounded-lg border border-dashed"><EmptyState title="No sale returns found" /></div>
      ) : (
        <div className="space-y-2">
          {scopedReturns.map((ret, i) => {
            const cfg  = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending ?? { label: ret.status, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', Icon: Clock }
            const next = STATUS_NEXT[ret.status]
            const canCancel = ret.status === 'pending' || ret.status === 'received'
            const needsInspection = ret.status === 'pending_inspection'
            const needsCreditNote = !ret.credit_note_id && (ret.status === 'restocked' || ret.status === 'closed')
            const canResolve = ret.status === 'restocked'
            const cnPending = createCreditNote.isPending && createCreditNote.variables?.id === ret.id
            const damaged   = (ret.return_lines ?? []).filter((i) => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
            const totalQty  = (ret.return_lines ?? []).reduce((s, i) => s + i.qty, 0)
            const soRef     = soById.get(ret.source_id)
            const StatusIcon = cfg.Icon
            return (
              <div
                key={ret.id}
                className={cn('group rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer', STAGGER_IN)}
                style={staggerDelay(i)}
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
                      <ReplacementChips returnId={ret.id} />
                      <CompensationMissingChip returnId={ret.id} />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                      {needsInspection && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]"
                          onClick={() => setInspectReturn(ret)}>
                          Complete Inspection
                        </Button>
                      )}
                      {canResolve && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]"
                          onClick={() => setReplacementReturn(ret)}>
                          Resolve / Replace
                        </Button>
                      )}
                      {needsCreditNote && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]" disabled={createCreditNote.isPending}
                          onClick={() => createCreditNote.mutate(ret,
                            { onSuccess: () => toast.success(`Credit note created for ${ret.return_number}`), onError: (e) => toast.error(humanizeDbError(e)) }
                          )}>
                          {cnPending ? 'Creating…' : 'Create Credit Note'}
                        </Button>
                      )}
                      {next && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px]" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: next },
                            { onSuccess: () => toast.success(`Marked as ${STATUS_CONFIG[next]?.label ?? next}`), onError: (e) => toast.error(humanizeDbError(e)) }
                          )}>
                          {STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 min-h-11 md:min-h-0 text-[11px] text-destructive hover:text-destructive" disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: ret.id, status: 'cancelled' },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(humanizeDbError(e)) }
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
                    <ReturnLedgerSummary returnId={ret.id} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SaleReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />

      {/* S4 — Complete Inspection for a pending_inspection return (moves it to received). */}
      {inspectReturn && (
        <CompleteInspectionDialog
          open
          onOpenChange={(o) => { if (!o) setInspectReturn(null) }}
          ret={inspectReturn}
        />
      )}

      {/* S5/S6 — Resolve remaining: replacement lines + damaged dispositions in one atomic call. */}
      {replacementReturn && (
        <ReplacementDeliveryDialog
          open
          onOpenChange={(o) => { if (!o) setReplacementReturn(null) }}
          returnData={replacementReturn}
          soId={replacementReturn.source_id}
          currency="QAR"
          isPending={createReplacement.isPending || recordDisposition.isPending}
          onConfirm={async ({ warehouseId, lines, dispositions, giftItems }) => {
            try {
              if (lines.length > 0) {
                await createReplacement.mutateAsync({
                  soId:       replacementReturn.source_id,
                  returnId:   replacementReturn.id,
                  warehouseId,
                  lines,
                  dispositions,
                  giftItems: giftItems.map((g) => ({
                    item_name: g.item_name, sku: g.sku, qty: g.qty, brand_variant_id: g.brand_variant_id,
                  })),
                })
              } else if (dispositions.length > 0) {
                await recordDisposition.mutateAsync({ returnId: replacementReturn.id, warehouseId, dispositions })
              }
              const dispQty = dispositions.reduce((s, d) => s + d.qty, 0)
              if (lines.length > 0 && dispQty > 0) toast.success('Replacement delivery created; damaged units dispositioned')
              else if (lines.length > 0) toast.success('Replacement delivery created')
              else if (dispQty > 0) toast.success(`Damaged units dispositioned (${dispQty})`)
              setReplacementReturn(null)
            } catch (e) {
              toast.error(humanizeDbError(e))
            }
          }}
        />
      )}

      {/* Tier 4 — SO picker → shared CreateReturnDialog (direct + inspection). */}
      <Dialog open={createPickerOpen} onOpenChange={setCreatePickerOpen}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader><DialogTitle className="text-sm font-semibold">Create Sale Return</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-[11px] text-muted-foreground">Sale Order (delivered) *</Label>
            <Select value={createSoId} onValueChange={(v) => setCreateSoId(v ?? '')}>
              <SelectTrigger className="h-9 text-xs w-full"><SelectValue placeholder="Select sale order…" /></SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {(saleOrders ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">No delivered sale orders yet.</div>
                ) : (saleOrders ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    <span className="font-mono font-semibold">{o.so_number}</span>
                    <span className="text-muted-foreground"> — {o.customer_name ?? 'Unknown customer'}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => setCreatePickerOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-[11px] h-8" disabled={!createSoId} onClick={() => { setCreatePickerOpen(false); setCreateFormOpen(true) }}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createSO && (
        <CreateReturnDialog
          open={createFormOpen}
          onOpenChange={(o) => { setCreateFormOpen(o); if (!o) setCreateSoId('') }}
          so={createSO}
          fullSO={createSO}
          existingReturns={(returns ?? []).filter((r) => r.source_id === createSO.id)}
        />
      )}
    </PageWrapper>
  )
}
