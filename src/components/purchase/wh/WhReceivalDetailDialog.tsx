'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, Truck } from 'lucide-react'
import { ReceivalDelivery } from '@/hooks/useWarehouseOperations'
import { format } from 'date-fns'

interface Props {
  item: ReceivalDelivery | null
  onClose: () => void
}

export function WhReceivalDetailDialog({ item, onClose }: Props) {
  if (!item) return null
  const isInbound = item.direction === 'inbound'

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {item.docNumber}
            <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${isInbound ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              {isInbound ? <Package className="h-2.5 w-2.5" /> : <Truck className="h-2.5 w-2.5" />}
              {isInbound ? 'Receival' : 'Delivery'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Reference</p>
            <p className="font-medium">{item.reference || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Warehouse</p>
            <p className="font-medium">{item.warehouseName || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Date</p>
            <p className="font-medium">{item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{isInbound ? 'Supplier' : 'Customer'}</p>
            <p className="font-medium">{item.counterparty || '—'}</p>
          </div>
        </div>

        <div className="rounded-md border mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                    No items
                  </TableCell>
                </TableRow>
              ) : (
                item.items.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs">{i.name}</TableCell>
                    <TableCell className="text-xs text-primary">{i.sku || '—'}</TableCell>
                    <TableCell className="text-xs text-right">{i.qty}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
