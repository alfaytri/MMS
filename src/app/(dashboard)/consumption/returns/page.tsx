'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  RotateCcw, Calendar, Package, ChevronRight, AlertTriangle, Clock, CheckCircle2, Ban,
  Boxes, User, Hash, Undo2, PackageX, ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useReturnProgress } from '@/hooks/useSaleReturns'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'
import {
  useConsumptionReturns, useReturnableConsumptions, useConsumptionReturnableLines,
  useCreateConsumptionReturn, useProcessConsumptionReturnRestock,
  useRecordConsumptionReturnDisposition, useCancelConsumptionReturn,
  useCompleteConsumptionReturnInspection,
  type ConsumptionReturn, type ConsumptionReturnStatus,
} from '@/hooks/useConsumptionReturns'

const STATUS_CONFIG: Partial<Record<ConsumptionReturnStatus, { label: string; color: string; bg: string; Icon: typeof Clock }>> = {
  pending:            { label: 'Pending',            color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   Icon: Clock },
  pending_inspection: { label: 'Pending Inspection', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', Icon: AlertTriangle },
  received:           { label: 'Received',           color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     Icon: Package },
  restocked:          { label: 'Restocked',          color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   Icon: CheckCircle2 },
  closed:             { label: 'Closed',             color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200',   Icon: CheckCircle2 },
  cancelled:          { label: 'Cancelled',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       Icon: Ban },
}

const STATUS_FILTERS: { value: '' | ConsumptionReturnStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function ConsumptionReturnsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ConsumptionReturnStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<ConsumptionReturn | null>(null)
  const [dispositionFor, setDispositionFor] = useState<ConsumptionReturn | null>(null)
  const [inspectFor, setInspectFor] = useState<ConsumptionReturn | null>(null)

  const { activeDivisionId } = useActiveDivision()
  const { data: returns, isLoading } = useConsumptionReturns({ search, status: statusFilter || undefined })

  const scoped = useMemo(() => {
    const list = returns ?? []
    if (!activeDivisionId) return list
    return list.filter((r) => !r.division_id || r.division_id === activeDivisionId)
  }, [returns, activeDivisionId])

  const stats = useMemo(() => {
    let pending = 0, restocked = 0, closed = 0
    for (const r of scoped) {
      if (r.status === 'pending') pending++
      if (r.status === 'restocked') restocked++
      if (r.status === 'closed') closed++
    }
    return { total: scoped.length, pending, restocked, closed }
  }, [scoped])

  const restock = useProcessConsumptionReturnRestock()
  const cancel = useCancelConsumptionReturn()

  return (
    <PageWrapper>
      <PageHeader
        title="Consumption Returns"
        description="Return stock from a posted consumption — good stock is re-layered and the consumption cost reversed; damaged stock is written off or restocked as damaged."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Create Return
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total returns', value: stats.total, Icon: RotateCcw, tone: '' },
          { label: 'Pending', value: stats.pending, Icon: Clock, tone: stats.pending > 0 ? 'text-amber-700' : '' },
          { label: 'Restocked', value: stats.restocked, Icon: CheckCircle2, tone: stats.restocked > 0 ? 'text-green-700' : '' },
          { label: 'Closed', value: stats.closed, Icon: CheckCircle2, tone: '' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-background px-3 py-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <s.Icon className="h-2.5 w-2.5" /> {s.label}
            </div>
            <p className={cn('text-lg font-bold tabular-nums leading-tight', s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search return #…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all'}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-11 md:min-h-0',
                statusFilter === s.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : scoped.length === 0 ? (
        <div className="rounded-lg border border-dashed"><EmptyState title="No consumption returns yet" description="Create a return from a posted consumption to reverse its cost and put good stock back." /></div>
      ) : (
        <div className="space-y-2">
          {scoped.map((ret, i) => {
            const cfg = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending!
            const StatusIcon = cfg.Icon
            const lines = ret.return_lines ?? []
            const totalQty = lines.reduce((s, l) => s + l.qty, 0)
            const goodQty = lines.filter((l) => l.condition === 'good').reduce((s, l) => s + l.qty, 0)
            const damagedQty = lines.filter((l) => l.condition === 'damaged').reduce((s, l) => s + l.qty, 0)
            const inspectionQty = lines.filter((l) => l.condition === 'inspection').reduce((s, l) => s + l.qty, 0)
            // A consumption return can arrive as pending_inspection with a single
            // inspection line (covered warranty claim resolution, Phase 4). It must
            // be split into good / damaged before Restock / Disposition apply.
            const canInspect = ret.status === 'pending_inspection' && inspectionQty > 0
            const canRestock = goodQty > 0 && !ret.restocked_at && ret.status !== 'cancelled' && ret.status !== 'closed'
            const canDisposition = damagedQty > 0 && ret.status !== 'cancelled' && ret.status !== 'closed'
            const canCancel = ret.status === 'pending' || ret.status === 'received'
            return (
              <div
                key={ret.id}
                className={cn('group rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer', STAGGER_IN)}
                style={staggerDelay(i)}
                onClick={() => setDetail(ret)}
              >
                <div className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-mono font-semibold text-sm">{ret.return_number}</span>
                      <Badge className={cn('border text-[10px] gap-1', cfg.bg, cfg.color)}>
                        <StatusIcon className="h-2.5 w-2.5" /> {cfg.label}
                      </Badge>
                      {ret.ce_number && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Boxes className="h-3 w-3" /><span className="font-mono">{ret.ce_number}</span>
                        </span>
                      )}
                      {damagedQty > 0 && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px] gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />{damagedQty} damaged
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {canInspect && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px] gap-1"
                          onClick={() => setInspectFor(ret)}>
                          <ClipboardCheck className="h-3 w-3" /> Inspect
                        </Button>
                      )}
                      {canRestock && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px] gap-1"
                          disabled={restock.isPending}
                          onClick={() => restock.mutate(ret.id, {
                            onSuccess: () => toast.success('Good stock restocked & cost reversed'),
                            onError: (e) => toast.error(humanizeDbError(e)),
                          })}>
                          <Undo2 className="h-3 w-3" /> Restock good
                        </Button>
                      )}
                      {canDisposition && (
                        <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-[11px] gap-1"
                          onClick={() => setDispositionFor(ret)}>
                          <PackageX className="h-3 w-3" /> Disposition
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="h-7 min-h-11 md:min-h-0 text-[11px] text-destructive hover:text-destructive"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(ret.id, {
                            onSuccess: () => toast.success('Return cancelled'),
                            onError: (e) => toast.error(humanizeDbError(e)),
                          })}>
                          Cancel
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ret.date)}</span>
                    <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{totalQty} unit{totalQty !== 1 ? 's' : ''} · {lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                    {goodQty > 0 && <span className="text-green-700">{goodQty} good</span>}
                    <span className="truncate max-w-[240px]">Reason: {ret.reason}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {createOpen && <CreateConsumptionReturnDialog onClose={() => setCreateOpen(false)} />}
      {detail && <ConsumptionReturnDetailDialog ret={detail} onClose={() => setDetail(null)} />}
      {dispositionFor && <DispositionDialog ret={dispositionFor} onClose={() => setDispositionFor(null)} />}
      {inspectFor && <CompleteInspectionDialog ret={inspectFor} onClose={() => setInspectFor(null)} />}
    </PageWrapper>
  )
}

// ─── Create dialog ───────────────────────────────────────────────────────────
function CreateConsumptionReturnDialog({ onClose }: { onClose: () => void }) {
  const [consumptionId, setConsumptionId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [restockWarehouseId, setRestockWarehouseId] = useState('')
  const [rows, setRows] = useState<Record<string, { qty: number; condition: 'good' | 'damaged' }>>({})

  const { data: consumptions = [] } = useReturnableConsumptions()
  const { data: lines = [] } = useConsumptionReturnableLines(consumptionId || null)
  const { data: warehouses = [] } = useWarehouses()
  const realWarehouses = useMemo(() => warehouses.filter((w) => !w.is_virtual), [warehouses])
  const create = useCreateConsumptionReturn()

  const availableLines = useMemo(() => lines.filter((l) => l.returnable_qty > 0), [lines])

  useEffect(() => { setRows({}) }, [consumptionId])

  const totalQty = Object.values(rows).reduce((s, r) => s + (r.qty || 0), 0)
  const anyGood = Object.values(rows).some((r) => r.qty > 0 && r.condition === 'good')

  function handleCreate() {
    if (!consumptionId) { toast.error('Select a consumption'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }
    const items = availableLines
      .map((l) => ({ line: l, row: rows[l.consumption_line_id] }))
      .filter(({ row }) => row && row.qty > 0)
      .map(({ line, row }) => ({
        consumption_line_id: line.consumption_line_id,
        brand_variant_id: line.brand_variant_id,
        item_name: line.item_name,
        sku: line.sku,
        qty: row!.qty,
        condition: row!.condition,
      }))
    if (items.length === 0) { toast.error('Enter qty for at least one line'); return }
    if (items.some((it) => { const l = availableLines.find((x) => x.consumption_line_id === it.consumption_line_id)!; return it.qty > l.returnable_qty })) {
      toast.error('One or more quantities exceed the returnable amount'); return
    }
    if (anyGood && !restockWarehouseId) { toast.error('Pick a restock warehouse for the good stock'); return }
    create.mutate({
      source_id: consumptionId, date, reason: reason.trim(),
      restock_warehouse_id: restockWarehouseId || null, notes: notes || null, items,
    }, {
      onSuccess: () => { toast.success('Consumption return created'); onClose() },
      onError: (e) => toast.error(humanizeDbError(e)),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[52rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
          <DialogTitle className="text-sm font-semibold">Create Consumption Return</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Consumption (posted) *</Label>
              <Select value={consumptionId} onValueChange={(v) => setConsumptionId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs w-full"><SelectValue placeholder="Select a posted consumption…" /></SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {consumptions.length === 0 ? (
                    <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">No posted consumptions.</div>
                  ) : consumptions.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      <span className="font-mono font-semibold">{c.ce_number}</span>
                      <span className="text-muted-foreground"> — {formatDate(c.date)} · {c.consumer_type}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Return Date *</Label>
              <Input type="date" className="h-9 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Reason *</Label>
              <Input className="h-9 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. over-issued, wrong item, unused" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Restock warehouse {anyGood ? '*' : '(good stock)'}</Label>
              <Select value={restockWarehouseId} onValueChange={(v) => setRestockWarehouseId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs w-full"><SelectValue placeholder="Where good stock returns to…" /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {realWarehouses.map((w) => (<SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea className="text-xs min-h-[52px] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about this return…" />
          </div>

          {consumptionId && availableLines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium">Lines to Return ({availableLines.length})</Label>
                {totalQty > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{totalQty} unit{totalQty !== 1 ? 's' : ''} selected</span>}
              </div>
              <div className="space-y-2">
                {availableLines.map((l) => {
                  const row = rows[l.consumption_line_id] ?? { qty: 0, condition: 'good' as const }
                  const isDamaged = row.condition === 'damaged'
                  const over = row.qty > l.returnable_qty
                  return (
                    <div key={l.consumption_line_id} className={cn('rounded-lg border transition-colors', over ? 'border-destructive/40 bg-destructive/[0.03]' : row.qty > 0 && isDamaged ? 'border-red-200/70 bg-red-50/30' : row.qty > 0 ? 'border-primary/30 bg-primary/[0.03]' : 'bg-background')}>
                      <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap items-center gap-1.5">
                        <p className="text-[12px] font-semibold truncate">{l.item_name}</p>
                        {l.sku && <span className="text-[10px] text-muted-foreground">· {l.sku}</span>}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          Returnable: <span className="tabular-nums font-medium text-foreground">{l.returnable_qty}</span>
                          {l.already_returned_qty > 0 && ` · prior ${l.already_returned_qty}`}
                        </span>
                      </div>
                      <div className="px-3 pb-2.5 grid grid-cols-[1fr_6rem_6rem] gap-x-3 items-center">
                        <div />
                        <Input type="number" min="0" max={l.returnable_qty} value={row.qty}
                          onChange={(e) => {
                            const parsed = Number(e.target.value)
                            const qty = Math.min(l.returnable_qty, Math.max(0, Number.isFinite(parsed) ? parsed : 0))
                            setRows((p) => ({ ...p, [l.consumption_line_id]: { qty, condition: row.condition } }))
                          }}
                          className="h-8 w-full text-right tabular-nums text-xs" />
                        <button type="button"
                          onClick={() => setRows((p) => ({ ...p, [l.consumption_line_id]: { qty: row.qty, condition: isDamaged ? 'good' : 'damaged' } }))}
                          className={cn('h-8 rounded-md border text-[11px] font-semibold transition-colors', isDamaged ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100')}>
                          {isDamaged ? 'Damaged' : 'Good'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {consumptionId && availableLines.length === 0 && (
            <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <RotateCcw className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Nothing left to return — every line of this consumption is fully returned.</p>
            </div>
          )}
          {!consumptionId && (
            <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <Boxes className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Select a posted consumption to load its returnable lines</p>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 px-5 py-3 border-t bg-background rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button size="sm" className="text-[11px] h-8" onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail dialog (read-only) ───────────────────────────────────────────────
function ConsumptionReturnDetailDialog({ ret, onClose }: { ret: ConsumptionReturn; onClose: () => void }) {
  const { data: progress } = useReturnProgress(ret.id)
  const lines = ret.return_lines ?? []
  const variantMeta = useVariantItemMeta(lines.map((l) => l.brand_variant_id).filter((v): v is string => !!v))
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const cfg = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending!
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-50 text-orange-600"><RotateCcw className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold font-mono tracking-tight">{ret.return_number}</h2>
              <p className="text-sm text-muted-foreground">Consumption Return{ret.ce_number ? ` · ${ret.ce_number}` : ''}</p>
            </div>
          </div>
          <Badge className={cn('border text-xs', cfg.bg, cfg.color)}>{cfg.label}</Badge>
        </div>
        <Separator />
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Meta icon={<Calendar className="h-4 w-4 text-muted-foreground" />} label="Date" value={formatDate(ret.date)} />
            <Meta icon={<User className="h-4 w-4 text-muted-foreground" />} label="Created By" value={ret.created_by_name ?? '—'} />
            <Meta icon={<Hash className="h-4 w-4 text-muted-foreground" />} label="Items" value={`${totalQty} unit${totalQty !== 1 ? 's' : ''} · ${lines.length} line${lines.length !== 1 ? 's' : ''}`} />
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50/50 px-4 py-3">
            <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-sm font-medium">{ret.reason}</p>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-center font-medium">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <ItemLabel
                        meta={l.brand_variant_id ? variantMeta.get(l.brand_variant_id) : undefined}
                        name={l.item_name}
                        nameClassName="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{l.sku ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="outline" className={cn('text-xs',
                        l.condition === 'damaged' ? 'border-red-200 bg-red-50 text-red-700'
                        : l.condition === 'inspection' ? 'border-purple-200 bg-purple-50 text-purple-700'
                        : 'border-green-200 bg-green-50 text-green-700')}>{l.condition}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {progress && progress.total_damaged > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm tabular-nums flex justify-between">
              <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Damaged dispositioned</span>
              <span className="text-xs">{progress.total_damaged - progress.inventory_remaining} / {progress.total_damaged}{progress.inventory_remaining > 0 ? ` · ${progress.inventory_remaining} pending` : ''}</span>
            </div>
          )}
          {ret.notes && (
            <div className="rounded-lg border border-primary/20 bg-muted/20 px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-sm">{ret.notes}</p>
            </div>
          )}
        </div>
        <Separator />
        <div className="px-6 py-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

// ─── Disposition dialog (damaged lines) ──────────────────────────────────────
function DispositionDialog({ ret, onClose }: { ret: ConsumptionReturn; onClose: () => void }) {
  const damagedLines = useMemo(() => (ret.return_lines ?? []).filter((l) => l.condition === 'damaged' && l.qty > 0), [ret])
  const { data: warehouses = [] } = useWarehouses()
  const realWarehouses = useMemo(() => warehouses.filter((w) => !w.is_virtual), [warehouses])
  const [warehouseId, setWarehouseId] = useState(ret.restock_warehouse_id ?? '')
  const [rows, setRows] = useState<Record<string, { type: 'write_off' | 'restock_as_damaged'; qty: number }>>(
    () => Object.fromEntries(damagedLines.map((l) => [l.id, { type: 'write_off' as const, qty: l.qty }])),
  )
  const record = useRecordConsumptionReturnDisposition()

  function handleSubmit() {
    if (!warehouseId) { toast.error('Pick a warehouse'); return }
    const dispositions = damagedLines
      .map((l) => ({ l, r: rows[l.id] }))
      .filter(({ r }) => r && r.qty > 0)
      .map(({ l, r }) => ({ return_line_id: l.id, type: r!.type, qty: r!.qty }))
    if (dispositions.length === 0) { toast.error('Enter a qty for at least one line'); return }
    record.mutate({ returnId: ret.id, warehouseId, dispositions }, {
      onSuccess: () => { toast.success('Dispositions recorded & cost reversed'); onClose() },
      onError: (e) => toast.error(humanizeDbError(e)),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle className="text-sm">Disposition damaged stock — {ret.return_number}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger className="h-9 text-xs w-full"><SelectValue placeholder="Warehouse for the damaged stock…" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {realWarehouses.map((w) => (<SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {damagedLines.map((l) => {
            const r = rows[l.id] ?? { type: 'write_off' as const, qty: l.qty }
            return (
              <div key={l.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-semibold truncate">{l.item_name}</p>
                  {l.sku && <span className="text-[10px] text-muted-foreground">· {l.sku}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">damaged: {l.qty}</span>
                </div>
                <div className="grid grid-cols-[1fr_5rem] gap-2 items-center">
                  <Select value={r.type} onValueChange={(v) => setRows((p) => ({ ...p, [l.id]: { ...r, type: v as 'write_off' | 'restock_as_damaged' } }))}>
                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="write_off" className="text-xs">Write off (scrap)</SelectItem>
                      <SelectItem value="restock_as_damaged" className="text-xs">Restock as damaged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min="0" max={l.qty} value={r.qty}
                    onChange={(e) => { const q = Math.min(l.qty, Math.max(0, Number(e.target.value) || 0)); setRows((p) => ({ ...p, [l.id]: { ...r, qty: q } })) }}
                    className="h-8 text-right tabular-nums text-xs" />
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-muted-foreground">Both paths reverse the consumption cost for the disposed qty. Restock-as-damaged sends the units to the Damaged Stock page for scrap or repair.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={record.isPending}>{record.isPending ? 'Recording…' : 'Record dispositions'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Complete inspection dialog (split an inspection line into good / damaged) ─
// Only reached for a return that arrived as pending_inspection — today that means
// a covered consumption warranty claim resolved into a consumption return
// (rpc_start_warranty_claim_resolution, Phase 4). Splitting moves it to
// 'received' so the existing Restock / Disposition actions apply.
function CompleteInspectionDialog({ ret, onClose }: { ret: ConsumptionReturn; onClose: () => void }) {
  const inspectionLines = useMemo(
    () => (ret.return_lines ?? []).filter((l) => l.condition === 'inspection' && l.qty > 0),
    [ret],
  )
  const { data: warehouses = [] } = useWarehouses()
  const realWarehouses = useMemo(() => warehouses.filter((w) => !w.is_virtual), [warehouses])
  const [warehouseId, setWarehouseId] = useState(ret.restock_warehouse_id ?? '')
  const [rows, setRows] = useState<Record<string, { good: number; damaged: number; notes: string }>>(
    () => Object.fromEntries(inspectionLines.map((l) => [l.id, { good: 0, damaged: 0, notes: '' }])),
  )
  const complete = useCompleteConsumptionReturnInspection()

  const anyGood = useMemo(() => Object.values(rows).some((r) => r.good > 0), [rows])
  const anyMismatch = useMemo(
    () => inspectionLines.some((l) => (rows[l.id]?.good ?? 0) + (rows[l.id]?.damaged ?? 0) !== l.qty),
    [inspectionLines, rows],
  )
  const canSubmit = inspectionLines.length > 0 && !anyMismatch && (!anyGood || !!warehouseId) && !complete.isPending

  function handleSubmit() {
    if (anyMismatch) { toast.error('Each line’s good + damaged must equal its inspected qty'); return }
    if (anyGood && !warehouseId) { toast.error('Pick the warehouse the good stock returns to'); return }
    const splits = inspectionLines.map((l) => ({
      return_line_id: l.id,
      good_qty: rows[l.id]?.good ?? 0,
      damaged_qty: rows[l.id]?.damaged ?? 0,
      condition_notes: (rows[l.id]?.notes ?? '').trim() || null,
    }))
    complete.mutate(
      { returnId: ret.id, splits, restockWarehouseId: anyGood ? warehouseId : null },
      {
        onSuccess: () => { toast.success(`${ret.return_number} inspection complete — ready to restock`); onClose() },
        onError: (e) => toast.error(humanizeDbError(e)),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle className="text-sm">Complete inspection — {ret.return_number}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <p className="text-[11px] text-muted-foreground">
            Enter the good / damaged split for each inspected item — the two must add up to the inspected qty.
            Good stock goes back to the chosen warehouse (cost reversed); damaged stock is written off or restocked
            as damaged afterwards on the Disposition step.
          </p>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Restock warehouse for good stock {anyGood ? '*' : ''}</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger className="h-9 text-xs w-full"><SelectValue placeholder="Warehouse the good stock returns to…" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {realWarehouses.map((w) => (<SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {inspectionLines.map((l) => {
            const r = rows[l.id] ?? { good: 0, damaged: 0, notes: '' }
            const mismatch = r.good + r.damaged !== l.qty
            return (
              <div key={l.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-semibold truncate">{l.item_name}</p>
                  {l.sku && <span className="text-[10px] text-muted-foreground">· {l.sku}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">inspected: {l.qty}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Good</Label>
                    <Input type="number" min="0" max={l.qty} value={r.good}
                      onChange={(e) => { const q = Math.min(l.qty, Math.max(0, Number(e.target.value) || 0)); setRows((p) => ({ ...p, [l.id]: { ...r, good: q } })) }}
                      className="h-8 text-right tabular-nums text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Damaged</Label>
                    <Input type="number" min="0" max={l.qty} value={r.damaged}
                      onChange={(e) => { const q = Math.min(l.qty, Math.max(0, Number(e.target.value) || 0)); setRows((p) => ({ ...p, [l.id]: { ...r, damaged: q } })) }}
                      className="h-8 text-right tabular-nums text-xs" />
                  </div>
                </div>
                {r.damaged > 0 && (
                  <Input type="text" placeholder="Damage notes (e.g. dented, missing part)"
                    value={r.notes}
                    onChange={(e) => setRows((p) => ({ ...p, [l.id]: { ...r, notes: e.target.value } }))}
                    className="h-8 text-xs" />
                )}
                {mismatch && (
                  <p className="text-[10px] text-destructive">Good + Damaged must equal {l.qty} (inspected qty).</p>
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={complete.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>{complete.isPending ? 'Saving…' : 'Complete inspection'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
