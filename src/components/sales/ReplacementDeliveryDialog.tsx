'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useWarehouses } from '@/hooks/useWarehouses'
import { type SaleReturn } from '@/hooks/useSaleReturns'

interface ReplacementDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnData: SaleReturn
  soId: string
  onConfirm: (warehouseId: string, warehouseName: string) => void
  isPending: boolean
}

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, soId, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses = [] } = useWarehouses()

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Replacement — {returnData.return_number}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The following items will be sent as replacement. Items and quantities
          match the return exactly and cannot be changed.
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="w-20 text-center">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returnData.items.map((item, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="text-sm">{item.item_name}</div>
                  {item.sku && (
                    <div className="text-xs text-muted-foreground">{item.sku}</div>
                  )}
                </TableCell>
                <TableCell className="text-center">{item.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div>
          <label className="text-sm font-medium">Source Warehouse *</label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!warehouseId || isPending}
            onClick={() => onConfirm(warehouseId, selectedWarehouse?.name ?? '')}
          >
            {isPending ? 'Sending...' : 'Send Replacement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
