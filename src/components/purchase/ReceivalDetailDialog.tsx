'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Package, Calendar, Warehouse, User, Hash, Loader2, Download, Gift,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import type { Receival } from '@/hooks/useReceivals'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  approved:         { label: 'Approved',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  rejected:         { label: 'Rejected',         color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  pending_approval: { label: 'Pending Approval', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
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
  receival: Receival | null
  onClose: () => void
}

export function ReceivalDetailDialog({ receival, onClose }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)

  if (!receival) return null

  const items = receival.receival_items ?? []
  // receival_items.unit_cost is stored in the PO's currency (QAR for inventory
  // receivals) — see migration 20260729214710. Label it truthfully rather than
  // assuming QAR.
  const currency = receival.currency ?? 'QAR'
  const purchasedItems = items.filter(i => i.is_free !== true)
  const freeItems = items.filter(i => i.is_free === true)
  const subtotal = purchasedItems.reduce((sum, i) => sum + i.qty_received * i.unit_cost, 0)
  const freeQty = freeItems.reduce((sum, i) => sum + i.qty_received, 0)
  const totalQty = items.reduce((sum, i) => sum + i.qty_received, 0)

  const statusCfg = STATUS_CONFIG[receival.status ?? ''] ?? { label: receival.status ?? 'Unknown', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/purchase/receivals/${receival!.id}/receipt-pdf`, {
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
    <Dialog open={!!receival} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-green-50 text-green-600">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold font-mono tracking-tight">{receival.receival_number}</h2>
                  {receival.is_replacement && (
                    <Badge className="text-xs bg-purple-100 text-purple-700">Replacement</Badge>
                  )}
                  {receival.source_type === 'inventory' && (
                    <Badge className="text-xs bg-purple-100 text-purple-700">Inventory Receival</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {receival.source_type === 'inventory'
                    ? receival.carved_from_layer_id
                      ? 'Carved from existing stock'
                      : 'New stock addition (no PO)'
                    : (
                      <>
                        {receival.po_number ?? '—'}
                        {receival.supplier_name ? ` · ${receival.supplier_name}` : ''}
                      </>
                    )}
                </p>
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
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            <MetaCard
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Date"
              value={receival.date ? formatDate(receival.date) : '—'}
            />
            <MetaCard
              icon={<Warehouse className="h-4 w-4 text-muted-foreground" />}
              label="Warehouse"
              value={receival.warehouse_name ?? '—'}
            />
            <MetaCard
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              label="Created By"
              value={receival.received_by_name ?? '—'}
            />
            <MetaCard
              icon={<Hash className="h-4 w-4 text-muted-foreground" />}
              label="Items"
              value={`${totalQty} unit${totalQty !== 1 ? 's' : ''} · ${items.length} line${items.length !== 1 ? 's' : ''}`}
            />
            {receival.created_at && (
              <MetaCard
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                label="Created At"
                value={new Date(receival.created_at).toLocaleString()}
              />
            )}
            {receival.source_type === 'inventory' && (
              <MetaCard
                icon={<Package className="h-4 w-4 text-muted-foreground" />}
                label={receival.carved_from_layer_id ? 'Carved From' : 'Type'}
                value={receival.carved_from_layer_id ? 'Existing stock layer' : 'New stock (no source)'}
              />
            )}
          </div>

          {/* Items table */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Received Items</h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-center font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, i) => (
                      <tr key={item.id} className={cn('hover:bg-muted/20', STAGGER_IN)} style={staggerDelay(i)}>
                        <td className="px-3 py-2.5 font-medium">{item.item_name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{item.sku ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{item.qty_received}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {item.is_free === true ? '—' : formatCurrency(item.unit_cost, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                          {item.is_free === true ? '—' : formatCurrency(item.qty_received * item.unit_cost, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.is_free === true
                            ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200"><Gift className="h-3 w-3" />Free</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Purchased</span>}
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Cost summary */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Purchased ({purchasedItems.length} items)</span>
                <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
              </div>
              {freeItems.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Free ({freeItems.length} items, {freeQty} units)</span>
                  <span className="tabular-nums text-muted-foreground">—</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>Grand Total</span>
                <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {receival.notes && (
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm">{receival.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-6 py-3 flex items-center justify-end">
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
