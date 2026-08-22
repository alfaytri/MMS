'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReservedOrderLines } from '@/hooks/useInventory'
import { formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandVariantId: string | null
  variantLabel: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700' },
  partial_delivery: { label: 'Part. Delivered', className: 'bg-amber-100 text-amber-700' },
}

export function ReservedOrdersDialog({ open, onOpenChange, brandVariantId, variantLabel }: Props) {
  const { data: lines = [], isLoading } = useReservedOrderLines(open ? brandVariantId : null)

  const totalReserved = lines.reduce((sum, l) => sum + l.qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Reserved for — <span className="text-blue-600">{variantLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No active reservations found.</div>
        ) : (
          <>
            <div className="rounded border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] h-7 font-semibold">ORDER</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold">CUSTOMER</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">QTY</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">EXP. DELIVERY</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold">STATUS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const so = line.sale_orders
                    const statusMeta = so ? STATUS_LABEL[so.status] : undefined
                    return (
                      <TableRow key={line.id} className="text-xs">
                        <TableCell className="font-mono text-[11px] font-medium">{so?.so_number ?? '—'}</TableCell>
                        <TableCell>{so?.customers?.name ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium">{line.qty}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {so?.expected_delivery ? formatDate(so.expected_delivery) : '—'}
                        </TableCell>
                        <TableCell>
                          {statusMeta ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground text-right mt-1">
              Total reserved: <span className="font-semibold text-orange-700">{totalReserved}</span>
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
