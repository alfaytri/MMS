'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateToolAssetUnit, type ToolAssetUnit } from '@/hooks/useInventory'

type Props = {
  unit: ToolAssetUnit
  /** Full list of units for this same item — used for client-side duplicate detection. */
  siblingUnits: ToolAssetUnit[]
  onConfirmed?: () => void
}

export function PlaceholderUnitRow({ unit, siblingUnits, onConfirmed }: Props) {
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState(unit.brand ?? '')
  const [expiry, setExpiry] = useState(unit.expiry ?? '')
  const update = useUpdateToolAssetUnit()

  function handleConfirm() {
    const trimmedSerial = serial.trim()
    const trimmedBrand = brand.trim()
    if (!trimmedSerial) { toast.error('Serial number is required'); return }
    if (!trimmedBrand) { toast.error('Brand is required'); return }
    const duplicate = siblingUnits.some(
      (u) => u.id !== unit.id && (u.serial_number ?? '').trim().toLowerCase() === trimmedSerial.toLowerCase()
    )
    if (duplicate) { toast.error('Serial number already exists for this item'); return }
    update.mutate(
      {
        id: unit.id,
        item_id: unit.item_id,
        serial_number: trimmedSerial,
        brand: trimmedBrand,
        expiry: expiry || null,
        is_placeholder: false,
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
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          pending serial
        </span>
      </td>
      <td className="py-1.5 px-2">
        <Input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="h-7 text-xs w-full min-w-0"
        />
      </td>
      <td className="py-1.5 px-2 text-right">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={update.isPending}
          onClick={handleConfirm}
        >
          <Check className="h-3 w-3 mr-1" />
          {update.isPending ? 'Saving…' : 'Confirm'}
        </Button>
      </td>
    </tr>
  )
}
