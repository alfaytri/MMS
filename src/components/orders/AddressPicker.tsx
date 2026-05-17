'use client'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Plus, Navigation } from 'lucide-react'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import { AddressCreationSheet } from './AddressCreationSheet'
import type { CustomerAddress } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  customerId: string
  phoneId: string
  selected: CustomerAddress | null
  onSelect: (address: CustomerAddress) => void
  className?: string
}

export function AddressPicker({ customerId, phoneId, selected, onSelect, className }: Props) {
  const { addresses, isLoading } = useCustomerAddresses(customerId)
  const [open, setOpen]         = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/mms-address')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when leaving the element itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData('application/mms-address')
    if (!raw) return
    try {
      const addr = JSON.parse(raw) as CustomerAddress
      onSelect(addr)
    } catch {
      // malformed payload — ignore
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-left text-sm transition-colors hover:border-slate-400 hover:bg-slate-50',
            selected && 'border-solid border-slate-200 bg-white',
            isDragOver && 'border-solid border-orange-400 bg-orange-50 ring-2 ring-orange-300 ring-offset-1',
            className
          )}
          render={(props) => (
            <button
              type="button"
              {...props}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <MapPin className={cn('h-4 w-4 shrink-0', isDragOver ? 'text-orange-500' : 'text-slate-400')} />
              {selected ? (
                <div>
                  <p className="font-medium text-slate-900">{selected.label ?? 'Address'}</p>
                  <p className="text-xs text-slate-500">{formatAddressLine(selected)}</p>
                </div>
              ) : (
                <span className={isDragOver ? 'text-orange-500 font-medium' : 'text-slate-400'}>
                  {isDragOver ? 'Release to set address' : 'Drop address here, or click to select'}
                </span>
              )}
            </button>
          )}
        />
        <PopoverContent className="w-80 p-2" align="start">
          {isLoading ? (
            <p className="p-2 text-sm text-slate-500">Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">No saved addresses</p>
          ) : (
            <div className="space-y-1">
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  onClick={() => { onSelect(addr); setOpen(false) }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50',
                    selected?.id === addr.id && 'bg-orange-50'
                  )}
                >
                  <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="font-medium">{addr.label ?? 'Address'}</p>
                    <p className="text-xs text-slate-500">{formatAddressLine(addr)}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    {addr.address_type === 'blue-plate' ? 'BP' : 'GPS'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 border-t pt-1">
            <button
              onClick={() => { setOpen(false); setSheetOpen(true) }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add New Address
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <AddressCreationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        customerId={customerId}
        phoneId={phoneId}
        onAdded={(addr) => { onSelect(addr); setSheetOpen(false) }}
      />
    </>
  )
}
