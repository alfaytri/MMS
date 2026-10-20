'use client'

import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronsUpDown } from 'lucide-react'
import { humanizeDbError } from '@/lib/dbErrors'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WhItemPicker, type PickerItem } from '@/components/purchase/wh/WhItemPicker'
import { useAllBrandVariantsGrouped } from '@/hooks/useInventory'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useCreateForecast, useUpdateForecast, type PurchaseForecast, type Engagement } from '@/hooks/usePurchaseForecasts'

const ENGAGEMENT_OPTIONS: [Engagement, string][] = [
  ['not_started', 'Not started'], ['in_discussion', 'In discussion'], ['quotation_received', 'Quotation received'],
  ['negotiating', 'Negotiating'], ['ready_to_order', 'Ready to order'], ['on_hold', 'On hold'],
]

export function ForecastDialog({ open, onOpenChange, forecast }: { open: boolean; onOpenChange: (o: boolean) => void; forecast?: PurchaseForecast | null }) {
  const isEdit = !!forecast
  const { activeDivisionId, availableDivisions } = useActiveDivision()
  const { data: variants = [] } = useAllBrandVariantsGrouped(open)
  const { data: suppliers = [] } = useSuppliers()
  const { data: currencies = [] } = useCurrencies()
  const create = useCreateForecast()
  const update = useUpdateForecast()

  const [divisionId, setDivisionId] = useState('')
  const [variantId, setVariantId] = useState<string | null>(null)
  const [itemName, setItemName] = useState<string | null>(null)
  const [sku, setSku] = useState<string | null>(null)
  const [qty, setQty] = useState('1')
  const [supplierId, setSupplierId] = useState<string>('')
  const [currency, setCurrency] = useState('QAR')
  const [estValue, setEstValue] = useState('')
  const [plannedOrderDate, setPlannedOrderDate] = useState('')
  const [neededByDate, setNeededByDate] = useState('')
  const [engagement, setEngagement] = useState<Engagement>('not_started')
  const [notes, setNotes] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  // (Re)seed the form whenever the dialog opens or the edited row changes.
  useEffect(() => {
    if (!open) return
    setDivisionId(forecast?.division_id ?? activeDivisionId ?? '')
    setVariantId(forecast?.brand_variant_id ?? null)
    setItemName(forecast?.item_name ?? null)
    setSku(forecast?.sku ?? null)
    setQty(forecast ? String(forecast.qty) : '1')
    setSupplierId(forecast?.supplier_id ?? '')
    setCurrency(forecast?.currency ?? 'QAR')
    setEstValue(forecast?.est_value != null ? String(forecast.est_value) : '')
    setPlannedOrderDate(forecast?.planned_order_date ?? '')
    setNeededByDate(forecast?.needed_by_date ?? '')
    setEngagement(forecast?.engagement ?? 'not_started')
    setNotes(forecast?.notes ?? '')
  }, [open, forecast, activeDivisionId])

  const pickerItems: PickerItem[] = useMemo(() => variants.map((v) => ({
    id: v.variantId, name: v.itemName, brand: v.brand, sku: v.itemSku || null,
    category: v.catName, categoryId: v.catId, type: v.catType, countryName: v.countryName, imageUrl: v.imageUrl,
  })), [variants])
  const selectedName = variantId ? (itemName ?? pickerItems.find((p) => p.id === variantId)?.name ?? '—') : null

  function pickItem(id: string) {
    const v = variants.find((x) => x.variantId === id)
    setVariantId(id)
    setItemName(v?.itemName ?? null)
    setSku(v?.itemSku || null)
    setPickerOpen(false)
  }

  function submit() {
    const qtyNum = Number(qty)
    if (!divisionId) { toast.error('Pick a division'); return }
    if (!variantId) { toast.error('Pick an item'); return }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { toast.error('Quantity must be greater than 0'); return }
    const supplier = suppliers.find((s) => s.id === supplierId)
    const input = {
      division_id: divisionId,
      brand_variant_id: variantId,
      item_name: itemName,
      sku,
      qty: qtyNum,
      supplier_id: supplierId || null,
      supplier_name: supplier?.name ?? null,
      currency: currency || 'QAR',
      est_value: estValue.trim() === '' ? null : Number(estValue),
      planned_order_date: plannedOrderDate || null,
      needed_by_date: neededByDate || null,
      engagement,
      notes: notes.trim() || null,
    }
    const onDone = { onSuccess: () => { toast.success(isEdit ? 'Forecast updated' : 'Forecast added'); onOpenChange(false) }, onError: (e: unknown) => toast.error(humanizeDbError(e)) }
    if (isEdit) update.mutate({ id: forecast!.id, ...input }, onDone)
    else create.mutate(input, onDone)
  }

  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? `Edit forecast ${forecast?.forecast_number}` : 'New forecast'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Division *</Label>
              <Select value={divisionId} onValueChange={(v) => setDivisionId(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select division" /></SelectTrigger>
                <SelectContent>{availableDivisions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantity *</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Item *</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm">
                <span className={selectedName ? '' : 'text-muted-foreground'}>
                  {selectedName ? <>{selectedName}{sku && <span className="text-muted-foreground font-mono ml-1.5">· {sku}</span>}</> : 'Select item…'}
                </span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
              </PopoverTrigger>
              <PopoverContent className="p-0 w-auto" align="start" side="bottom" collisionAvoidance={{ side: 'none' }}>
                <WhItemPicker items={pickerItems} currentValue={variantId ?? ''} onSelect={pickItem} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Planned supplier</Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Engagement</Label>
              <Select value={engagement} onValueChange={(v) => setEngagement((v ?? 'not_started') as Engagement)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{ENGAGEMENT_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? 'QAR')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c.id} value={c.code}>{c.code}{c.symbol ? ` · ${c.symbol}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Estimated value</Label><Input type="number" min={0} value={estValue} onChange={(e) => setEstValue(e.target.value)} placeholder="Optional" className="h-9" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Planned order date</Label><Input type="date" value={plannedOrderDate} onChange={(e) => setPlannedOrderDate(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Needed by</Label><Input type="date" value={neededByDate} onChange={(e) => setNeededByDate(e.target.value)} className="h-9" /></div>
          </div>

          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save' : 'Add forecast'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
