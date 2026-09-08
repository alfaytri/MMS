'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { humanizeDbError } from '@/lib/dbErrors'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import {
  useCreateShipment, useShippablePurchaseOrders, useLineShippedElsewhere,
  type ShipmentMode,
} from '@/hooks/useShipments'
import { remainingUnshipped, exceedsRemaining } from '@/lib/shipments/reconciliation'

type PickedLine = { po_line_item_id: string; item_name: string; sku: string | null; po_qty: number; qty: number }
type PickedPo = { po_id: string; po_number: string; supplier_name: string | null; lines: PickedLine[] }

const MODES: { value: ShipmentMode; label: string }[] = [
  { value: 'air', label: '✈️ Air' }, { value: 'sea', label: '🚢 Sea' },
  { value: 'land', label: '🚛 Land' }, { value: 'manual', label: '✏️ Manual' },
]

export function CreateShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<ShipmentMode>('sea')
  const [tracking, setTracking] = useState('')
  const [etd, setEtd] = useState('')
  const [etdReason, setEtdReason] = useState('')
  const [pos, setPos] = useState<PickedPo[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const create = useCreateShipment()
  const { data: shippable = [], isLoading: posLoading } = useShippablePurchaseOrders(search)
  const chosenIds = useMemo(() => new Set(pos.map((p) => p.po_id)), [pos])
  const options = useMemo(() => shippable.filter((p) => !chosenIds.has(p.id)), [shippable, chosenIds])

  const allLineIds = useMemo(() => pos.flatMap((p) => p.lines.map((l) => l.po_line_item_id)), [pos])
  const { data: shippedElsewhere } = useLineShippedElsewhere(allLineIds)

  async function addPo(po: { id: string; po_number: string; supplier_name: string | null }) {
    setPickerOpen(false); setSearch('')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('po_line_items').select('id, item_name, sku, qty').eq('po_id', po.id).order('created_at', { ascending: true })
    if (error) { toast.error(humanizeDbError(error)); return }
    const lines: PickedLine[] = (data ?? []).map((l) => {
      const shipped = shippedElsewhere?.get(l.id) ?? 0
      return { po_line_item_id: l.id, item_name: l.item_name, sku: l.sku, po_qty: l.qty, qty: remainingUnshipped(l.qty, shipped) }
    })
    setPos((prev) => [...prev, { po_id: po.id, po_number: po.po_number, supplier_name: po.supplier_name, lines }])
  }

  function setLineQty(poId: string, lineId: string, qty: number) {
    setPos((prev) => prev.map((p) => p.po_id !== poId ? p : { ...p, lines: p.lines.map((l) => l.po_line_item_id === lineId ? { ...l, qty } : l) }))
  }
  function setWholePo(poId: string, whole: boolean) {
    setPos((prev) => prev.map((p) => p.po_id !== poId ? p : {
      ...p, lines: p.lines.map((l) => ({ ...l, qty: whole ? remainingUnshipped(l.po_qty, shippedElsewhere?.get(l.po_line_item_id) ?? 0) : 0 })),
    }))
  }
  function removePo(poId: string) { setPos((prev) => prev.filter((p) => p.po_id !== poId)) }

  const submitLines = useMemo(
    () => pos.flatMap((p) => p.lines.filter((l) => l.qty > 0).map((l) => ({ po_line_item_id: l.po_line_item_id, qty: l.qty }))),
    [pos],
  )
  const wholeCount = pos.filter((p) => p.lines.length > 0 && p.lines.every((l) => l.qty === l.po_qty)).length
  const partialCount = pos.length - wholeCount
  const totalUnits = submitLines.reduce((s, l) => s + l.qty, 0)

  function reset() { setMode('sea'); setTracking(''); setEtd(''); setEtdReason(''); setPos([]); setSearch('') }

  function submit() {
    if (submitLines.length === 0) { toast.error('Add at least one PO line'); return }
    create.mutate(
      { mode, tracking_number: tracking.trim() || null, carrier: null, lines: submitLines, etd_original: etd || null, etd_reason: etdReason.trim() || null },
      {
        onSuccess: (ship) => {
          toast.success(`Shipment ${ship.shipment_number} created`)
          if (ship.tracking_number) {
            fetch('/api/shipments/register-tracking', {
              method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tracking_number: ship.tracking_number, shipment_id: ship.id }),
            }).catch((err) => console.error('[auto-register]', err))
          }
          reset(); onOpenChange(false)
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Create shipment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ShipmentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tracking number <span className="text-muted-foreground font-normal">· optional</span></Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Leave blank if none" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Purchase orders &amp; items</Label>
            {pos.map((p) => (
              <div key={p.po_id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm font-semibold">{p.po_number}</span>
                    <span className="text-xs text-muted-foreground truncate">{p.supplier_name ?? ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setWholePo(p.po_id, true)}>Whole PO</button>
                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setWholePo(p.po_id, false)}>Clear</button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Remove PO" onClick={() => removePo(p.po_id)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                {p.lines.map((l) => {
                  const shipped = shippedElsewhere?.get(l.po_line_item_id) ?? 0
                  const over = exceedsRemaining(l.qty, l.po_qty, shipped)
                  return (
                    <div key={l.po_line_item_id} className={cn('px-3 py-2 border-b last:border-b-0', over && 'bg-amber-50 dark:bg-amber-900/20')}>
                      <div className="grid grid-cols-[1fr_84px] items-center gap-2">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{l.item_name}</div>
                          {l.sku && <div className="text-[11px] text-muted-foreground font-mono">{l.sku}</div>}
                        </div>
                        <div className="text-right">
                          <Input type="number" min={0} value={l.qty}
                            onChange={(e) => setLineQty(p.po_id, l.po_line_item_id, Math.max(0, Number(e.target.value) || 0))}
                            className="h-8 text-right tabular-nums" />
                          <div className="text-[10px] text-muted-foreground">of {l.po_qty}</div>
                        </div>
                      </div>
                      {over && <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">Exceeds the PO&apos;s remaining quantity ({remainingUnshipped(l.po_qty, shipped)}) — saved anyway.</div>}
                    </div>
                  )
                })}
              </div>
            ))}

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-accent"
                render={(props) => <button type="button" {...props} />}
              >
                <Plus className="h-4 w-4" /> Add purchase order
                <ChevronsUpDown className="h-3.5 w-3.5 ml-auto opacity-60" />
              </PopoverTrigger>
              <PopoverContent className="w-[22rem] max-w-[90vw] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search PO # or supplier…" value={search} onValueChange={setSearch} />
                  <CommandGroup className="max-h-64 overflow-y-auto">
                    {posLoading && <div className="px-2 py-3 text-xs text-center text-muted-foreground">Loading…</div>}
                    {!posLoading && options.length === 0 && <CommandEmpty>No open POs match.</CommandEmpty>}
                    {options.map((po) => (
                      <CommandItem key={po.id} value={po.id} onSelect={() => addPo(po)} className="text-xs">
                        <Check className="mr-2 h-3 w-3 opacity-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-medium">{po.po_number}</div>
                          <div className="text-muted-foreground truncate">{po.supplier_name ?? '—'} · {formatDate(po.created_at)}</div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <div className="border-t px-2 py-1 text-[10px] text-center text-muted-foreground">
                    Showing up to 50 open POs — keep typing to narrow
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ETD — original</Label>
              <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Note <span className="text-muted-foreground font-normal">· optional</span></Label>
              <Input value={etdReason} onChange={(e) => setEtdReason(e.target.value)} placeholder="Booked with carrier" />
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-background pt-4 flex-row items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {wholeCount} whole PO{wholeCount !== 1 ? 's' : ''} · {partialCount} partial · {totalUnits.toLocaleString()} units
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create shipment'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
