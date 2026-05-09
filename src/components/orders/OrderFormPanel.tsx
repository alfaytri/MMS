// src/components/orders/OrderFormPanel.tsx
'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CalendarIcon, CheckCircle } from 'lucide-react'
import { ServiceSelector } from './ServiceSelector'
import { SelectedServiceCard } from './SelectedServiceCard'
import { AddressPicker } from './AddressPicker'
import type { OrderDraft, OrderServiceDraft, CustomerAddress, OrderType } from '@/types/orders'

interface Props {
  draft: OrderDraft
  onTypeChange: (type: OrderType) => void
  onAddService: (s: OrderServiceDraft) => void
  onRemoveService: (id: string) => void
  onAddressSelect: (a: CustomerAddress) => void
  onUpdate: (patch: Partial<OrderDraft>) => void
  onSubmit: () => void
  isSubmitting: boolean
  isValid: boolean
}

export function OrderFormPanel({
  draft,
  onTypeChange,
  onAddService,
  onRemoveService,
  onAddressSelect,
  onUpdate,
  onSubmit,
  isSubmitting,
  isValid,
}: Props) {
  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r bg-white sm:w-[340px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Type toggle */}
        <Tabs value={draft.type} onValueChange={(v) => onTypeChange(v as OrderType)}>
          <TabsList className="w-full">
            <TabsTrigger value="order" className="flex-1">Order</TabsTrigger>
            <TabsTrigger value="site-visit" className="flex-1">Site Visit</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Services */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Requested Services
            </Label>
            {draft.services.length > 0 && (
              <span className="text-xs text-slate-400">{draft.services.length} selected</span>
            )}
          </div>
          {draft.type === 'order' && (
            <>
              <ServiceSelector onAdd={onAddService} />
              {draft.services.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {draft.services.map((s) => (
                    <SelectedServiceCard key={s.serviceId} service={s} onRemove={onRemoveService} />
                  ))}
                </div>
              )}
            </>
          )}
          {draft.type === 'site-visit' && (
            <p className="text-xs text-slate-400 mt-1">Site visit — no services required</p>
          )}
        </div>

        {/* Visit Date */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Visit Date
          </Label>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="date"
              value={draft.visitDate}
              onChange={(e) => onUpdate({ visitDate: e.target.value })}
              className="min-h-[44px] flex-1 text-sm outline-none sm:min-h-0"
            />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order Address
          </Label>
          {draft.customerId ? (
            <AddressPicker
              customerId={draft.customerId}
              phoneId={draft.phoneId}
              selected={draft.addressSnapshot}
              onSelect={(addr) => {
                onAddressSelect(addr)
                onUpdate({ addressId: addr.id, addressSnapshot: addr })
              }}
            />
          ) : (
            <p className="text-xs text-slate-400">Look up a customer first</p>
          )}
        </div>

        {/* Voucher */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Voucher Code
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="ENTER VOUCHER CODE"
              value={draft.voucherCode}
              onChange={(e) => onUpdate({ voucherCode: e.target.value })}
              className="h-9 flex-1 uppercase"
            />
            <Button variant="outline" size="sm" className="h-9 min-h-[44px] sm:min-h-0">
              Apply
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </Label>
          <Textarea
            placeholder="Add notes…"
            value={draft.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Total */}
        {draft.services.length > 0 && (
          <div className="rounded-md bg-slate-50 p-2 text-right">
            <span className="text-xs text-slate-500">Total: </span>
            <span className="font-semibold text-slate-900">
              QAR {draft.services.reduce((sum, s) => sum + s.price * s.qty, 0).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3">
        <Button
          className="w-full gap-2 min-h-[44px]"
          disabled={!isValid || isSubmitting}
          onClick={onSubmit}
        >
          <CheckCircle className="h-4 w-4" />
          {isSubmitting ? 'Confirming…' : 'Confirm Order'}
        </Button>
      </div>
    </div>
  )
}
