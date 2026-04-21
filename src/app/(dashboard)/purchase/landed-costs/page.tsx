'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost,
  type LandedCost, type LandedCostLine,
} from '@/hooks/useLandedCosts'
import type { ColumnDef } from '@tanstack/react-table'

// ─── Local receival hook ───────────────────────────────────────────────────────

type ReceivalSummary = {
  id: string
  receival_number: string
  po_id: string
  date: string
  status: string
  purchase_orders: { po_number: string; supplier_name: string } | null
}

function useReceivals() {
  return useQuery({
    queryKey: ['receivals_list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('id, receival_number, po_id, date, status, purchase_orders(po_number, supplier_name)')
        .order('date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ReceivalSummary[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── LC Detail Dialog ─────────────────────────────────────────────────────────

function LcDetailDialog({
  lc,
  onClose,
}: {
  lc: LandedCost | null
  onClose: () => void
}) {
  const voidLc = useVoidLandedCost()
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  if (!lc) return null

  const isVoided = !!lc.voided_at

  return (
    <>
      <Dialog open={!!lc} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              <Badge variant={isVoided ? 'destructive' : 'outline'}>{isVoided ? 'Voided' : 'Active'}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{formatDate(lc.date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Amount</p>
                <p className="font-semibold">{formatCurrency(lc.total_amount, lc.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-medium">{lc.description ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Receivals Attached</p>
                <p className="font-medium">{lc.attached_receival_ids?.length ?? 0}</p>
              </div>
            </div>

            <Separator />

            {/* Cost Lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Cost Lines</h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lc.lines ?? []).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(line.amount, line.currency)}</TableCell>
                        <TableCell className="text-sm">{line.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Item Allocations */}
            {(lc.item_allocations ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Item Allocations</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Original Cost</TableHead>
                        <TableHead className="text-right">Allocated Cost</TableHead>
                        <TableHead className="text-right">Updated Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lc.item_allocations ?? []).map((alloc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{alloc.item_name}</TableCell>
                          <TableCell className="text-sm font-mono">{alloc.sku ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{alloc.qty_received}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.original_unit_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.allocated_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(alloc.updated_unit_cost, lc.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {!isVoided && (
            <DialogFooter>
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Void Landed Cost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will void {lc.lc_number}. Please provide a reason.</p>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason || voidLc.isPending}
              onClick={() => voidLc.mutate(
                { id: lc.id, reason: voidReason },
                {
                  onSuccess: () => { toast.success('LC voided'); setVoidOpen(false); onClose() },
                  onError: (err) => toast.error(err.message),
                }
              )}
            >
              {voidLc.isPending ? 'Voiding…' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Create LC Dialog ─────────────────────────────────────────────────────────

function CreateLcDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createLc = useCreateLandedCost()
  const { data: receivals } = useReceivals()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR' }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])

  function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR' }]) }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, k: keyof LandedCostLine, v: string | number) {
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [k]: v } : line))
  }
  function toggleReceival(id: string) {
    setSelectedReceivalIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  const total = lines.reduce((s, l) => s + Number(l.amount), 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { toast.error('Date is required'); return }
    if (lines.some((l) => !l.description)) { toast.error('All cost lines need a description'); return }
    createLc.mutate(
      {
        description: description || null,
        date,
        currency,
        lines,
        attached_receival_ids: selectedReceivalIds,
        attached_po_ids: [],
      },
      {
        onSuccess: () => {
          toast.success('Landed cost created')
          onOpenChange(false)
          setDescription(''); setDate(''); setCurrency('QAR')
          setLines([{ description: '', amount: 0, currency: 'QAR' }])
          setSelectedReceivalIds([])
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Landed Cost</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freight, customs fees…" />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Cost Lines */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cost Lines</p>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} className="text-sm" />
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => updateLine(i, 'amount', Number(e.target.value))} className="text-sm" />
                </div>
                <div className="col-span-3">
                  <select value={line.currency} onChange={(e) => updateLine(i, 'currency', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                    {['QAR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Cost Line
              </Button>
              <p className="text-sm font-semibold">Total: {formatCurrency(total, currency)}</p>
            </div>
          </div>

          <Separator />

          {/* Receival Selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Attach Receivals</p>
            {(receivals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No receivals found</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
                {(receivals ?? []).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedReceivalIds.includes(r.id)}
                      onChange={() => toggleReceival(r.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-mono">{r.receival_number}</span>
                    <span className="text-muted-foreground">— {r.purchase_orders?.supplier_name ?? 'Unknown'} · {formatDate(r.date)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createLc.isPending}>
              {createLc.isPending ? 'Creating…' : 'Create Landed Cost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LandedCostsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<LandedCost | null>(null)

  const { data: landedCosts, isLoading } = useLandedCosts({ search })

  const columns: ColumnDef<LandedCost>[] = [
    {
      accessorKey: 'lc_number',
      header: 'LC #',
      cell: ({ row }) => <span className="font-mono font-medium text-sm">{row.original.lc_number}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-sm">{row.original.description ?? '—'}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => <span className="text-sm font-medium">{formatCurrency(row.original.total_amount, row.original.currency)}</span>,
    },
    {
      id: 'receivals',
      header: 'Receivals',
      cell: ({ row }) => <span className="text-sm">{row.original.attached_receival_ids?.length ?? 0}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.voided_at ? 'destructive' : 'outline'}>
          {row.original.voided_at ? 'Voided' : 'Active'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View landed cost" onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <PageWrapper>
      <PageHeader
        title="Landed Costs"
        description="Allocate freight, customs and other costs to received goods"
        action={{ label: '+ Create Landed Cost', onClick: () => setCreateOpen(true) }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search LC number or description…" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={landedCosts ?? []} />
      )}

      <CreateLcDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LcDetailDialog lc={selected} onClose={() => setSelected(null)} />
    </PageWrapper>
  )
}
