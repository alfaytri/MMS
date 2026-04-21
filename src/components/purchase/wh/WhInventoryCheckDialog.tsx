'use client'

import { useState, useMemo } from 'react'
import { ClipboardCheck, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Warehouse } from '@/hooks/useWarehouses'
import { useWarehouseStock, useCreateInventoryCheck } from '@/hooks/useWarehouseOperations'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

interface CheckItemsTableProps {
  warehouseId: string
  search: string
  counts: Record<string, string>
  onCountChange: (variantId: string, value: string) => void
}

function CheckItemsTable({ warehouseId, search, counts, onCountChange }: CheckItemsTableProps) {
  const { data: stock = [] } = useWarehouseStock(warehouseId)

  const filtered = useMemo(() => {
    if (!search) return stock
    const q = search.toLowerCase()
    return stock.filter(s =>
      s.item_name?.toLowerCase().includes(q) ||
      s.brand?.toLowerCase().includes(q) ||
      s.sku?.toLowerCase().includes(q)
    )
  }, [stock, search])

  if (stock.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No stock in this warehouse
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Item</TableHead>
            <TableHead className="text-xs">Brand</TableHead>
            <TableHead className="text-xs">SKU</TableHead>
            <TableHead className="text-xs text-right">System Qty</TableHead>
            <TableHead className="text-xs text-right">Counted</TableHead>
            <TableHead className="text-xs text-right">Variance</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                No items match search
              </TableCell>
            </TableRow>
          ) : (
            filtered.map(s => {
              const countedStr = counts[s.brand_variant_id]
              const isCounted = countedStr !== undefined && countedStr !== ''
              const counted = isCounted ? parseFloat(countedStr) : null
              const systemQty = s.stock_level ?? 0
              const variance = counted !== null ? counted - systemQty : null
              const rowBg = !isCounted ? 'bg-muted/30' : variance === 0 ? 'bg-success/5' : 'bg-warning/5'
              return (
                <TableRow key={s.brand_variant_id} className={rowBg}>
                  <TableCell className="text-xs">{s.item_name}</TableCell>
                  <TableCell className="text-xs">{s.brand ?? '—'}</TableCell>
                  <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right">{systemQty}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="w-20 h-7 text-xs text-right"
                      min="0"
                      step="0.01"
                      value={counts[s.brand_variant_id] ?? ''}
                      onChange={e => onCountChange(s.brand_variant_id, e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {variance !== null ? (
                      <span className={variance > 0 ? 'text-success' : variance < 0 ? 'text-destructive' : ''}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {!isCounted ? (
                      <Badge variant="outline" className="text-[10px]">Not counted</Badge>
                    ) : variance === 0 ? (
                      <Badge className="text-[10px] bg-success/10 text-success">Match</Badge>
                    ) : (
                      <Badge className="text-[10px] bg-warning/10 text-warning">Variance</Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

interface Props {
  warehouses: Warehouse[]
  children: React.ReactNode
}

export function WhInventoryCheckDialog({ warehouses, children }: Props) {
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createCheck = useCreateInventoryCheck()
  const qc = useQueryClient()

  function handleClose() {
    setOpen(false)
    setWarehouseId(''); setSearch(''); setCounts({}); setNotes('')
  }

  function handleCountChange(variantId: string, value: string) {
    setCounts(prev => ({ ...prev, [variantId]: value }))
  }

  async function handleSubmit() {
    if (!warehouseId) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const wh = warehouses.find(w => w.id === warehouseId)

      // Step 1: Create the check record
      const check = await createCheck.mutateAsync({
        warehouseId,
        warehouseName: wh?.name ?? '',
        notes: notes || null,
      })

      // Step 2: Build item rows from counts
      const itemRows = Object.entries(counts)
        .filter(([, v]) => v !== '')
        .map(([variantId, countedStr]) => ({
          check_id: check.id,
          brand_variant_id: variantId,
          counted_qty: parseFloat(countedStr),
          is_counted: true,
        }))

      if (itemRows.length > 0) {
        const { error } = await (supabase as any)
          .from('inventory_check_items')
          .insert(itemRows)
        if (error) throw error
      }

      // Step 3: Submit the check
      await (supabase as any)
        .from('inventory_checks')
        .update({ status: 'submitted' })
        .eq('id', check.id)

      qc.invalidateQueries({ queryKey: ['inventory_checks'] })
      toast.success(`Inventory check submitted for approval`)
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Inventory Check
            </DialogTitle>
          </DialogHeader>

          {/* Top controls */}
          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <Select value={warehouseId} onValueChange={v => { setWarehouseId(v ?? ''); setCounts({}) }}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select warehouse…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {warehouseId && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-8"
                  placeholder="Search items…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
            {Object.values(counts).filter(v => v !== '').length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {Object.values(counts).filter(v => v !== '').length} counted
              </Badge>
            )}
          </div>

          {/* Items table */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {warehouseId && (
              <CheckItemsTable
                warehouseId={warehouseId}
                search={search}
                counts={counts}
                onCountChange={handleCountChange}
              />
            )}
            {!warehouseId && (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                Select a warehouse to begin counting
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5 flex-shrink-0">
            <Label className="text-xs">Notes</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              placeholder="Optional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!warehouseId || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
