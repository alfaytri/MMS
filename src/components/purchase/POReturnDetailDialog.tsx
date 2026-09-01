'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  RotateCcw, Calendar, User, Hash, Loader2, Download, FileText,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { useCreateDebitNoteForReturn, type POReturn } from '@/hooks/usePurchaseReturns'
import { humanizeDbError } from '@/lib/dbErrors'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useReturnLineSources } from '@/hooks/useReturnLineSources'
import { ReturnLineSourceBadges } from '@/components/shared/ReturnLineSourceBadges'
import { useVariantCategoryPaths } from '@/hooks/useVariantCategoryPaths'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:            { label: 'Pending',            color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  dispatched:         { label: 'Dispatched',         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  supplier_confirmed: { label: 'Supplier Confirmed', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  closed:             { label: 'Closed',             color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  cancelled:          { label: 'Cancelled',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
}

const CONDITION_CONFIG: Record<string, { label: string; className: string }> = {
  defective: { label: 'Defective', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  damaged:   { label: 'Damaged',   className: 'border-red-200 bg-red-50 text-red-700' },
  other:     { label: 'Other',     className: 'border-slate-200 bg-slate-50 text-slate-700' },
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

interface Props {
  ret: POReturn | null
  onClose: () => void
}

export function POReturnDetailDialog({ ret, onClose }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const createDebitNote = useCreateDebitNoteForReturn()
  const { data: warehouses = [] } = useWarehouses()
  const bvIds = useMemo(() => (ret?.return_lines ?? []).map((i) => i.brand_variant_id).filter(Boolean) as string[], [ret?.return_lines])
  const { data: whStockMap } = useWarehouseStockByItems(bvIds)
  const variantTrees = useVariantCategoryPaths(bvIds)

  // Per-line provenance — each return line points at the receival_items row
  // it came from (D.4.a). Batch-resolve the ref# + warehouse + sub-container
  // labels so the items table can show a source badge trio per row.
  const receivalIds = useMemo(
    () => (ret?.return_lines ?? []).map((l) => l.receival_item_id).filter((x): x is string => !!x),
    [ret?.return_lines],
  )
  const { data: sources } = useReturnLineSources(receivalIds, [], ret?.id ?? null)

  if (!ret) return null

  const items = ret.return_lines ?? []
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0)
  const statusCfg = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.pending

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/returns/${ret!.id}/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json = await res.json() as { url: string }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Dialog open={!!ret} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-purple-50 text-purple-600">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold font-mono tracking-tight">{ret.return_number}</h2>
                <p className="text-sm text-muted-foreground">Purchase Return</p>
              </div>
            </div>
            <Badge className={cn('border text-xs', statusCfg.bg, statusCfg.color)}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Meta grid — per-line source now lives in the items table below
              via ReturnLineSourceBadges (each line points at its receival). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetaCard
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Date"
              value={ret.date ? formatDate(ret.date) : '—'}
            />
            <MetaCard
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              label="Created By"
              value={ret.created_by_name ?? '—'}
            />
            <MetaCard
              icon={<Hash className="h-4 w-4 text-muted-foreground" />}
              label="Items"
              value={`${totalQty} unit${totalQty !== 1 ? 's' : ''} · ${items.length} line${items.length !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Reason */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 px-4 py-3">
            <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-sm font-medium">{ret.reason}</p>
          </div>

          {/* Items table */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Return Items</h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-center font-medium">Condition</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-left font-medium">Stock by Warehouse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const cond = CONDITION_CONFIG[item.condition] ?? CONDITION_CONFIG.other
                      const sourceInfo = item.receival_item_id ? sources?.receival.get(item.receival_item_id) ?? null : null
                      return (
                        <tr key={idx} className={cn('hover:bg-muted/20', STAGGER_IN)} style={staggerDelay(idx)}>
                          <td className="px-3 py-2.5 font-medium">
                            {(() => {
                              const path = item.brand_variant_id ? (variantTrees.get(item.brand_variant_id) ?? '') : ''
                              return path ? (
                                <p className="text-[10px] text-muted-foreground leading-tight mb-0.5 break-words">{path}</p>
                              ) : null
                            })()}
                            {item.item_name}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{item.sku ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{item.qty}</td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge variant="outline" className={cn('text-xs', cond.className)}>
                              {cond.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <ReturnLineSourceBadges info={sourceInfo} />
                          </td>
                          <td className="px-3 py-2.5">
                            {item.brand_variant_id && (() => {
                              const whEntries = whStockMap.get(item.brand_variant_id!) ?? []
                              return whEntries.length > 0 ? (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                  {whEntries.map((w) => {
                                    const whName = warehouses.find((wh) => wh.id === w.warehouse_id)?.name ?? '?'
                                    return (
                                      <span key={w.warehouse_id} className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        {whName}: <span className="font-medium text-foreground">{w.qty}</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : <span className="text-[10px] text-amber-600">No stock</span>
                            })()}
                          </td>
                        </tr>
                      )
                    })}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Returned</span>
                <span className="tabular-nums">{totalQty} unit{totalQty !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {ret.notes && (
            <div className="rounded-lg border border-primary/20 bg-muted/20 px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-sm">{ret.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          {/* Debit note — create once the supplier has confirmed the return
              (parity with the PO Returns tab). Download lives on the Debit
              Notes page. */}
          <div className="flex items-center gap-2">
            {ret.debit_note ? (
              <span className="text-xs text-muted-foreground">
                Debit Note:{' '}
                <span className="font-mono font-medium text-foreground">{ret.debit_note.debit_note_id}</span>
              </span>
            ) : (ret.status === 'supplier_confirmed' || ret.status === 'closed') ? (
              <Button
                variant="outline"
                size="sm"
                disabled={createDebitNote.isPending}
                onClick={() => createDebitNote.mutate(ret!, {
                  onSuccess: () => { toast.success('Debit note created'); onClose() },
                  onError: (e: Error) => toast.error(humanizeDbError(e)),
                })}
              >
                {createDebitNote.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                {createDebitNote.isPending ? 'Creating…' : 'Create Debit Note'}
              </Button>
            ) : (
              <span />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={pdfBusy}>
            {pdfBusy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Download className="h-3.5 w-3.5 mr-1.5" />}
            {pdfBusy ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
