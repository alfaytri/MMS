'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmToolSerial, type ToolAssetUnit } from '@/hooks/useInventory'

type Props = {
  unit: ToolAssetUnit
  /** Full list of units for this same item — used for client-side duplicate detection. */
  siblingUnits: ToolAssetUnit[]
  onConfirmed?: () => void
  /** This row is shared between the serialized-tools table (which has a DIVISION
   *  column, Task 2b.4) and the PO-receiving serials step (which doesn't). Opt in
   *  so the two host tables' column counts stay independently correct. */
  showDivisionColumn?: boolean
  /** The serialized-tools table also shows a UNIT COST column; the PO-receiving
   *  serials step does not. Opt in so the two host tables' column counts match. */
  showCostColumn?: boolean
}

export function PlaceholderUnitRow({ unit, siblingUnits, onConfirmed, showDivisionColumn, showCostColumn }: Props) {
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState(unit.brand ?? '')
  const [expiry, setExpiry] = useState(unit.expiry ?? '')
  const confirm = useConfirmToolSerial()

  function handleConfirm() {
    const trimmedSerial = serial.trim()
    const trimmedBrand = brand.trim()
    if (!trimmedSerial) { toast.error('Serial number is required'); return }
    if (!trimmedBrand) { toast.error('Brand is required'); return }
    const duplicate = siblingUnits.some(
      (u) => u.id !== unit.id && (u.serial_number ?? '').trim().toLowerCase() === trimmedSerial.toLowerCase()
    )
    if (duplicate) { toast.error('Serial number already exists for this item'); return }
    confirm.mutate(
      {
        unit_id: unit.id,
        item_id: unit.item_id,
        serial: trimmedSerial,
        brand: trimmedBrand,
        expiry: expiry || null,
      },
      {
        onSuccess: () => { toast.success('Serial confirmed'); onConfirmed?.() },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <tr className="border-t border-border bg-amber-50/40 dark:bg-amber-950/10">
      <td className="py-1.5 px-2">
        <Input
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="Enter serial…"
          className="h-7 text-xs font-mono w-full min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}
        />
      </td>
      <td className="py-1.5 px-2">
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand"
          className="h-7 text-xs w-full min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}
        />
      </td>
      <td className="py-1.5 px-2 text-muted-foreground">—</td>
      <td className="py-1.5 px-2">
        <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          pending
        </span>
      </td>
      {showDivisionColumn && (
        <td className="py-1.5 px-2 text-muted-foreground">—</td>
      )}
      <td className="py-1.5 px-2">
        <Input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="h-7 text-xs w-full min-w-0"
        />
      </td>
      {showCostColumn && (
        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
          {unit.unit_cost != null
            ? unit.unit_cost.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '—'}
        </td>
      )}
      <td className="py-1.5 px-2 text-right">
        <Button
          size="sm"
          className="h-11 md:h-7 px-2 text-[11px]"
          disabled={confirm.isPending}
          onClick={handleConfirm}
        >
          <Check className="h-3 w-3 mr-1" />
          {confirm.isPending ? 'Saving…' : 'Confirm'}
        </Button>
      </td>
    </tr>
  )
}
